#!/usr/bin/env bash
# export-characters-json.sh
#
# Standalone/ad-hoc version of the characters.json export, matching the
# schema used in wowbackup.sh's own progress report:
# acore_characters.character_achievement_points(guid, total_points, total_achievements).
#
# For normal backups, prefer pasting the inline block from README.md
# directly into wowbackup.sh (right after the progress-report step) so
# characters.json lands in $BACKUP_DIR and rides along with the rest of
# that backup's rclone sync. Use this script instead when you just want to
# regenerate characters.json on its own, without running a full backup.
#
# Adjust DB_HOST / DB_PORT / DB_USER / DB_PASS / OUTPUT_DIR below (or export
# them as env vars before calling this script) to match wowbackup.sh.

set -euo pipefail

DB_HOST="${DB_HOST:-127.0.0.1}"
DB_PORT="${DB_PORT:-3306}"
DB_USER="${DB_USER:-acore}"
DB_PASS="${DB_PASS:-acore}"
OUTPUT_DIR="${OUTPUT_DIR:-$HOME/wow-backups}"
OUTPUT_FILE="${OUTPUT_FILE:-$OUTPUT_DIR/characters.json}"

mkdir -p "$OUTPUT_DIR"

read -r -d '' QUERY <<'SQL' || true
SELECT
  c.guid,
  c.name,
  a.username AS account,
  c.race,
  CASE c.race
    WHEN 1 THEN 'Human' WHEN 2 THEN 'Orc' WHEN 3 THEN 'Dwarf' WHEN 4 THEN 'Night Elf'
    WHEN 5 THEN 'Undead' WHEN 6 THEN 'Tauren' WHEN 7 THEN 'Gnome' WHEN 8 THEN 'Troll'
    WHEN 9 THEN 'Goblin' WHEN 10 THEN 'Blood Elf' WHEN 11 THEN 'Draenei'
    ELSE 'Unknown'
  END AS race_name,
  c.class,
  CASE c.class
    WHEN 1 THEN 'Warrior' WHEN 2 THEN 'Paladin' WHEN 3 THEN 'Hunter' WHEN 4 THEN 'Rogue'
    WHEN 5 THEN 'Priest' WHEN 6 THEN 'Death Knight' WHEN 7 THEN 'Shaman' WHEN 8 THEN 'Mage'
    WHEN 9 THEN 'Warlock' WHEN 11 THEN 'Druid'
    ELSE 'Unknown'
  END AS class_name,
  CASE
    WHEN c.race IN (1,3,4,7,11) THEN 'Alliance'
    WHEN c.race IN (2,5,6,8,9,10) THEN 'Horde'
    ELSE 'Unknown'
  END AS faction,
  c.level,
  c.money,
  COALESCE(cap.total_points, 0) AS achievement_points,
  COALESCE(cap.total_achievements, 0) AS achievement_count,
  c.totaltime AS played_time_seconds
FROM acore_characters.characters c
JOIN acore_auth.account a ON a.id = c.account
LEFT JOIN acore_characters.character_achievement_points cap ON cap.guid = c.guid
WHERE a.username NOT LIKE 'RNDBOT%'
ORDER BY faction, c.level DESC, c.name;
SQL

mysql -h "$DB_HOST" -P "$DB_PORT" -u "$DB_USER" -p"$DB_PASS" -N -B -e "$QUERY" | python3 - "$OUTPUT_FILE" <<'PYEOF'
import sys
import json
import datetime

out_path = sys.argv[1]
characters = []

for line in sys.stdin:
    line = line.rstrip("\n")
    if not line:
        continue
    fields = line.split("\t")
    (guid, name, account, race, race_name, cls, class_name,
     faction, level, money, ap, ac, played) = fields
    characters.append({
        "guid": int(guid),
        "name": name,
        "account": account,
        "race_id": int(race),
        "race_name": race_name,
        "class_id": int(cls),
        "class_name": class_name,
        "faction": faction,
        "level": int(level),
        "money_copper": int(money),
        "achievement_points": int(ap),
        "achievement_count": int(ac),
        "played_time_seconds": int(played),
    })

data = {
    "generated_at": datetime.datetime.utcnow().strftime("%Y-%m-%dT%H:%M:%SZ"),
    "characters": characters,
}

with open(out_path, "w") as f:
    json.dump(data, f, indent=2)

print(f"characters.json: wrote {len(characters)} characters to {out_path}")
PYEOF
