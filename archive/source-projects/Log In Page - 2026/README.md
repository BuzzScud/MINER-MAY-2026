# Secure Login Page

Flask-based login system with PostgreSQL (or SQLite for development), bcrypt password hashing, and session management.

## Setup

### 1. Create virtual environment and install dependencies

```bash
python3 -m venv venv
source venv/bin/activate  # On Windows: venv\Scripts\activate
pip install -r requirements.txt
```

### 2. Database

**SQLite (default, no setup):**
The app uses SQLite by default. No configuration needed.

**PostgreSQL:**
1. Create database: `createdb login_db`
2. Copy `.env.example` to `.env`
3. Set `DATABASE_URL=postgresql://user:password@localhost:5432/login_db`
4. Install psycopg2 if needed: `pip install psycopg2-binary`
5. Run `setup_db.sql` manually or let the app create tables on first run

### 3. Environment variables (optional)

Create `.env` from `.env.example` and set:
- `DATABASE_URL` — PostgreSQL connection string (or leave unset for SQLite)
- `SECRET_KEY` — Secret key for session signing

### 4. Run the app

```bash
python app.py
```

Visit http://127.0.0.1:5000/

## Features

- User registration and login
- Password hashing with bcrypt
- Flask sessions for auth state
- CSRF protection
- Dark theme with defragmentation-inspired background
- Responsive layout
- Loading indicator on form submit

## Routes

| Route       | Methods | Description                    |
|-------------|---------|--------------------------------|
| `/`         | GET, POST | Login page                    |
| `/register` | GET, POST | Registration page            |
| `/logout`   | GET     | Log out and redirect to login |
| `/dashboard`| GET     | Protected page (requires login)|
