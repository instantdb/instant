CREATE TABLE app_email_verification_codes (
    id UUID PRIMARY KEY,
    code text NOT NULL,
    app_id UUID NOT NULL references apps(id) on delete cascade,
    verification_id UUID NOT NULL references app_email_verifications(id) on delete cascade,
    created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX ON app_email_verification_codes (app_id);
CREATE INDEX ON app_email_verification_codes (verification_id);
