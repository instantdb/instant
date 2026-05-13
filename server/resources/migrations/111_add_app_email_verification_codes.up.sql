CREATE TABLE app_email_verification_codes (
    id UUID PRIMARY KEY,
    code text NOT NULL,
    verification_id UUID NOT NULL references app_email_verifications(id) on delete cascade,
    created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

create trigger update_updated_at_trigger
before update on app_email_verification_codes
for each row
execute function update_updated_at_column();
