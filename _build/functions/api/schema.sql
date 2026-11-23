-- Changes the "api" function needs on top of the existing Shekinah database. All of them only ADD things.
ALTER TABLE admins ADD COLUMN IF NOT EXISTS title text;          -- preset shown on the Team page (admin, pastor, elder, clerk, staff, editor, leader, volunteer)
ALTER TABLE admins ADD COLUMN IF NOT EXISTS perms jsonb;         -- per person changes on top of the preset; NULL means the preset as is
CREATE TABLE IF NOT EXISTS rate_events (key text NOT NULL, at timestamptz NOT NULL DEFAULT now());
CREATE INDEX IF NOT EXISTS rate_events_key_at ON rate_events (key, at);
-- Shared secret between the api and welcome functions for sending mail. Made in the database so it is never typed or shown.
INSERT INTO automation_status (key, value, updated_at) VALUES ('mail_relay_key', replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', ''), now()) ON CONFLICT (key) DO NOTHING;
-- Church calendar inside the admin: events and tasks.
CREATE TABLE IF NOT EXISTS cal_events (id bigserial PRIMARY KEY, title text NOT NULL, starts_on date NOT NULL, ends_on date, start_time text, end_time text, location text NOT NULL DEFAULT '', details text NOT NULL DEFAULT '', category text NOT NULL DEFAULT 'Other', is_public boolean NOT NULL DEFAULT true, created_by text, updated_by text, created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now());
CREATE INDEX IF NOT EXISTS cal_events_starts_on ON cal_events (starts_on);
ALTER TABLE cal_events ADD COLUMN IF NOT EXISTS color text;
CREATE TABLE IF NOT EXISTS cal_tasks (id bigserial PRIMARY KEY, title text NOT NULL, due_on date, assigned_to text, event_id bigint REFERENCES cal_events(id) ON DELETE SET NULL, done boolean NOT NULL DEFAULT false, notes text NOT NULL DEFAULT '', created_by text, updated_by text, created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now());
-- Church projects and their costs (admin Projects page, Jimmy Nov 16, 2026).
CREATE TABLE IF NOT EXISTS projects (id bigserial PRIMARY KEY, name text NOT NULL, dept text NOT NULL DEFAULT '', purpose text NOT NULL DEFAULT '', cost numeric(12,2) NOT NULL DEFAULT 0, created_by text, updated_by text, created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now());
ALTER TABLE projects ADD COLUMN IF NOT EXISTS actual_cost numeric(12,2) NOT NULL DEFAULT 0;  -- cost is the estimated cost
ALTER TABLE projects ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'Planned';
ALTER TABLE projects ADD COLUMN IF NOT EXISTS progress integer NOT NULL DEFAULT 0;

-- likes on Kreyol studies and blog posts (Nov 17, 2026)
CREATE TABLE IF NOT EXISTS page_likes (page text PRIMARY KEY, n integer NOT NULL DEFAULT 0, updated_at timestamptz NOT NULL DEFAULT now());

-- full name shown on the Team page and used in the invite (Nov 19, 2026)
ALTER TABLE admins ADD COLUMN IF NOT EXISTS full_name text;
ALTER TABLE admins ADD COLUMN IF NOT EXISTS suspended_at timestamptz; -- set while someone is suspended: no sign in, no sessions
ALTER TABLE cal_events ADD COLUMN IF NOT EXISTS repeat text NOT NULL DEFAULT 'none';   -- none, weekly, monthly, yearly
ALTER TABLE cal_events ADD COLUMN IF NOT EXISTS repeat_until date;
ALTER TABLE cal_events ADD COLUMN IF NOT EXISTS invitees jsonb NOT NULL DEFAULT '[]'::jsonb;  -- emails invited to the meeting
ALTER TABLE cal_events ADD COLUMN IF NOT EXISTS remind boolean NOT NULL DEFAULT false;        -- reminder emails 30, 15, 5 and 1 minute before
CREATE TABLE IF NOT EXISTS cal_reminders (event_id bigint NOT NULL REFERENCES cal_events(id) ON DELETE CASCADE, occurs_on date NOT NULL, minutes integer NOT NULL, send_at timestamptz NOT NULL, resend_id text, status text NOT NULL DEFAULT '', created_at timestamptz NOT NULL DEFAULT now(), PRIMARY KEY (event_id, occurs_on, minutes));
ALTER TABLE projects ADD COLUMN IF NOT EXISTS start_on date; -- project start and end dates (Jimmy, Nov 23, 2026)
ALTER TABLE projects ADD COLUMN IF NOT EXISTS end_on date;
ALTER TABLE projects ADD COLUMN IF NOT EXISTS approval text NOT NULL DEFAULT 'Waiting'; -- board approval: Waiting, Approved, Not approved (Jimmy, Nov 23, 2026)
ALTER TABLE projects ADD COLUMN IF NOT EXISTS approval_by text;
ALTER TABLE projects ADD COLUMN IF NOT EXISTS approval_on date;
