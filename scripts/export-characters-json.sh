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
# Collections (see assets/data/collections/) are a custom, companion-app-
# only system — not real WoW achievements. Each category is detected one
# of three ways:
# - "equip" categories (Sets, Legendaries, Tabards, Heirlooms): each
#   character's *currently equipped* items (character_inventory.bag = 0,
#   slot 0-18) against the item ids each entry's slot_groups require (one
#   item from every slot group must be equipped at once — a slot group is a
#   list of interchangeable item ids for that slot, e.g. a 10-/25-player
#   token pair). Legendaries/Tabards/Heirlooms just have a single slot
#   group of one item, so "equipped, all slot groups satisfied" means
#   "equipped, this one item" — same detection function as Sets.
# - "spell" categories (Mounts, Companions): each character's *known
#   spells* (character_spell) against the learn-spell ids for each
#   mount/companion — an entry is earned if the character knows ANY ONE of
#   its spell_ids (so a multi-color mount like Netherwing Drake completes
#   on any single color, never requiring every color).
# - Titles is different from the other six, not a third "kind" of the same
#   shape: it's a direct lookup against the character's own completed
#   `achievements` (already queried below), against
#   assets/data/collections/titles.json's achievement-id -> title-name map
#   (see scripts/generate-titles-collection-data.py for why it's scoped to
#   achievement-granted titles specifically, not every title source in the
#   game). Because of that, a Titles entry always has a real earned_at (the
#   granting achievement's own date) — never the sticky-guess fallback
#   every other undateable category needs — and is recomputed fresh every
#   run rather than unioned with a previous run, since a character's
#   completed achievements are already fully known and authoritative every
#   time this runs.
# Once earned, a Sets/Mounts/Companions/Legendaries/Tabards/Heirlooms entry
# is sticky: it stays on the character permanently (even after the gear is
# swapped away, for equip categories), by unioning this run's
# newly-detected ids with whatever was already recorded in the existing
# OUTPUT_FILE (if present) before overwriting it. Both achievements and
# these six collections carry an earned_at timestamp — achievements read
# theirs straight from character_achievement.date (Blizzard's own record);
# these collections have no such record (character_spell in particular has
# no timestamp column at all, and equip detection is a point-in-time
# snapshot), so the first run that detects one stamps it with that run's
# generated_at, and every later run preserves that original stamp rather
# than overwriting it.
#
# Heirlooms are stored here exactly like Legendaries (per-character,
# equipped-only, sticky) — the faction-level de-duplicated display (since
# heirlooms are Bind-on-Account and can be mailed between characters) is
# purely an app.js rendering concern, not a detection/storage one.
#
# `equipped_gear` (separate from `collections`) is each character's current
# loadout, slot by slot — unlike Collections, this is NOT sticky: it's a
# plain point-in-time snapshot of character_inventory, fully replaced every
# run, since "what you're wearing right now" has no notion of being
# permanently "earned". Names are queried live from item_template (the
# live server is the simplest, most accurate source, unlike Collections
# which resolve names against a bundled reference file); icons are resolved
# client-side in app.js against the bundled assets/data/item_icons.json
# (item id -> icon slug, precomputed once from Blizzard's own client data —
# see that file's generation notes), so a brand new piece of gear just
# works on the next run with no script change needed here.

set -euo pipefail

