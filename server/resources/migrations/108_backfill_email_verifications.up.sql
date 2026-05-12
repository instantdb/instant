INSERT INTO app_email_verifications (id, app_id, sender_id, verified)
SELECT
    gen_random_uuid(),
    app_id,
    sender_id,
    true
FROM app_email_templates
WHERE sender_id IS NOT NULL
ON CONFLICT DO NOTHING
