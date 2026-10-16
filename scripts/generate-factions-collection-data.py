#!/usr/bin/env python3
"""
generate-factions-collection-data.py

Regenerates assets/data/collections/factions.json - the reference data for
the Exalted Factions Collection category (see app.js/README): every
trackable faction id, with its display name.

No new research here, unlike every other generator in this project -
this is a pure reshape of assets/data/faction_names.json (already built
and verified for the standalone, dateless Exalted Factions module; see
README's "Exalted Factions" section for how *that* file's id scope and
names were confirmed against AzerothCore's own Faction.dbc/
FactionEntry::CanHaveReputation()). The Collections category needs the
same id->name mapping in the {id, name} list shape every other Collection
file already uses (sets.json, mounts.json, titles.json, ...), not
faction_names.json's own flat {id: name} object shape - this script just
produces that, from the one already-verified source, so both the
standalone module and this Collection stay in sync with a single
regeneration step rather than two names files drifting apart.

Usage:
  python3 generate-factions-collection-data.py <faction_names.json path> <output-path>
"""
import json
import sys


def main():
    if len(sys.argv) != 3:
        sys.exit(f"Usage: {sys.argv[0]} <faction_names.json path> <output-path>")
    faction_names_path, output_path = sys.argv[1], sys.argv[2]

    with open(faction_names_path) as f:
        faction_names = json.load(f)

    factions = sorted(
        ({"id": int(faction_id), "name": name} for faction_id, name in faction_names.items()),
        key=lambda f: f["id"],
    )

    with open(output_path, "w") as f:
        json.dump(factions, f, indent=2)

    print(f"Wrote {len(factions)} factions to {output_path}")


if __name__ == "__main__":
    main()
