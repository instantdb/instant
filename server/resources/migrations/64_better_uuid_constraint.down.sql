alter table triples drop constraint valid_ref_value;

drop function public.triples_extract_uuid_value(value jsonb);

drop function public.triples_valid_ref_value(t public.triples);
