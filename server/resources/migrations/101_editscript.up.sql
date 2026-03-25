-- Editscript implementation in SQL
-- Based on https://github.com/juji-io/editscript (quick algorithm)
-- Supports forward diff and undo for jsonb data.

-- Helper: insert an element into a jsonb array at a given index
create or replace function editscript_array_insert(arr jsonb, idx int, val jsonb)
returns jsonb
language plpgsql immutable as $$
declare
  result jsonb := '[]'::jsonb;
  arr_len int := jsonb_array_length(arr);
  i int;
begin
  for i in 0..arr_len - 1 loop
    if i = idx then
      result := result || jsonb_build_array(val);
    end if;
    result := result || jsonb_build_array(arr -> i);
  end loop;
  if idx >= arr_len then
    result := result || jsonb_build_array(val);
  end if;
  return result;
end;
$$;

-- Wu O(NP) vector edit algorithm + min+plus->replace.
-- Returns a jsonb array of ops: integers (match count), "-", "+", "r".
-- Based on vec-edits and min+plus->replace from editscript.util.common.
create or replace function editscript_vec_edits(a jsonb, b jsonb)
returns jsonb
language plpgsql immutable as $$
declare
  n int := jsonb_array_length(a);
  m int := jsonb_array_length(b);
  swapped boolean := false;
  tmp jsonb;
  tmp_int int;
  delta int;
  fp_size int;
  fp_offset int;
  fp_x int[];
  fp_ops jsonb[];
  p int;
  k int;
  idx int;
  dk_m1 int;
  dk_p1 int;
  x int;
  y int;
  snake_start int;
  cur_ops jsonb;
  tmp_ops jsonb;
  raw_ops jsonb;
  -- min+plus->replace variables
  result_ops jsonb := '[]'::jsonb;
  i int;
  op_val jsonb;
  first_op jsonb;
  mc int;
  pc int;
  abs_delta int;
  rs_count int;
  grp_start int;
