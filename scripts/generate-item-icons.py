#!/usr/bin/env python3
"""
generate-item-icons.py

Regenerates assets/data/item_icons.json — a static {item id: icon name}
map used to render a real icon next to each piece of Equipped Gear (see
app.js). Client data only, no DB access: item ids for this build (WotLK
3.3.5.12340) match AzerothCore's item_template.entry 1:1 for standard
content (confirmed throughout this project's Collections work), so this
resolves purely from Blizzard's own client data and never needs updating
as new items get equipped - only a client build change would.

Two DBC-derived CSVs from the r-o-b-o-t-o/azerothcore-armory project (the
same source assets/data/achievements.json came from) carry this:
  - Item_3.3.5_12340.csv: id, class/subclass, DisplayInfoID, InventoryType
  - ItemDisplayInfo_3.3.5_12340.csv: id, InventoryIcon[0] (the icon name)
Joining item -> DisplayInfoID -> InventoryIcon[0] gives every equippable
item's icon name. Only items with InventoryType != 0 are included (an
unequippable item never needs an icon here). A handful of ItemDisplayInfo
rows carry a stray extension baked into the icon name itself (e.g.
"inv_chest_fur.tga") - stripped here since every other icon reference in
this app uses the bare name.

The actual icon PNGs are a separate one-time fetch from the same
Gethe/wow-ui-textures mirror the class/race/faction icons already use
(see assets/icons/items/README or the commit this script was added in for
how that set was pulled) - of ~2,747 distinct icon names this file can
produce, 2,742 (99.8%) exist in that mirror; the rest silently show no
icon, same graceful-degradation as any other icon in this app.

Usage:
  python3 generate-item-icons.py <Item.csv> <ItemDisplayInfo.csv> <output-path>
"""
import csv
import json
import sys


def load_display_icons(path):
    display_icon = {}
    with open(path) as f:
        for row in csv.DictReader(f):
            icon = row.get("InventoryIcon[0]", "").strip()
            if not icon:
                continue
            clean = icon.lower()
            for ext in (".tga", ".blp", ".png"):
                if clean.endswith(ext):
                    clean = clean[:-len(ext)]
                    break
            display_icon[row["ID"]] = clean
    return display_icon


def generate(item_csv_path, display_info_csv_path):
    display_icon = load_display_icons(display_info_csv_path)
    item_icons = {}
    with open(item_csv_path) as f:
        for row in csv.DictReader(f):
            if row["InventoryType"] == "0":
                continue
            icon = display_icon.get(row["DisplayInfoID"])
            if icon:
                item_icons[row["ID"]] = icon
    return item_icons


def main():
    if len(sys.argv) != 4:
        print(__doc__)
        sys.exit(1)
    item_csv_path, display_info_csv_path, out_path = sys.argv[1:4]

    item_icons = generate(item_csv_path, display_info_csv_path)

    with open(out_path, "w") as f:
        json.dump(item_icons, f, separators=(",", ":"), sort_keys=True)

    print(f"item_icons.json: {len(item_icons)} items, {len(set(item_icons.values()))} distinct icons -> {out_path}")


if __name__ == "__main__":
    main()
