#!/bin/sh
# Sauvegarde quotidienne de la base de prod Mon2027, sur le serveur.
# Installée par `python deploy.py backup-cron` (tâche cron root, 3 h 30).
#
# `.backup` de sqlite3 fait une copie cohérente à chaud : le site continue de
# tourner pendant la sauvegarde. Les copies restent SUR LE SERVEUR : pour une
# copie hors serveur, `python deploy.py backup` depuis le poste.
set -eu

DEST=/var/backups/mon2027
KEEP_DAYS=14

DB="$(docker volume inspect -f '{{.Mountpoint}}' mon2027_db)/prod.db"
mkdir -p "$DEST"
chmod 700 "$DEST"   # données joueurs : lisibles par root uniquement

OUT="$DEST/prod-$(date +%Y%m%d).db"
sqlite3 "$DB" ".backup '$OUT'"
sqlite3 "$OUT" "PRAGMA integrity_check;" | grep -qx ok || { echo "$(date -Is) sauvegarde corrompue : $OUT" >&2; exit 1; }

find "$DEST" -name 'prod-*.db' -mtime +"$KEEP_DAYS" -delete
echo "$(date -Is) ok $OUT ($(du -h "$OUT" | cut -f1))"