begin
  -- Wu requires n >= m; swap if needed
  if n < m then
    tmp := a; a := b; b := tmp;
    tmp_int := n; n := m; m := tmp_int;
    swapped := true;
  end if;

  delta := n - m;
  fp_size := m + n + 3;
  fp_offset := m + 2; -- index = k + fp_offset (1-based, handles k = -(m+1))

  fp_x := array_fill(-1, ARRAY[fp_size]);
  fp_ops := array_fill('[]'::jsonb, ARRAY[fp_size]);

  p := 0;
  loop
    -- Diagonals -p to delta-1
    for k in (-p)..(delta - 1) loop
      idx := k + fp_offset;
      dk_m1 := fp_x[k - 1 + fp_offset] + 1;
      dk_p1 := fp_x[k + 1 + fp_offset];
      if dk_m1 > dk_p1 then
        x := dk_m1;
        cur_ops := fp_ops[k - 1 + fp_offset] || '"-"'::jsonb;
      else
        x := dk_p1;
        cur_ops := fp_ops[k + 1 + fp_offset] || '"+"'::jsonb;
      end if;
      y := x - k;
      snake_start := x;
      while x < n and y < m and (a -> x) = (b -> y) loop
        x := x + 1; y := y + 1;
      end loop;
      if x > snake_start then
        cur_ops := cur_ops || to_jsonb(x - snake_start);
      end if;
      fp_x[idx] := x;
      fp_ops[idx] := cur_ops;
    end loop;

    -- Diagonals delta+p down to delta+1
    for k in REVERSE (delta + p)..(delta + 1) loop
      idx := k + fp_offset;
      dk_m1 := fp_x[k - 1 + fp_offset] + 1;
      dk_p1 := fp_x[k + 1 + fp_offset];
      if dk_m1 > dk_p1 then
        x := dk_m1;
        cur_ops := fp_ops[k - 1 + fp_offset] || '"-"'::jsonb;
      else
        x := dk_p1;
        cur_ops := fp_ops[k + 1 + fp_offset] || '"+"'::jsonb;
      end if;
      y := x - k;
      snake_start := x;
      while x < n and y < m and (a -> x) = (b -> y) loop
        x := x + 1; y := y + 1;
      end loop;
      if x > snake_start then
        cur_ops := cur_ops || to_jsonb(x - snake_start);
      end if;
      fp_x[idx] := x;
      fp_ops[idx] := cur_ops;
    end loop;

    -- Diagonal delta
    k := delta;
    idx := k + fp_offset;
    dk_m1 := fp_x[k - 1 + fp_offset] + 1;
    dk_p1 := fp_x[k + 1 + fp_offset];
    if dk_m1 > dk_p1 then
      x := dk_m1;
      cur_ops := fp_ops[k - 1 + fp_offset] || '"-"'::jsonb;
    else
      x := dk_p1;
      cur_ops := fp_ops[k + 1 + fp_offset] || '"+"'::jsonb;
    end if;
    y := x - k;
    snake_start := x;
    while x < n and y < m and (a -> x) = (b -> y) loop
      x := x + 1; y := y + 1;
    end loop;
    if x > snake_start then
      cur_ops := cur_ops || to_jsonb(x - snake_start);
    end if;
    fp_x[idx] := x;
    fp_ops[idx] := cur_ops;

    -- Check termination
    if fp_x[delta + fp_offset] >= n then
      -- Drop the first op (spurious - or + from initialization)
      tmp_ops := fp_ops[delta + fp_offset];
      raw_ops := '[]'::jsonb;
      for i in 1..jsonb_array_length(tmp_ops) - 1 loop
        raw_ops := raw_ops || (tmp_ops -> i);
      end loop;
      exit;
    end if;

    p := p + 1;
  end loop;

  -- If we swapped a and b, swap the ops: - <-> +
  if swapped then
    tmp_ops := '[]'::jsonb;
    for i in 0..jsonb_array_length(raw_ops) - 1 loop
      op_val := raw_ops -> i;
      if op_val = '"-"'::jsonb then
        tmp_ops := tmp_ops || '"+"'::jsonb;
      elsif op_val = '"+"'::jsonb then
        tmp_ops := tmp_ops || '"-"'::jsonb;
      else
        tmp_ops := tmp_ops || op_val;
      end if;
    end loop;
    raw_ops := tmp_ops;
  end if;

  -- min+plus->replace: convert adjacent -/+ pairs into r
  -- Equivalent to editscript.util.common/min+plus->replace
  i := 0;
  while i < jsonb_array_length(raw_ops) loop
    op_val := raw_ops -> i;

    if jsonb_typeof(op_val) = 'number' then
      -- Match count: pass through
      result_ops := result_ops || op_val;
      i := i + 1;
    else
      -- Collect consecutive non-integer ops
      grp_start := i;
      while i < jsonb_array_length(raw_ops) and jsonb_typeof(raw_ops -> i) != 'number' loop
        i := i + 1;
      end loop;

      if i - grp_start = 1 then
        -- Single op: pass through
        result_ops := result_ops || (raw_ops -> grp_start);
      else
        -- Count leading ops of the first type (split-with)
        first_op := raw_ops -> grp_start;
        mc := 0;
        for j in grp_start..i - 1 loop
          if (raw_ops -> j) = first_op then
            mc := mc + 1;
          else
            exit;
          end if;
        end loop;
        pc := (i - grp_start) - mc;

        abs_delta := abs(mc - pc);
        rs_count := greatest(mc, pc) - abs_delta;

        if mc < pc then
          -- More of the other type: r's first, then remaining other
          for j in 1..rs_count loop
            result_ops := result_ops || '"r"'::jsonb;
          end loop;
          for j in 1..abs_delta loop
            if first_op = '"-"'::jsonb then
              result_ops := result_ops || '"+"'::jsonb;
            else
              result_ops := result_ops || '"-"'::jsonb;
            end if;
          end loop;
        elsif mc = pc then
          -- Equal: all r
          for j in 1..rs_count loop
            result_ops := result_ops || '"r"'::jsonb;
          end loop;
        else
          -- More of first type: remaining first, then r's
          for j in 1..abs_delta loop
            result_ops := result_ops || first_op;
          end loop;
          for j in 1..rs_count loop
            result_ops := result_ops || '"r"'::jsonb;
          end loop;
        end if;
      end if;
    end if;
  end loop;

  return result_ops;
end;
$$;