DB_HOST="${DB_HOST:-127.0.0.1}"
DB_PORT="${DB_PORT:-3306}"
DB_USER="${DB_USER:-acore}"
DB_PASS="${DB_PASS:-acore}"
OUTPUT_DIR="${OUTPUT_DIR:-$HOME/wow-backups}"
OUTPUT_FILE="${OUTPUT_FILE:-$OUTPUT_DIR/characters.json}"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
COLLECTIONS_DIR="${COLLECTIONS_DIR:-$SCRIPT_DIR/../assets/data/collections}"
COLLECTION_SETS_DEFS="${COLLECTION_SETS_DEFS:-$COLLECTIONS_DIR/sets.json}"
COLLECTION_MOUNTS_DEFS="${COLLECTION_MOUNTS_DEFS:-$COLLECTIONS_DIR/mounts.json}"
COLLECTION_COMPANIONS_DEFS="${COLLECTION_COMPANIONS_DEFS:-$COLLECTIONS_DIR/companions.json}"
COLLECTION_LEGENDARIES_DEFS="${COLLECTION_LEGENDARIES_DEFS:-$COLLECTIONS_DIR/legendaries.json}"
COLLECTION_TABARDS_DEFS="${COLLECTION_TABARDS_DEFS:-$COLLECTIONS_DIR/tabards.json}"
COLLECTION_HEIRLOOMS_DEFS="${COLLECTION_HEIRLOOMS_DEFS:-$COLLECTIONS_DIR/heirlooms.json}"
COLLECTION_TITLES_DEFS="${COLLECTION_TITLES_DEFS:-$COLLECTIONS_DIR/titles.json}"

mkdir -p "$OUTPUT_DIR"

ACHIEVEMENTS_TMP="$(mktemp)"
EQUIPPED_TMP="$(mktemp)"
KNOWN_SPELLS_TMP="$(mktemp)"
trap 'rm -f "$ACHIEVEMENTS_TMP" "$EQUIPPED_TMP" "$KNOWN_SPELLS_TMP"' EXIT

mysql -h "$DB_HOST" -P "$DB_PORT" -u "$DB_USER" -p"$DB_PASS" -N -B -e "
  SELECT ca.guid, ca.achievement, ca.date
  FROM acore_characters.character_achievement ca
  JOIN acore_characters.characters c ON c.guid = ca.guid
  JOIN acore_auth.account a ON a.id = c.account
  WHERE a.username NOT LIKE 'RNDBOT%';
" > "$ACHIEVEMENTS_TMP"

mysql -h "$DB_HOST" -P "$DB_PORT" -u "$DB_USER" -p"$DB_PASS" -N -B -e "
  SELECT ci.guid, ci.slot, ii.itemEntry, it.name, it.Quality
  FROM acore_characters.character_inventory ci
  JOIN acore_characters.item_instance ii ON ii.guid = ci.item
  JOIN acore_characters.characters c ON c.guid = ci.guid
  JOIN acore_auth.account a ON a.id = c.account
  JOIN acore_world.item_template it ON it.entry = ii.itemEntry
  WHERE ci.bag = 0 AND ci.slot BETWEEN 0 AND 18
    AND a.username NOT LIKE 'RNDBOT%';
" > "$EQUIPPED_TMP"

# Only the spell ids that actually matter for Mounts/Companions detection —
# a max-level character can know thousands of spells, so filtering
# server-side (rather than pulling every known spell and filtering in
# Python) keeps this cheap. Both categories share this one query/temp file.
SPELL_COLLECTION_IDS="$(python3 -c "
import json
ids = set()
for path in ('$COLLECTION_MOUNTS_DEFS', '$COLLECTION_COMPANIONS_DEFS'):
    with open(path) as f:
        defs = json.load(f)
    ids.update(str(s) for d in defs for s in d['spell_ids'])
print(','.join(sorted(ids)) if ids else '0')
")"

mysql -h "$DB_HOST" -P "$DB_PORT" -u "$DB_USER" -p"$DB_PASS" -N -B -e "
  SELECT cs.guid, cs.spell
  FROM acore_characters.character_spell cs
  JOIN acore_characters.characters c ON c.guid = cs.guid
  JOIN acore_auth.account a ON a.id = c.account
  WHERE cs.spell IN ($SPELL_COLLECTION_IDS)
    AND a.username NOT LIKE 'RNDBOT%';
