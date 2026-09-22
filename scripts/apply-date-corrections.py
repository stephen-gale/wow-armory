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
# was sourced. Tirion's Charger (the paladin's other class-trainer mount,
# level 40) is still pending confirmation - see README.md's Mounts section
# for how to look its spell id up in-game, then add it here and to
# assets/data/collections/mounts.json (mirroring TRAINER_TAUGHT_MOUNTS in
# generate-collections-data.py).
CORRECTIONS = [
    ("Rokhan", "mounts", "item_25476", "2026-05-11T12:00:00Z"),      # Green Wind Rider
    ("Rokhan", "mounts", "item_18790", "2026-04-21T12:00:00Z"),      # Swift Orange Raptor
    ("Rokhan", "mounts", "item_8592", "2026-04-02T12:00:00Z"),       # Whistle of the Violet Raptor
    ("Rokhan", "companions", "item_10398", "2026-05-01T12:00:00Z"),  # Mechanical Chicken
    ("Rokhan", "companions", "item_31760", "2026-05-20T12:00:00Z"),  # Miniwing
    ("Rokhan", "companions", "item_11474", "2026-05-01T12:00:00Z"),  # Sprite Darter Egg
    ("Tirion", "mounts", "item_25470", "2026-08-24T12:00:00Z"),      # Golden Gryphon
    ("Tirion", "mounts", "spell_13819", "2026-07-03T12:00:00Z"),     # Warhorse
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
