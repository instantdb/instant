create or replace
function jsonb_deep_merge_many(base jsonb, objs jsonb) 
returns jsonb language plpgsql as $$
  declare
    accum jsonb;
    idx int;
  begin
    accum := base;
    idx := 0;
    -- loops over the array of objects
    -- and deep-merges them into the accumulator
    while idx < jsonb_array_length(objs) loop
      accum := jsonb_deep_merge(accum, objs->idx);
      idx := idx + 1;
    end loop;
    return accum;
  end;
$$;

-- expects two jsonb *objects*
-- `jsonb_deep_merge_many` ensures we don't pass non-object jsonb values into this function
create or replace function jsonb_deep_merge(obj1 jsonb, obj2 jsonb)
returns jsonb language plpgsql immutable as $$
declare
    key text;
    value jsonb;
begin
	if
	  obj1 isnull
	  or obj2 isnull
	  or jsonb_typeof(obj1) != 'object'
	  or jsonb_typeof(obj2) != 'object'
	  or obj2 = '{}'::jsonb
	then
	  return obj2;
	end if;
	
    -- iterate over each key in obj2
    for key, value in select * from jsonb_each(obj2) loop
      obj1 := case
        -- check if the key exists in obj1 and if both values are objects
        when obj1 ? key and jsonb_typeof(obj1->key) = 'object' and jsonb_typeof(value) = 'object'
          -- merge the nested objects
          then jsonb_set(obj1, array[key], jsonb_deep_merge(obj1->key, value))
        else
          -- set the value from obj2 to obj1
          jsonb_set(obj1, array[key], value)
      end;
    end loop;
    
    return obj1;
end;
$$;

-- utility to throw an exception with a message in a select statement
create or replace
function raise_exception_message(message text)
returns boolean as $$
  begin
    raise exception '%', message using constraint = message;
    return false;
  end;
$$ language plpgsql;