" > "$KNOWN_SPELLS_TMP"

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
  c.totaltime AS played_time_seconds,
  c.totalHonorPoints AS honor_points,
  c.logout_time AS last_online,
  COALESCE(cs.maxhealth, 0) AS max_health,
  COALESCE(cs.strength, 0) AS strength,
  COALESCE(cs.agility, 0) AS agility,
  COALESCE(cs.stamina, 0) AS stamina,
  COALESCE(cs.intellect, 0) AS intellect,
  COALESCE(cs.spirit, 0) AS spirit,
  COALESCE(cs.armor, 0) AS armor,
  COALESCE(cs.resHoly, 0) AS res_holy,
  COALESCE(cs.resFire, 0) AS res_fire,
  COALESCE(cs.resNature, 0) AS res_nature,
  COALESCE(cs.resFrost, 0) AS res_frost,
  COALESCE(cs.resShadow, 0) AS res_shadow,
  COALESCE(cs.resArcane, 0) AS res_arcane,
  COALESCE(cs.blockPct, 0) AS block_pct,
  COALESCE(cs.dodgePct, 0) AS dodge_pct,
  COALESCE(cs.parryPct, 0) AS parry_pct,
  COALESCE(cs.critPct, 0) AS crit_pct,
  COALESCE(cs.rangedCritPct, 0) AS ranged_crit_pct,
  COALESCE(cs.spellCritPct, 0) AS spell_crit_pct,
  COALESCE(cs.attackPower, 0) AS attack_power,
  COALESCE(cs.rangedAttackPower, 0) AS ranged_attack_power,
  COALESCE(cs.spellPower, 0) AS spell_power,
  COALESCE(cs.resilience, 0) AS resilience
FROM acore_characters.characters c
JOIN acore_auth.account a ON a.id = c.account
LEFT JOIN acore_characters.character_achievement_points cap ON cap.guid = c.guid
LEFT JOIN acore_characters.character_stats cs ON cs.guid = c.guid
WHERE a.username NOT LIKE 'RNDBOT%'
ORDER BY faction, c.level DESC, c.name;
SQL

mysql -h "$DB_HOST" -P "$DB_PORT" -u "$DB_USER" -p"$DB_PASS" -N -B -e "$QUERY" | python3 - \
  "$OUTPUT_FILE" "$ACHIEVEMENTS_TMP" "$EQUIPPED_TMP" "$KNOWN_SPELLS_TMP" \
  "$COLLECTION_SETS_DEFS" "$COLLECTION_MOUNTS_DEFS" "$COLLECTION_COMPANIONS_DEFS" \
  "$COLLECTION_LEGENDARIES_DEFS" "$COLLECTION_TABARDS_DEFS" "$COLLECTION_HEIRLOOMS_DEFS" \
  "$COLLECTION_TITLES_DEFS" <<'PYEOF'
import sys
import json
import datetime
import os
from collections import defaultdict

(out_path, achievements_path, equipped_path, known_spells_path,
 sets_defs_path, mounts_defs_path, companions_defs_path,
 legendaries_defs_path, tabards_defs_path, heirlooms_defs_path, titles_defs_path) = sys.argv[1:12]

# (json key, detection kind, defs path) — "equip" entries have slot_groups,
# "spell" entries have spell_ids. See the header comment above for what
# each kind means. Titles isn't here - see the dedicated block below.
CATEGORIES = [
    ("sets", "equip", sets_defs_path),
    ("mounts", "spell", mounts_defs_path),
    ("companions", "spell", companions_defs_path),
    ("legendaries", "equip", legendaries_defs_path),
    ("tabards", "equip", tabards_defs_path),
    ("heirlooms", "equip", heirlooms_defs_path),
]

def iso(unix_ts):
    try:
        ts = int(unix_ts)
    except (TypeError, ValueError):
        return None
    if ts <= 0:
        return None
    return datetime.datetime.utcfromtimestamp(ts).strftime("%Y-%m-%dT%H:%M:%SZ")

# Achievements carry their real completion date straight from
# character_achievement.date (Blizzard's own record) — no tracking needed.
achievements_by_guid = defaultdict(list)
with open(achievements_path) as f:
    for line in f:
        line = line.rstrip("\n")
        if not line:
            continue
        guid, achievement_id, earned_unix = line.split("\t")
        achievements_by_guid[int(guid)].append({
            "id": int(achievement_id),
            "earned_at": iso(earned_unix),
        })

# Titles: an achievement id -> title name map (see
# scripts/generate-titles-collection-data.py). A character's titles are
# whichever of their own completed achievements (above) grant one - no
# separate query, no sticky merge needed, since achievements are already
# fully known and authoritative every run.
with open(titles_defs_path) as f:
    titles_by_achievement_id = {entry["id"]: entry for entry in json.load(f)}

