-- Had the wrong return type
drop function triples_extract_boolean_value;

create or replace function triples_extract_boolean_value(value jsonb)
returns boolean as $$
  begin
    if jsonb_typeof(value) = 'boolean' then
      return (value->>0)::boolean;
    else
      return null;
    end if;
  end;
$$ language plpgsql immutable;
