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
#
# Collectables (see assets/data/collectables/) are a custom, companion-app-
# only system — not real WoW achievements. The Gear collectable (see
# assets/data/collectables/gear.json) is detected by checking each
# character's *currently equipped* items (character_inventory.bag = 0, slot
# 0-18) against the item ids that make up each named set. Once earned, a
# collectable is sticky: it stays on the character permanently, even after
# the gear is swapped away, by unioning this run's newly-detected ids with
# whatever was already recorded in the existing OUTPUT_FILE (if present)
# before overwriting it.

set -euo pipefail

DB_HOST="${DB_HOST:-127.0.0.1}"
DB_PORT="${DB_PORT:-3306}"
DB_USER="${DB_USER:-acore}"
DB_PASS="${DB_PASS:-acore}"
OUTPUT_DIR="${OUTPUT_DIR:-$HOME/wow-backups}"
OUTPUT_FILE="${OUTPUT_FILE:-$OUTPUT_DIR/characters.json}"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
COLLECTABLE_GEAR_DEFS="${COLLECTABLE_GEAR_DEFS:-$SCRIPT_DIR/../assets/data/collectables/gear.json}"

mkdir -p "$OUTPUT_DIR"

ACHIEVEMENTS_TMP="$(mktemp)"
EQUIPPED_TMP="$(mktemp)"
trap 'rm -f "$ACHIEVEMENTS_TMP" "$EQUIPPED_TMP"' EXIT

mysql -h "$DB_HOST" -P "$DB_PORT" -u "$DB_USER" -p"$DB_PASS" -N -B -e "
  SELECT ca.guid, ca.achievement
  FROM acore_characters.character_achievement ca
  JOIN acore_characters.characters c ON c.guid = ca.guid
  JOIN acore_auth.account a ON a.id = c.account
  WHERE a.username NOT LIKE 'RNDBOT%';
" > "$ACHIEVEMENTS_TMP"

mysql -h "$DB_HOST" -P "$DB_PORT" -u "$DB_USER" -p"$DB_PASS" -N -B -e "
  SELECT ci.guid, ii.itemEntry
  FROM acore_characters.character_inventory ci
  JOIN acore_characters.item_instance ii ON ii.guid = ci.item
  JOIN acore_characters.characters c ON c.guid = ci.guid
  JOIN acore_auth.account a ON a.id = c.account
  WHERE ci.bag = 0 AND ci.slot BETWEEN 0 AND 18
    AND a.username NOT LIKE 'RNDBOT%';
" > "$EQUIPPED_TMP"

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

mysql -h "$DB_HOST" -P "$DB_PORT" -u "$DB_USER" -p"$DB_PASS" -N -B -e "$QUERY" | python3 - "$OUTPUT_FILE" "$ACHIEVEMENTS_TMP" "$EQUIPPED_TMP" "$COLLECTABLE_GEAR_DEFS" <<'PYEOF'
import sys
import json
import datetime
import os
from collections import defaultdict

out_path = sys.argv[1]
achievements_path = sys.argv[2]
equipped_path = sys.argv[3]
collectable_gear_defs_path = sys.argv[4]

achievements_by_guid = defaultdict(list)
with open(achievements_path) as f:
    for line in f:
        line = line.rstrip("\n")
        if not line:
            continue
        guid, achievement_id = line.split("\t")
        achievements_by_guid[int(guid)].append(int(achievement_id))

# Currently-equipped item entries per character (bag=0, slot 0-18 only —
# actual gear, not bags/bank/inventory).
equipped_by_guid = defaultdict(set)
with open(equipped_path) as f:
    for line in f:
        line = line.rstrip("\n")
        if not line:
            continue
        guid, item_entry = line.split("\t")
        equipped_by_guid[int(guid)].add(int(item_entry))

with open(collectable_gear_defs_path) as f:
    collectable_gear_defs = json.load(f)

def detect_collectable_gear(equipped_ids):
    """A Gear collectable is earned when the character currently has at
    least one item from EVERY slot group equipped (each slot group is a list
    of interchangeable item ids for that slot — e.g. a "Conquest"-suffixed
    variant and its plain counterpart, or a Horde/Alliance pair that happens
    to share a display name)."""
    earned = []
    for gs in collectable_gear_defs:
        if all(any(item_id in equipped_ids for item_id in group) for group in gs["slot_groups"]):
            earned.append(gs["id"])
    return earned

# Sticky: once earned, a collectable is never removed, even if the character
# later swaps the gear away. Read whatever was already published last run
# (if any) and union it with this run's live detection.
previous_collectable_gear_by_guid = defaultdict(set)
if os.path.exists(out_path):
    try:
        with open(out_path) as f:
            previous_data = json.load(f)
        for prev_char in previous_data.get("characters", []):
            previous_gear = prev_char.get("collectables", {}).get("gear", [])
            previous_collectable_gear_by_guid[prev_char["guid"]] = set(previous_gear)
    except (json.JSONDecodeError, OSError):
        pass  # first run, or an unreadable/corrupt previous file — start fresh

characters = []

for line in sys.stdin:
    line = line.rstrip("\n")
    if not line:
        continue
    fields = line.split("\t")
    (guid, name, account, race, race_name, cls, class_name,
     faction, level, money, ap, ac, played) = fields
    guid = int(guid)
    newly_detected = detect_collectable_gear(equipped_by_guid.get(guid, set()))
    collectable_gear = sorted(previous_collectable_gear_by_guid.get(guid, set()) | set(newly_detected))
    characters.append({
        "guid": guid,
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
        "achievements": sorted(achievements_by_guid.get(guid, [])),
        "collectables": {
            "gear": collectable_gear,
        },
    })

data = {
    "generated_at": datetime.datetime.utcnow().strftime("%Y-%m-%dT%H:%M:%SZ"),
    "characters": characters,
}

with open(out_path, "w") as f:
    json.dump(data, f, indent=2)

print(f"characters.json: wrote {len(characters)} characters to {out_path}")
PYEOF