# Currently-equipped item entries per character (bag=0, slot 0-18 only —
# actual gear, not bags/bank/inventory). Also kept as a per-slot list
# (equipped_gear_by_guid) for the plain "what's currently worn" snapshot -
# see equipped_gear below - separate from equipped_by_guid's flat id set,
# which is only used for Collections "equip" detection.
equipped_by_guid = defaultdict(set)
equipped_gear_by_guid = defaultdict(list)
with open(equipped_path) as f:
    for line in f:
        line = line.rstrip("\n")
        if not line:
            continue
        guid, slot, item_entry, item_name, quality = line.split("\t")
        guid = int(guid)
        equipped_by_guid[guid].add(int(item_entry))
        equipped_gear_by_guid[guid].append({
            "slot": int(slot),
            "id": int(item_entry),
            "name": item_name,
            "quality": int(quality),
        })

# Known mount/companion-learn spells per character (character_spell has no
# per-row timestamp, unlike character_achievement — that's why every
# collection category uses the same sticky-timestamp fallback below).
known_spells_by_guid = defaultdict(set)
with open(known_spells_path) as f:
    for line in f:
        line = line.rstrip("\n")
        if not line:
            continue
        guid, spell_id = line.split("\t")
        known_spells_by_guid[int(guid)].add(int(spell_id))

def detect_equip(equipped_ids, defs):
    """Earned when the character has at least one item from EVERY slot
    group equipped right now (each slot group is a list of interchangeable
    item ids for that slot — e.g. a 10-/25-player token pair, or a
    Horde/Alliance pair that happens to share a display name). A single-
    item slot_groups entry ([[id]]) reduces to "is this exact item
    equipped" — how Legendaries/Tabards/Heirlooms use this same function."""
    earned = []
    for entry in defs:
        if all(any(item_id in equipped_ids for item_id in group) for group in entry["slot_groups"]):
            earned.append(entry["id"])
    return earned

def detect_spell(known_spell_ids, defs):
    """Shared by Mounts and Companions: an entry is earned when the
    character knows ANY ONE of its spell_ids — a multi-color mount
    (Netherwing Drake, Qiraji Battle Tank) lists every color's spell id and
    completes on any single color, never requiring every color."""
    earned = []
    for entry in defs:
        if any(spell_id in known_spell_ids for spell_id in entry["spell_ids"]):
            earned.append(entry["id"])
    return earned

DETECTORS = {"equip": detect_equip, "spell": detect_spell}

defs_by_key = {}
for key, kind, defs_path in CATEGORIES:
    with open(defs_path) as f:
        defs_by_key[key] = json.load(f)

# Sticky, with the original earned_at preserved: once earned, a collection
# is never removed and its earned_at is never overwritten, even after the
# gear is swapped away. Read whatever was already published last run (if
# any) and carry its earned_at forward for anything still present.
def _earned_at_map(entries):
    # entries used to be bare ids (pre-earned_at); accept both
    return {
        (entry["id"] if isinstance(entry, dict) else entry):
            (entry.get("earned_at") if isinstance(entry, dict) else None)
        for entry in entries
    }

previous_by_key_by_guid = {key: defaultdict(dict) for key, _, _ in CATEGORIES}
if os.path.exists(out_path):
    try:
        with open(out_path) as f:
            previous_data = json.load(f)
        for prev_char in previous_data.get("characters", []):
            prev_collections = prev_char.get("collections", {})
            for key, _, _ in CATEGORIES:
                previous_by_key_by_guid[key][prev_char["guid"]] = _earned_at_map(prev_collections.get(key, []))
    except (json.JSONDecodeError, OSError):
        pass  # first run, or an unreadable/corrupt previous file — start fresh

generated_at = datetime.datetime.utcnow().strftime("%Y-%m-%dT%H:%M:%SZ")

