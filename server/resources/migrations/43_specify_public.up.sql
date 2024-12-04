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
