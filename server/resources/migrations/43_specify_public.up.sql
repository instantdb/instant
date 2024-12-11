CREATE OR REPLACE FUNCTION public.is_jsonb_valid_datestring(value jsonb) RETURNS boolean
    LANGUAGE plpgsql IMMUTABLE
    AS $$
  declare
    timestamp_check timestamp with time zone;
    valid boolean;
  begin
    begin
      if jsonb_typeof(value) = 'string' then
        timestamp_check := public.triples_extract_date_value(value);
        valid := true;
      else
        valid := false;
      end if;
    exception when others then
      valid := false;
    end;

    return valid;
  end;
$$;


CREATE OR REPLACE FUNCTION public.is_jsonb_valid_timestamp(value jsonb) RETURNS boolean
    LANGUAGE plpgsql IMMUTABLE
    AS $$
  declare
    timestamp_check timestamp with time zone;
    valid boolean;
  begin
    begin
      if (jsonb_typeof(value) = 'number') then
        timestamp_check := public.triples_extract_date_value(value);
        valid := true;
      else
        valid := false;
      end if;

    exception when others then
      valid := false;
    end;

    return valid;
  end;
$$;

CREATE OR REPLACE FUNCTION public.jsonb_deep_merge(obj1 jsonb, obj2 jsonb) RETURNS jsonb
    LANGUAGE plpgsql IMMUTABLE
    AS $$
declare
    key text;
    value jsonb;
begin
        if
          obj1 isnull
          or obj2 isnull
          or jsonb_typeof(obj1) != 'object'
          or jsonb_typeof(obj2) != 'object'
        then
          return obj2;
        end if;

    -- iterate over each key in obj2
    for key, value in select * from jsonb_each(obj2) loop
      obj1 := case
        -- check if the key exists in obj1 and if both values are objects
        when obj1 ? key and jsonb_typeof(obj1->key) = 'object' and jsonb_typeof(value) = 'object'
          -- merge the nested objects
          then jsonb_set(obj1, array[key], public.jsonb_deep_merge(obj1->key, value))
        -- handle null case
        when jsonb_typeof(value) = 'null'
          then obj1 - key
        else
          -- set the value from obj2 to obj1
          jsonb_set(obj1, array[key], value)
      end;
    end loop;

    return obj1;
end;
$$;


CREATE OR REPLACE FUNCTION public.jsonb_deep_merge_many(base jsonb, objs jsonb) RETURNS jsonb
    LANGUAGE plpgsql
    AS $$
  declare
    accum jsonb;
    idx int;
  begin
    accum := base;
    idx := 0;
    -- loops over the array of objects
    -- and deep-merges them into the accumulator
    while idx < jsonb_array_length(objs) loop
      accum := public.jsonb_deep_merge(accum, objs->idx);
      idx := idx + 1;
    end loop;
    return accum;
  end;
$$;

CREATE OR REPLACE FUNCTION public.triples_valid_value(data_type public.checked_data_type, value jsonb) RETURNS boolean
    LANGUAGE plpgsql IMMUTABLE
    AS $$
  begin
    case data_type
      when 'string' then
        return jsonb_typeof(value) in ('string', 'null');
      when 'number' then
        return jsonb_typeof(value) in ('number', 'null');
      when 'boolean' then
        return jsonb_typeof(value) in ('boolean', 'null');
      when 'date' then
        case jsonb_typeof(value)
          when 'null' then
            return true;
          when 'number' then
            return public.is_jsonb_valid_timestamp(value);
          when 'string' then
            return public.is_jsonb_valid_datestring(value);
          else
            return false;
        end case;
      else
        return data_type is null;
    end case;
  end;
$$;