# Named, not positional, unpacking below this point - the main query is now
# wide enough (38 columns, once character_stats joined in) that a flat
# tuple assignment is a silent-corruption risk (a single reorder swaps two
# stats with no error, unlike a crash). Must stay in the exact order the
# SELECT above lists its columns in.
MAIN_QUERY_FIELDS = [
    "guid", "name", "account", "race", "race_name", "cls", "class_name",
    "faction", "level", "money", "ap", "ac", "played", "honor", "logout",
    "max_health", "strength", "agility", "stamina", "intellect", "spirit",
    "armor", "res_holy", "res_fire", "res_nature", "res_frost", "res_shadow",
    "res_arcane", "block_pct", "dodge_pct", "parry_pct", "crit_pct",
    "ranged_crit_pct", "spell_crit_pct", "attack_power", "ranged_attack_power",
    "spell_power", "resilience",
]

characters = []

for line in sys.stdin:
    line = line.rstrip("\n")
    if not line:
        continue
    row = dict(zip(MAIN_QUERY_FIELDS, line.split("\t")))
    guid = int(row["guid"])

    equipped_ids = equipped_by_guid.get(guid, set())
    known_spells = known_spells_by_guid.get(guid, set())

    collections = {}
    for key, kind, _ in CATEGORIES:
        detector = DETECTORS[kind]
        current_ids = detector(equipped_ids if kind == "equip" else known_spells, defs_by_key[key])
        earned_at_map = dict(previous_by_key_by_guid[key].get(guid, {}))
        for entry_id in current_ids:
            earned_at_map.setdefault(entry_id, generated_at)
        collections[key] = [
            {"id": entry_id, "earned_at": earned_at}
            for entry_id, earned_at in sorted(earned_at_map.items())
        ]

    collections["titles"] = sorted(
        (
            {"id": ach["id"], "earned_at": ach["earned_at"]}
            for ach in achievements_by_guid.get(guid, [])
            if ach["id"] in titles_by_achievement_id
        ),
        key=lambda t: t["id"],
    )

    characters.append({
        "guid": guid,
        "name": row["name"],
        "account": row["account"],
        "race_id": int(row["race"]),
        "race_name": row["race_name"],
        "class_id": int(row["cls"]),
        "class_name": row["class_name"],
        "faction": row["faction"],
        "level": int(row["level"]),
        "money_copper": int(row["money"]),
        "achievement_points": int(row["ap"]),
        "achievement_count": int(row["ac"]),
        "played_time_seconds": int(row["played"]),
        "honor_points": int(row["honor"]),
        "last_online": iso(row["logout"]),
        "stats": {
            "max_health": int(row["max_health"]),
            "strength": int(row["strength"]),
            "agility": int(row["agility"]),
            "stamina": int(row["stamina"]),
            "intellect": int(row["intellect"]),
            "spirit": int(row["spirit"]),
            "armor": int(row["armor"]),
            "res_holy": int(row["res_holy"]),
            "res_fire": int(row["res_fire"]),
            "res_nature": int(row["res_nature"]),
            "res_frost": int(row["res_frost"]),
            "res_shadow": int(row["res_shadow"]),
            "res_arcane": int(row["res_arcane"]),
            "block_pct": float(row["block_pct"]),
            "dodge_pct": float(row["dodge_pct"]),
            "parry_pct": float(row["parry_pct"]),
            "crit_pct": float(row["crit_pct"]),
            "ranged_crit_pct": float(row["ranged_crit_pct"]),
            "spell_crit_pct": float(row["spell_crit_pct"]),
            "attack_power": int(row["attack_power"]),
            "ranged_attack_power": int(row["ranged_attack_power"]),
            "spell_power": int(row["spell_power"]),
            "resilience": int(row["resilience"]),
        },
        "achievements": sorted(achievements_by_guid.get(guid, []), key=lambda a: a["id"]),
        "collections": collections,
        "equipped_gear": sorted(equipped_gear_by_guid.get(guid, []), key=lambda g: g["slot"]),
    })

data = {
    "generated_at": generated_at,
    "characters": characters,
}

with open(out_path, "w") as f:
    json.dump(data, f, indent=2)

print(f"characters.json: wrote {len(characters)} characters to {out_path}")
PYEOF
