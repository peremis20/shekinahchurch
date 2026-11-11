-- Changes the "api" function needs on top of the existing Shekinah database. All of them only ADD things.
ALTER TABLE admins ADD COLUMN IF NOT EXISTS title text;          -- preset shown on the Team page (admin, pastor, elder, clerk, staff, editor, leader, volunteer)
ALTER TABLE admins ADD COLUMN IF NOT EXISTS perms jsonb;         -- per person changes on top of the preset; NULL means the preset as is
CREATE TABLE IF NOT EXISTS rate_events (key text NOT NULL, at timestamptz NOT NULL DEFAULT now());
CREATE INDEX IF NOT EXISTS rate_events_key_at ON rate_events (key, at);
-- Shared secret between the api and welcome functions for sending mail. Made in the database so it is never typed or shown.
INSERT INTO automation_status (key, value, updated_at) VALUES ('mail_relay_key', replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', ''), now()) ON CONFLICT (key) DO NOTHING;
