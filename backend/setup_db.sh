#!/bin/bash
# =============================================================================
# setup_db.sh — Create the jobmatch database user and database.
# Run this once before starting the backend.
# You will need your PostgreSQL superuser (postgres) password.
# =============================================================================

PG_BIN="/Library/PostgreSQL/18/bin"

echo ""
echo "=== AI Job Match Assistant — Database Setup ==="
echo ""
echo "This script will create:"
echo "  user:     jobmatch"
echo "  password: jobmatch"
echo "  database: jobmatch"
echo ""
echo "Please enter your PostgreSQL superuser (postgres) password:"

"$PG_BIN/psql" -U postgres -h localhost <<SQL
DO \$\$
BEGIN
   IF NOT EXISTS (SELECT FROM pg_catalog.pg_roles WHERE rolname = 'jobmatch') THEN
      CREATE USER jobmatch WITH PASSWORD 'jobmatch';
      RAISE NOTICE 'User jobmatch created.';
   ELSE
      RAISE NOTICE 'User jobmatch already exists.';
   END IF;
END
\$\$;

SELECT 'Creating database...' AS status;
CREATE DATABASE jobmatch OWNER jobmatch;
GRANT ALL PRIVILEGES ON DATABASE jobmatch TO jobmatch;
SQL

echo ""
echo "✅ Database setup complete!"
echo "Now start the backend with: source .venv/bin/activate && uvicorn app.main:app --reload"
