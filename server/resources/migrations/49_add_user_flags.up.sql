CREATE TABLE user_flags (
    id UUID PRIMARY KEY,
    user_id UUID NOT NULL REFERENCES instant_users(id) ON DELETE CASCADE,
    flag_name TEXT NOT NULL,
    created_at TIMESTAMP NOT NULL DEFAULT now(),
    UNIQUE (user_id, flag_name)
);
