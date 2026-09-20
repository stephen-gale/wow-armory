#!/usr/bin/env bash
# export-characters-json.sh
#
# Dumps AzerothCore character data to a structured characters.json file for
# the wow-companion character dashboard. Same underlying data as the
# existing text progress report in wowbackup.sh, just shaped as JSON.
#
# Usage: call this from wowbackup.sh (source it, or just run it as a step)
# after the acore_auth/acore_characters dumps and before the rclone sync,
# so characters.json rides along with the rest of the backup.
#
# Adjust DB_HOST / DB_PORT / DB_USER / DB_PASS / OUTPUT_DIR below (or export
# them as env vars before calling this script) to match whatever variables
# wowbackup.sh already uses for its mysqldump calls.
#
# NOTE: the achievement-points column name/table below assumes the
# mod-achievement-tracker schema exposes acore_characters.character_achievement_points(guid, points).
# If your column is named differently, check with:
#   mysql -u <user> -p -e "DESCRIBE acore_characters.character_achievement_points;"
# and adjust the `cap.points` reference in the query below.

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
  COALESCE(cap.points, 0) AS achievement_points,
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
     faction, level, money, ap, played) = fields
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
