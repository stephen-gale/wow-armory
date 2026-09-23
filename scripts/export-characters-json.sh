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
# of two ways:
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
# - "title" category (Titles): each character's characters.knownTitles
#   bitmask (6 space-separated uint32 chunks — see decode_known_titles)
#   against every title's bit_index (chartitles_dbc.Mask_ID). This is the
#   same bitmask the game itself uses to track "has this title", so it
#   covers every source a title can come from (achievements, quests,
#   whatever) uniformly — no per-source detection logic needed. Where a
#   title can be positively attributed to a completed achievement (via a
#   live acore_world.achievement_reward lookup, TitleA/TitleH by faction),
#   its earned_at is that achievement's own real date, upgrading a
#   previously-sticky-guessed date if one was already recorded; every
#   other title (quest-granted, etc.) falls back to the same sticky
#   first-detected stamp every other undateable category already uses.
#   characters.chosenTitle (the currently-selected title's bit_index) is
#   resolved the same way into a top-level active_title_id.
# Once earned, a collection is sticky: it stays on the character
# permanently (even after the gear is swapped away, for equip categories),
# by unioning this run's newly-detected ids with whatever was already
# recorded in the existing OUTPUT_FILE (if present) before overwriting it.
# Both achievements and collections carry an earned_at timestamp —
# achievements read theirs straight from character_achievement.date
# (Blizzard's own record); collections have no such record (character_spell
# in particular has no timestamp column at all, and equip detection is a
# point-in-time snapshot), so the first run that detects one stamps it with
# that run's generated_at, and every later run preserves that original
# stamp rather than overwriting it.
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
ACHIEVEMENT_TITLES_TMP="$(mktemp)"
trap 'rm -f "$ACHIEVEMENTS_TMP" "$EQUIPPED_TMP" "$KNOWN_SPELLS_TMP" "$ACHIEVEMENT_TITLES_TMP"' EXIT

mysql -h "$DB_HOST" -P "$DB_PORT" -u "$DB_USER" -p"$DB_PASS" -N -B -e "
  SELECT ca.guid, ca.achievement, ca.date
  FROM acore_characters.character_achievement ca
  JOIN acore_characters.characters c ON c.guid = ca.guid
  JOIN acore_auth.account a ON a.id = c.account
  WHERE a.username NOT LIKE 'RNDBOT%';
" > "$ACHIEVEMENTS_TMP"

mysql -h "$DB_HOST" -P "$DB_PORT" -u "$DB_USER" -p"$DB_PASS" -N -B -e "
  SELECT ci.guid, ci.slot, ii.itemEntry, it.name
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

# Which achievement grants which title, by faction — a small (~100 row)
# world-DB table, cheap to pull in full every run. Only rows that actually
# grant a title matter; TitleA/TitleH are real CharTitles ids (the same id
# space assets/data/collections/titles.json's own `id` uses), 0 = none.
mysql -h "$DB_HOST" -P "$DB_PORT" -u "$DB_USER" -p"$DB_PASS" -N -B -e "
  SELECT ID, TitleA, TitleH
  FROM acore_world.achievement_reward
  WHERE TitleA != 0 OR TitleH != 0;
" > "$ACHIEVEMENT_TITLES_TMP"

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
  c.gender,
  c.level,
  c.money,
  COALESCE(cap.total_points, 0) AS achievement_points,
  COALESCE(cap.total_achievements, 0) AS achievement_count,
  c.totaltime AS played_time_seconds,
  c.totalHonorPoints AS honor_points,
  c.chosenTitle,
  c.knownTitles
FROM acore_characters.characters c
JOIN acore_auth.account a ON a.id = c.account
LEFT JOIN acore_characters.character_achievement_points cap ON cap.guid = c.guid
WHERE a.username NOT LIKE 'RNDBOT%'
ORDER BY faction, c.level DESC, c.name;
SQL

mysql -h "$DB_HOST" -P "$DB_PORT" -u "$DB_USER" -p"$DB_PASS" -N -B -e "$QUERY" | python3 - \
  "$OUTPUT_FILE" "$ACHIEVEMENTS_TMP" "$EQUIPPED_TMP" "$KNOWN_SPELLS_TMP" "$ACHIEVEMENT_TITLES_TMP" \
  "$COLLECTION_SETS_DEFS" "$COLLECTION_MOUNTS_DEFS" "$COLLECTION_COMPANIONS_DEFS" \
  "$COLLECTION_LEGENDARIES_DEFS" "$COLLECTION_TABARDS_DEFS" "$COLLECTION_HEIRLOOMS_DEFS" \
  "$COLLECTION_TITLES_DEFS" <<'PYEOF'
import sys
import json
import datetime
import os
from collections import defaultdict

(out_path, achievements_path, equipped_path, known_spells_path, achievement_titles_path,
 sets_defs_path, mounts_defs_path, companions_defs_path,
 legendaries_defs_path, tabards_defs_path, heirlooms_defs_path, titles_defs_path) = sys.argv[1:13]