-- Generate editscript (forward): produces edits to transform old_data -> new_data.
-- Uses Wu O(NP) diff for arrays (same algorithm as editscript's quick diff).
-- Edit format: [[path, op, ?value], ...] where op is "+", "-", or "r".
create or replace function generate_editscript_edits(
  old_data jsonb,
  new_data jsonb,
  path jsonb default '[]'::jsonb)
returns jsonb
language plpgsql as $$
declare
  edits jsonb := '[]'::jsonb;
  key text;
  old_val jsonb;
  new_val jsonb;
  child_edits jsonb;
  old_len int;
  new_len int;
  -- Wu diff-vec variables
  vec_ops jsonb;
  op_val jsonb;
  ia int;   -- index into old array
  ia2 int;  -- current index in evolving array
  ib int;   -- index into new array
  i int;
  n_int int;
begin
  -- Handle SQL NULLs (distinct from JSON null)
  if old_data is null and new_data is null then
    return edits;
  end if;
  if old_data is null then
    return jsonb_build_array(jsonb_build_array(path, '+', new_data));
  end if;
  if new_data is null then
    return jsonb_build_array(jsonb_build_array(path, '-'));
  end if;

  -- Both non-null; check deep equality
  if old_data = new_data then
    return edits;
  end if;

  -- Different types -> replace
  if jsonb_typeof(old_data) != jsonb_typeof(new_data) then
    return jsonb_build_array(jsonb_build_array(path, 'r', new_data));
  end if;

  -- Objects: key-by-key comparison with recursion
  if jsonb_typeof(old_data) = 'object' then
    -- Keys in old
    for key, old_val in select * from jsonb_each(old_data) loop
      if not new_data ? key then
        edits := edits || jsonb_build_array(jsonb_build_array(path || to_jsonb(key), '-'));
      else
        new_val := new_data -> key;
        if old_val is distinct from new_val then
          child_edits := generate_editscript_edits(old_val, new_val, path || to_jsonb(key));
          edits := edits || child_edits;
        end if;
      end if;
    end loop;

    -- Keys only in new (added)
    for key in select * from jsonb_object_keys(new_data) loop
      if not old_data ? key then
        edits := edits || jsonb_build_array(
          jsonb_build_array(path || to_jsonb(key), '+', new_data -> key));
      end if;
    end loop;

    return edits;
  end if;

  -- Arrays: Wu O(NP) diff (same as editscript quick)
  if jsonb_typeof(old_data) = 'array' then
    old_len := jsonb_array_length(old_data);
    new_len := jsonb_array_length(new_data);

    -- For very large arrays, fall back to full replacement
    if old_len > 1000 or new_len > 1000 then
      return jsonb_build_array(jsonb_build_array(path, 'r', new_data));
    end if;

    -- Handle empty arrays
    if old_len = 0 or new_len = 0 then
      return jsonb_build_array(jsonb_build_array(path, 'r', new_data));
    end if;

    -- Get Wu edit ops
    vec_ops := editscript_vec_edits(old_data, new_data);

    -- Process ops like editscript's diff-vec:
    -- ia  = index into old array (a)
    -- ia2 = current index in evolving array (accounts for inserts/deletes)
    -- ib  = index into new array (b)
    ia := 0; ia2 := 0; ib := 0;

    for i in 0..jsonb_array_length(vec_ops) - 1 loop
      op_val := vec_ops -> i;

      if jsonb_typeof(op_val) = 'number' then
        -- Match: skip n elements
        n_int := op_val::int;
        ia := ia + n_int;
        ia2 := ia2 + n_int;
        ib := ib + n_int;

      elsif op_val = '"-"'::jsonb then
        -- Delete old[ia] at current position ia2
        edits := edits || jsonb_build_array(
          jsonb_build_array(path || to_jsonb(ia2), '-'));
        ia := ia + 1;
        -- ia2 stays (deletion shifts left)

      elsif op_val = '"+"'::jsonb then
        -- Insert new[ib] at current position ia2
        edits := edits || jsonb_build_array(
          jsonb_build_array(path || to_jsonb(ia2), '+', new_data -> ib));
        ia2 := ia2 + 1;
        ib := ib + 1;

      elsif op_val = '"r"'::jsonb then
        -- Replace: recursively diff old[ia] and new[ib]
        child_edits := generate_editscript_edits(
          old_data -> ia, new_data -> ib, path || to_jsonb(ia2));
        edits := edits || child_edits;
        ia := ia + 1;
        ia2 := ia2 + 1;
        ib := ib + 1;
      end if;
    end loop;

    return edits;
  end if;

  -- Scalars (string, number, boolean, json-null) - already checked equality
  return jsonb_build_array(jsonb_build_array(path, 'r', new_data));
end;
$$;

-- Apply an editscript to a target, returning the modified result.
create or replace function editscript_patch(target jsonb, script jsonb)
returns jsonb
language plpgsql as $$
declare
  edit jsonb;
  path_json jsonb;
  op text;
  val jsonb;
  path_arr text[];
  parent_path text[];
  last_key text;
  parent jsonb;
  modified jsonb;
  idx int;
begin
  for edit in select * from jsonb_array_elements(script) loop
    path_json := edit -> 0;
    op := edit ->> 1;
    val := edit -> 2;
    path_arr := ARRAY(select jsonb_array_elements_text(path_json));

    -- Root-level operation (empty path)
    if array_length(path_arr, 1) is null then
      case op
        when 'r', '+' then target := val;
        when '-' then target := null;
      end case;
      continue;
    end if;

    if op = 'r' then
      target := jsonb_set(target, path_arr, val, true);
    elsif op = '-' then
      target := target #- path_arr;
    elsif op = '+' then
      -- Need to distinguish object add vs array insert
      if array_length(path_arr, 1) = 1 then
        parent := target;
        last_key := path_arr[1];
      else
        parent_path := path_arr[1:array_length(path_arr, 1) - 1];
        parent := target #> parent_path;
        last_key := path_arr[array_length(path_arr, 1)];
      end if;

      if jsonb_typeof(parent) = 'array' then
        -- Array insertion
        idx := last_key::int;
        modified := editscript_array_insert(parent, idx, val);
        if array_length(path_arr, 1) = 1 then
          target := modified;
        else
          target := jsonb_set(target, parent_path, modified);
        end if;
      else
        -- Object: add key
        target := jsonb_set(target, path_arr, val, true);
      end if;
    end if;
  end loop;

  return target;
end;
$$;
