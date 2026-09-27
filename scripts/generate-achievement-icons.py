#!/usr/bin/env python3
"""
generate-achievement-icons.py

Regenerates assets/data/achievement_icons.json — a static {achievement id:
icon name} map, real per-achievement icons for the (currently narrow)
Achievements-with-icons rollout in app.js. Client data only, no DB access:
achievement ids for this build (WotLK 3.3.5.12340) match
achievement.id/achievement_criteria's own ids 1:1 (same assumption every
other bundled DBC-derived file in this project already relies on), so this
resolves purely from Blizzard's own client data.

Two DBC-derived CSVs from the same r-o-b-o-t-o/azerothcore-armory source
every other CSV in this project came from carry this:
  - Achievement_3.3.5_12340.csv: id, ..., IconID (among many other columns
    - Title_lang[0]/Category/Points are the ones assets/data/achievements.json
    already uses; IconID wasn't pulled in when that file was first built)
  - SpellIcon_3.3.5_12340.csv: id, TextureFilename (same file
    generate-spell-icons.py already joins against for Mounts/Companions)
Joining achievement -> IconID -> TextureFilename gives every achievement's
icon name. Verified before trusting it: Cooking/Fishing/First Aid's own
5-rank achievement lines (Journeyman/Expert/Artisan/Master/Grand Master)
each resolve to one shared, correct, profession-specific icon per line
(INV_Misc_Food_15 / Trade_Fishing / Spell_Holy_SealOfSacrifice
respectively) - not a generic icon shared across every profession, and not
noise, confirming the join is sound.

No InventoryType-style filter applies here (achievements aren't items) -
every achievement with a resolvable IconID is kept, same "complete, not
curated to what's rendered today" approach every other bundled icon map in
this project already takes; which achievements actually show an icon in
the UI is a separate, deliberate choice made in app.js
(ACHIEVEMENT_ICON_CATEGORIES), not decided here.

Usage:
  python3 generate-achievement-icons.py <Achievement.csv> <SpellIcon.csv> <output-path>
"""
import csv
import json
import sys


def load_icon_textures(path):
    icon_texture = {}
    with open(path) as f:
        for row in csv.DictReader(f):
            texture = row.get("TextureFilename", "").strip()
            if not texture:
                continue
            clean = texture.rsplit("\\", 1)[-1].lower()
            for ext in (".tga", ".blp", ".png"):
                if clean.endswith(ext):
                    clean = clean[:-len(ext)]
                    break
            icon_texture[row["ID"]] = clean
    return icon_texture


def generate(achievement_csv_path, spell_icon_csv_path):
    icon_texture = load_icon_textures(spell_icon_csv_path)
    achievement_icons = {}
    with open(achievement_csv_path) as f:
        for row in csv.DictReader(f):
            icon = icon_texture.get(row["IconID"])
            if icon:
                achievement_icons[row["ID"]] = icon
    return achievement_icons


def main():
    if len(sys.argv) != 4:
        print(__doc__)
        sys.exit(1)
    achievement_csv_path, spell_icon_csv_path, out_path = sys.argv[1:4]

    achievement_icons = generate(achievement_csv_path, spell_icon_csv_path)

    with open(out_path, "w") as f:
        json.dump(achievement_icons, f, separators=(",", ":"), sort_keys=True)

    print(f"achievement_icons.json: {len(achievement_icons)} achievements, {len(set(achievement_icons.values()))} distinct icons -> {out_path}")


if __name__ == "__main__":
    main()
