#!/bin/sh
# Production start command: apply migrations, delete old guests, load the
# knowledge base, then start the API.
# set -e stops the script (and the container) if any command fails,
# so the API never starts against a database that failed to migrate.
set -e

alembic upgrade head

# Delete guests older than GUEST_RETENTION_DAYS, with their conversations.
# Render's free plan has no scheduled jobs, so this runs on every start. If it
# fails, the API starts anyway and the next start tries again.
if ! python -m app.cli.guests cleanup; then
    echo "WARNING: guest cleanup failed; starting the API anyway" >&2
fi

# Load knowledge/*.md into the database. Unchanged files are skipped, so this
# is quick and makes no embedding requests when nothing changed. If it fails
# (for example the embedding service is down), the API still starts: chat
# keeps working, and the next start tries the ingestion again.
if ! python -m app.cli.ingest; then
    echo "WARNING: knowledge base ingestion failed; starting the API anyway" >&2
fi

# exec replaces this shell with uvicorn, so it receives stop signals directly.
# Hosts like Render set PORT; locally it defaults to 8000.
# --no-proxy-headers: Uvicorn would otherwise take the client's address from
# X-Forwarded-For, which Render's proxy adds to rather than replaces, so a
# visitor could choose their own address. The app reads Cloudflare's
# CF-Connecting-IP instead (see app/services/client_ip.py).
exec uvicorn app.main:app --host 0.0.0.0 --port "${PORT:-8000}" --no-proxy-headers
