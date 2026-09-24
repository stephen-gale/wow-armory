#!/usr/bin/env python3
"""
generate-talent-data.py

Regenerates assets/data/talent_spells.json - a static {spell id: {tab_id,
points}} map used by the export scripts (export-characters-json.sh /
wowbackup.sh) to turn each character's raw character_talent rows into
per-tree point totals, the same way item_icons.json turns equipped item
ids into icon names. Not shipped to the browser - resolving spell id ->
points/tab happens server-side in the export scripts, the same way
achievement_points arrives as a precomputed number rather than a raw
list of achievement ids by the time it reaches characters.json.

Two DBC-derived CSVs from the r-o-b-o-t-o/azerothcore-armory project
(the same source achievements.json/item_icons.json came from) carry
this:
  - Talent_3.3.5_12340.csv: id, TabID, SpellRank[0..8] (each rank's own
    spell id - a rank with SpellRank[i] == "0" means that talent doesn't
    go that high)
  - TalentTab_3.3.5_12340.csv: id, Name_lang[0], ClassMask (which class
    this tab belongs to; 0 for the three Hunter pet talent tabs, which
    are skipped entirely here - pet talents are never in a player
    character's own character_talent rows)

Each SpellRank[i] maps to (tab_id, points=i+1). The highest rank a
character has learned is the only row AzerothCore ever keeps in
character_talent - confirmed directly against Player::addTalent's own
"remove old talent rank if any" behavior in PlayerStorage.cpp/Player.cpp
- so no lower-rank rows ever need summing alongside the one that's there.

Usage:
  python3 generate-talent-data.py <Talent.csv> <TalentTab.csv> <output-path>
"""
import csv
import json
import sys


def load_class_tab_ids(talent_tab_csv_path):
    class_tabs = set()
    with open(talent_tab_csv_path) as f:
        for row in csv.DictReader(f):
            if row["ClassMask"] != "0":
                class_tabs.add(row["ID"])
    return class_tabs


def generate(talent_csv_path, talent_tab_csv_path):
    class_tabs = load_class_tab_ids(talent_tab_csv_path)
    spell_points = {}
    with open(talent_csv_path) as f:
        for row in csv.DictReader(f):
            tab_id = row["TabID"]
            if tab_id not in class_tabs:
                continue
            for i in range(9):
                spell_id = row[f"SpellRank[{i}]"]
                if spell_id == "0":
                    continue
                spell_points[spell_id] = {"tab_id": int(tab_id), "points": i + 1}
    return spell_points


def main():
    if len(sys.argv) != 4:
        print(__doc__)
        sys.exit(1)
    talent_csv_path, talent_tab_csv_path, out_path = sys.argv[1:4]

    spell_points = generate(talent_csv_path, talent_tab_csv_path)

    with open(out_path, "w") as f:
        json.dump(spell_points, f, separators=(",", ":"), sort_keys=True)

    print(f"talent_spells.json: {len(spell_points)} talent ranks -> {out_path}")


if __name__ == "__main__":
    main()
