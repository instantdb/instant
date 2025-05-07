\set ON_ERROR_STOP on
BEGIN;

-- Create the new root app
SELECT gen_random_uuid() AS new_app_id  \gset

INSERT INTO apps (id, creator_id, title)
SELECT  :'new_app_id',
        CASE
          WHEN NULLIF(:'creator_email', '') IS NULL        -- no email supplied
          THEN creator_id                                  -- keep original creator
          ELSE (
            SELECT id
            FROM   instant_users
            WHERE  email = :'creator_email'                -- use supplied email
          )
        END,
        COALESCE(NULLIF(:'new_title', ''), title || ' (clone)')
FROM    apps
WHERE   id = :'old_app_id';

-- Build mapping tables
CREATE TEMP TABLE ident_map ON COMMIT DROP AS
SELECT id AS old_id, gen_random_uuid() AS new_id
FROM   idents
WHERE  app_id = :'old_app_id';

CREATE TEMP TABLE attr_map  ON COMMIT DROP AS
SELECT id AS old_id, gen_random_uuid() AS new_id
FROM   attrs
WHERE  app_id = :'old_app_id';

-- Clone rules
INSERT INTO rules (app_id, code)
SELECT :'new_app_id', r.code
FROM   rules r
WHERE  r.app_id = :'old_app_id';

-- Clone attrs
INSERT INTO attrs (
    id, app_id, value_type, cardinality, is_unique, is_indexed,
    forward_ident, reverse_ident,
    inferred_types, on_delete,
    checked_data_type, checking_data_type,
    indexing, setting_unique, on_delete_reverse, is_required
)
SELECT
    am.new_id,
    :'new_app_id',
    a.value_type, a.cardinality, a.is_unique, a.is_indexed,
    im_fwd.new_id,
    im_rev.new_id,
    a.inferred_types, a.on_delete,
    a.checked_data_type, a.checking_data_type,
    a.indexing, a.setting_unique, a.on_delete_reverse, a.is_required
FROM   attrs a
JOIN   attr_map  am       ON am.old_id = a.id
JOIN   ident_map im_fwd   ON im_fwd.old_id = a.forward_ident
LEFT  JOIN ident_map im_rev ON im_rev.old_id = a.reverse_ident
WHERE  a.app_id = :'old_app_id';

-- Clone idents
INSERT INTO idents (id, app_id, attr_id, etype, label)
SELECT
    im.new_id,
    :'new_app_id',
    am.new_id,
    i.etype,
    i.label
FROM   idents i
JOIN   ident_map im ON im.old_id = i.id
JOIN   attr_map  am ON am.old_id = i.attr_id
WHERE  i.app_id = :'old_app_id';

-- Clone triples
INSERT INTO triples (
    app_id, entity_id, attr_id,
    value, value_md5,
    ea, eav, av, ave, vae,
    created_at, checked_data_type
)
SELECT
    :'new_app_id',
    t.entity_id,
    COALESCE(am_attr.new_id, t.attr_id),
    t.value,
    t.value_md5,
    t.ea, t.eav, t.av, t.ave, t.vae,
    t.created_at,
    t.checked_data_type
FROM   triples t
LEFT  JOIN attr_map am_attr ON am_attr.old_id = t.attr_id
WHERE  t.app_id = :'old_app_id';

-- Add a new admin token
INSERT INTO app_admin_tokens (app_id, token)
VALUES (:'new_app_id', gen_random_uuid());

COMMIT;

-- Bubble the new UUID back to whatever wrapper script invoked us
\echo :new_app_id