# (json key, detection kind, defs path) — "equip" entries have slot_groups,
# "spell" entries have spell_ids, "title" entries have bit_index. See the
# header comment above for what each kind means.
CATEGORIES = [
    ("sets", "equip", sets_defs_path),
    ("mounts", "spell", mounts_defs_path),
    ("companions", "spell", companions_defs_path),
    ("legendaries", "equip", legendaries_defs_path),
    ("tabards", "equip", tabards_defs_path),
    ("heirlooms", "equip", heirlooms_defs_path),
    ("titles", "title", titles_defs_path),
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
        guid, slot, item_entry, item_name = line.split("\t")
        guid = int(guid)
        equipped_by_guid[guid].add(int(item_entry))
        equipped_gear_by_guid[guid].append({
            "slot": int(slot),
            "id": int(item_entry),
            "name": item_name,
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

# Which achievement grants which title, by faction (see the mysql query
# above) — used below to give a Titles entry a real earned_at (the
# granting achievement's own date) instead of falling back to the sticky
# first-detected stamp every other undateable collection uses.
achievement_titles = {}
with open(achievement_titles_path) as f:
    for line in f:
        line = line.rstrip("\n")
        if not line:
            continue
        achievement_id, title_a, title_h = line.split("\t")
        achievement_titles[int(achievement_id)] = (int(title_a), int(title_h))

def decode_known_titles(known_titles_str):
    """characters.knownTitles: 6 space-separated uint32 chunks (three
    uint64 PLAYER__FIELD_KNOWN_TITLES fields, each split into two uint32 —
    see AzerothCore's Player::HasTitle/SetTitle). Bit `i` of chunk `i//32`
    set means the character knows the title whose CharTitles.dbc bit_index
    (chartitles_dbc.Mask_ID) is `i` — this is the game's own ground truth
    for "has this title", covering every source (achievement, quest,
    whatever granted it) the same way, unlike every other Collections
    category here which can only detect one specific source."""
    if not known_titles_str:
        return set()
    bits = set()
    for chunk_index, value in enumerate(int(x) for x in known_titles_str.split()):
        for bit in range(32):
            if value & (1 << bit):
                bits.add(chunk_index * 32 + bit)
    return bits

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

def detect_title(known_titles_str, defs):
    """Titles: earned when the character's knownTitles bitmask (see
    decode_known_titles) has the bit for this entry's bit_index set —
    the same bitmask the game itself checks, so this catches a title
    regardless of how it was granted."""
    known_bits = decode_known_titles(known_titles_str)
    return [entry["id"] for entry in defs if entry["bit_index"] in known_bits]

DETECTORS = {"equip": detect_equip, "spell": detect_spell, "title": detect_title}

defs_by_key = {}
for key, kind, defs_path in CATEGORIES:
    try:
        with open(defs_path) as f:
            defs_by_key[key] = json.load(f)
    except FileNotFoundError:
        # Every other category ships its defs file with the repo - only
        # Titles can legitimately be missing, until its one-time
        # chartitles_dbc export (see scripts/generate-titles-collection-
        # data.py) has been run and committed. Skip it gracefully rather
        # than failing the whole export over one not-yet-generated file.
        if key != "titles":
            raise
        print(f"  Note: {defs_path} not found - skipping Titles detection this run", file=sys.stderr)
        defs_by_key[key] = []

# CharTitles bit_index -> id, for resolving characters.chosenTitle (which
# stores a bit_index, same as knownTitles) into active_title_id below.
title_bit_index_to_id = {entry["bit_index"]: entry["id"] for entry in defs_by_key.get("titles", [])}

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

characters = []

for line in sys.stdin:
    line = line.rstrip("\n")
    if not line:
        continue
    fields = line.split("\t")
    (guid, name, account, race, race_name, cls, class_name, faction, gender,
     level, money, ap, ac, played, honor, chosen_title, known_titles) = fields
    guid = int(guid)

    equipped_ids = equipped_by_guid.get(guid, set())
    known_spells = known_spells_by_guid.get(guid, set())
    detector_input_by_kind = {"equip": equipped_ids, "spell": known_spells, "title": known_titles}

    # Real dates for titles attributable to one of this character's own
    # completed achievements (title_A for Alliance, title_H for Horde) -
    # every other known title falls back to the sticky stamp below, same
    # as every other undateable collection category.
    real_title_dates = {}
    for ach in achievements_by_guid.get(guid, []):
        title_a, title_h = achievement_titles.get(ach["id"], (0, 0))
        title_id = title_a if faction == "Alliance" else title_h if faction == "Horde" else 0
        if title_id and ach["earned_at"]:
            real_title_dates[title_id] = ach["earned_at"]

    collections = {}
    for key, kind, _ in CATEGORIES:
        detector = DETECTORS[kind]
        current_ids = detector(detector_input_by_kind[kind], defs_by_key[key])
        earned_at_map = dict(previous_by_key_by_guid[key].get(guid, {}))
        for entry_id in current_ids:
            real_date = real_title_dates.get(entry_id) if key == "titles" else None
            if real_date:
                # Always prefer the real, achievement-sourced date, even
                # over an earned_at already sticky-recorded from before
                # this cross-reference existed.
                earned_at_map[entry_id] = real_date
            else:
                earned_at_map.setdefault(entry_id, generated_at)
        collections[key] = [
            {"id": entry_id, "earned_at": earned_at}
            for entry_id, earned_at in sorted(earned_at_map.items())
        ]

    active_title_id = title_bit_index_to_id.get(int(chosen_title)) if int(chosen_title) else None

    characters.append({
        "guid": guid,
        "name": name,
        "account": account,
        "race_id": int(race),
        "race_name": race_name,
        "class_id": int(cls),
        "class_name": class_name,
        "faction": faction,
        "gender": int(gender),
        "level": int(level),
        "money_copper": int(money),
        "achievement_points": int(ap),
        "achievement_count": int(ac),
        "played_time_seconds": int(played),
        "honor_points": int(honor),
        "active_title_id": active_title_id,
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
