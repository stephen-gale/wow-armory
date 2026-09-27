#!/usr/bin/env python3
"""
generate-spell-icons.py

Regenerates assets/data/spell_icons.json — a static {spell id: icon name}
map used to render a real icon next to Mounts/Companions Collections
entries (see app.js). Client data only, no DB/server access needed: spell
ids for this build (WotLK 3.3.5.12340) are the same spell_ids already
stored per-entry in assets/data/collections/mounts.json/companions.json
(the mount/companion's own learn spell), so this resolves purely from
Blizzard's own client data and never needs updating - only a client build
change would.

Mounts/Companions can't use item_icons.json the way Equipped Gear/Sets/
Legendaries/Tabards/Heirlooms do: their `item_*` ids are mostly
InventoryType 0 (non-equippable "use" items), which
generate-item-icons.py explicitly excludes. Icons for these instead come
from a different pair of DBC-derived CSVs (same
r-o-b-o-t-o/azerothcore-armory source every other bundled CSV in this
project came from):
  - Spell_3.3.5_12340.csv: id, SpellIconID (among many other columns)
  - SpellIcon_3.3.5_12340.csv: id, TextureFilename (e.g.
    "Interface\Icons\Spell_DeathKnight_SummonDeathCharger")
Joining spell -> SpellIconID -> TextureFilename gives every spell's icon
name. Unlike item_icons.json there's no InventoryType-style filter to
apply - every spell in the client can have an icon, and this project only
ever looks up the small subset that are mount/companion learn spells
anyway - so every resolvable spell is kept rather than pre-filtering to
just those, the same "complete, not curated to today's roster" approach
Collections' own category data already takes.

The actual icon PNGs are a separate one-time fetch from the same
Gethe/wow-ui-textures mirror item_icons.json's icons already use - see the
commit this script was added in for how that set was pulled. Some
spell/item icons already overlap (this app's assets/icons/items/ already
had a handful of spell_*.png files bundled from the item icon fetch, since
a few equippable items reuse a spell-effect icon) - both categories share
the same assets/icons/items/ folder and the same itemIconImg() renderer in
app.js, so no new folder or code path is needed for this to slot in.

Usage:
  python3 generate-spell-icons.py <Spell.csv> <SpellIcon.csv> <output-path>
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


def generate(spell_csv_path, spell_icon_csv_path):
    icon_texture = load_icon_textures(spell_icon_csv_path)
    spell_icons = {}
    with open(spell_csv_path) as f:
        for row in csv.DictReader(f):
            icon = icon_texture.get(row["SpellIconID"])
            if icon:
                spell_icons[row["ID"]] = icon
    return spell_icons


def main():
    if len(sys.argv) != 4:
        print(__doc__)
        sys.exit(1)
    spell_csv_path, spell_icon_csv_path, out_path = sys.argv[1:4]

    spell_icons = generate(spell_csv_path, spell_icon_csv_path)

    with open(out_path, "w") as f:
        json.dump(spell_icons, f, separators=(",", ":"), sort_keys=True)

    print(f"spell_icons.json: {len(spell_icons)} spells, {len(set(spell_icons.values()))} distinct icons -> {out_path}")


if __name__ == "__main__":
    main()
