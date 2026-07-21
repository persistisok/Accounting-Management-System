#!/usr/bin/env sh
set -eu

timestamp="$(date -u +%Y%m%dT%H%M%SZ)"
backup_dir="${BACKUP_DIR:-/backups}"
mkdir -p "$backup_dir"

export PGPASSWORD="${POSTGRES_PASSWORD:?POSTGRES_PASSWORD is required}"
pg_dump \
  --host "${POSTGRES_HOST:-postgres}" \
  --username "${POSTGRES_USER:-ledger}" \
  --dbname "${POSTGRES_DB:-business_ledger}" \
  --format custom \
  --file "$backup_dir/business-ledger-$timestamp.dump"

find "$backup_dir" -type f -name 'business-ledger-*.dump' -mtime "+${BACKUP_RETENTION_DAYS:-7}" -delete
echo "Backup created: $backup_dir/business-ledger-$timestamp.dump"
