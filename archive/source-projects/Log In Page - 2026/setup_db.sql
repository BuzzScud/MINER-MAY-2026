-- Create database (run manually if needed): createdb login_db

CREATE TABLE IF NOT EXISTS users (
    id SERIAL PRIMARY KEY,
    username VARCHAR(255) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    is_active BOOLEAN DEFAULT TRUE NOT NULL,
    can_access_dashboard BOOLEAN DEFAULT TRUE NOT NULL,
    can_register BOOLEAN DEFAULT TRUE NOT NULL,
    can_edit_own_profile BOOLEAN DEFAULT FALSE NOT NULL
);

CREATE TABLE IF NOT EXISTS user_activity (
    id SERIAL PRIMARY KEY,
    user_id INTEGER REFERENCES users(id),
    username VARCHAR(255) NOT NULL,
    route VARCHAR(512) NOT NULL,
    method VARCHAR(10) NOT NULL,
    timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL,
    ip_address VARCHAR(45)
);

CREATE TABLE IF NOT EXISTS emergency_logout (
    id INTEGER PRIMARY KEY DEFAULT 1 CHECK (id = 1),
    generation INTEGER NOT NULL DEFAULT 0
);

-- For existing databases, run:
-- ALTER TABLE users ADD COLUMN IF NOT EXISTS is_active BOOLEAN DEFAULT TRUE NOT NULL;
-- ALTER TABLE users ADD COLUMN IF NOT EXISTS can_access_dashboard BOOLEAN DEFAULT TRUE NOT NULL;
-- ALTER TABLE users ADD COLUMN IF NOT EXISTS can_register BOOLEAN DEFAULT TRUE NOT NULL;
-- ALTER TABLE users ADD COLUMN IF NOT EXISTS can_edit_own_profile BOOLEAN DEFAULT FALSE NOT NULL;
