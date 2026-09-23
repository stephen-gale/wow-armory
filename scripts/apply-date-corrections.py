#!/usr/bin/env python3
"""
apply-date-corrections.py

One-time backfill: the mechanical export can only stamp a Collections
entry's earned_at with the moment it was first *detected* (character_spell
and equipped-gear snapshots carry no history), so anything earned before
this app existed shows the date it was noticed rather than the date it was
actually earned. Where the real date is known (from memory, screenshots,
etc.), this script overwrites earned_at in place with no other trace of
the correction — per the project's own rule, a corrected entry must look
exactly like any other entry, not a special "backfilled" one.

This is a one-off tool, not part of the regular export pipeline: run it by
hand, once, against a freshly-generated characters.json, then let that
corrected file get published as normal (e.g. by wowbackup.sh's own
commit+push step, or by committing it yourself).

Usage:
  python3 apply-date-corrections.py <path-to-characters.json>

Edits the file in place. Exits non-zero (and applies nothing) if any
correction's character/category/item id can't be found in the file, so a
typo or a not-yet-detected item fails loudly instead of silently no-op'ing.
"""
import sys
import json

# (character name, collection category key, item id, corrected earned_at) —
# see the branch history / PR description for how each date and item id
# was sourced.
#
# Mount times specifically are constrained by real Blizzard-timestamped
# achievements already on record for these characters, not picked freely:
# a mount can never predate the level its riding skill requires (level 20
# for any basic ground mount post-3.0.8, 40 for an epic/class mount, 60 for
# a basic flying mount, etc - whichever "Level N" achievement applies), and
# whichever mount was actually the character's first must land at or before
# their "Giddy Up!" achievement (fires the instant a first mount is
# learned). Where a corrected mount falls on the same calendar day as the
# relevant achievement, its time was set a little after the level gate (or
# a moment before Giddy Up!) rather than left at the generic noon
# placeholder used elsewhere - see each entry's comment for which
# achievement times it against. Check any future manual mount correction
# against the character's own real achievement dates the same way before
# picking a time, not just a date.
CORRECTIONS = [
    ("Rokhan", "mounts", "item_25476", "2026-05-11T15:20:00Z"),      # Green Wind Rider - after Level 60 (15:14:28)
    ("Rokhan", "mounts", "item_18790", "2026-04-21T21:35:00Z"),      # Swift Orange Raptor - after Level 40 (21:28:39)
    ("Rokhan", "mounts", "item_8592", "2026-04-02T15:53:28Z"),       # Whistle of the Violet Raptor - after Level 20 (15:22:58), before Giddy Up! (15:53:29)
    ("Rokhan", "companions", "item_10398", "2026-05-01T12:00:00Z"),  # Mechanical Chicken
    ("Rokhan", "companions", "item_31760", "2026-05-20T12:00:00Z"),  # Miniwing
    ("Rokhan", "companions", "item_11474", "2026-05-03T12:00:00Z"),  # Sprite Darter Egg
    ("Tirion", "mounts", "item_25470", "2026-08-24T12:00:00Z"),      # Golden Gryphon - already after Level 60 (09:46:59), no change needed
    ("Tirion", "mounts", "spell_13819", "2026-07-03T21:21:42Z"),     # Warhorse - after Level 20 (15:46:38), before Giddy Up! (21:21:43)
    ("Tirion", "mounts", "spell_23214", "2026-07-31T21:20:00Z"),     # Charger - after Level 40 (21:13:54)
]


def main():
    if len(sys.argv) != 2:
        print(__doc__)
        sys.exit(1)
    path = sys.argv[1]

    with open(path) as f:
        data = json.load(f)

    chars_by_name = {c["name"]: c for c in data.get("characters", [])}

    errors = []
    applied = []
    for char_name, category, item_id, earned_at in CORRECTIONS:
        char = chars_by_name.get(char_name)
        if char is None:
            errors.append(f"character {char_name!r} not found")
            continue
        entries = char.get("collections", {}).get(category, [])
        entry = next((e for e in entries if e.get("id") == item_id), None)
        if entry is None:
            errors.append(f"{char_name}: {category} entry {item_id!r} not found (not yet detected?)")
            continue
        entry["earned_at"] = earned_at
        applied.append(f"{char_name}: {category} {item_id} -> {earned_at}")

    if errors:
        print("Aborting, no changes written. Errors:")
        for e in errors:
            print(f"  - {e}")
        sys.exit(1)

    with open(path, "w") as f:
        json.dump(data, f, indent=2)

    print(f"Applied {len(applied)} corrections to {path}:")
    for a in applied:
        print(f"  - {a}")


if __name__ == "__main__":
    main()
