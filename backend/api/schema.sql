-- users: username-based auth with admin and permission flags
CREATE TABLE IF NOT EXISTS users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  username TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now(),
  is_admin BOOLEAN DEFAULT false NOT NULL,
  is_active BOOLEAN DEFAULT true NOT NULL,
  can_access_dashboard BOOLEAN DEFAULT true NOT NULL,
  can_register BOOLEAN DEFAULT true NOT NULL,
  can_edit_own_profile BOOLEAN DEFAULT false NOT NULL
);

-- app_data: key-value store per user (replaces localStorage)
CREATE TABLE IF NOT EXISTS app_data (
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  key TEXT NOT NULL,
  value JSONB NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT now(),
  PRIMARY KEY (user_id, key)
);

CREATE INDEX IF NOT EXISTS idx_app_data_user ON app_data(user_id);

-- user_activity: log for admin
CREATE TABLE IF NOT EXISTS user_activity (
  id SERIAL PRIMARY KEY,
  user_id UUID REFERENCES users(id),
  username TEXT NOT NULL,
  route TEXT NOT NULL,
  method TEXT NOT NULL,
  timestamp TIMESTAMPTZ DEFAULT now() NOT NULL,
  ip_address TEXT
);

CREATE INDEX IF NOT EXISTS idx_user_activity_timestamp ON user_activity(timestamp DESC);

-- emergency_logout: single row, generation incremented to invalidate all non-admin sessions
CREATE TABLE IF NOT EXISTS emergency_logout (
  id INTEGER PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  generation INTEGER NOT NULL DEFAULT 0
);

INSERT INTO emergency_logout (id, generation) VALUES (1, 0) ON CONFLICT (id) DO NOTHING;

-- system_settings: key-value for maintenance_mode, announcement, etc.
CREATE TABLE IF NOT EXISTS system_settings (
  key TEXT PRIMARY KEY,
  value JSONB NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- login_attempts: audit log for login success/failure
CREATE TABLE IF NOT EXISTS login_attempts (
  id SERIAL PRIMARY KEY,
  username TEXT,
  success BOOLEAN NOT NULL,
  ip_address TEXT,
  timestamp TIMESTAMPTZ DEFAULT now() NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_login_attempts_timestamp ON login_attempts(timestamp DESC);
