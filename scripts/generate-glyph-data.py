#!/usr/bin/env python3
"""
generate-glyph-data.py

Regenerates assets/data/glyphs.json — a static {glyph id: {name, icon,
major}} map used to render each currently-equipped Major/Minor glyph with
a real name and icon (see app.js's renderGlyphs and export-characters-
json.sh/wowbackup.sh's glyphs query). Client data only, no DB/server
access needed, unlike this feature's first version.

That first version instead live-joined four acore_world tables every
export run (glyphproperties_dbc, spell_dbc, item_template,
itemdisplayinfo_dbc) to resolve each glyph's name/icon through its
Inscription-crafted "Glyph of X" item. On a real server, three of those
four turned out to be empty or incomplete (glyphproperties_dbc and
itemdisplayinfo_dbc both 0 rows, spell_dbc missing the specific rows
needed) - those "_dbc" tables are populated by a separate DBC-extraction
step not every AzerothCore install runs for every table, unlike
skillline_dbc (which Skills' own live join already depends on safely).
This script removes that fragile live dependency entirely, same
"bundled reference file, fetched once, committed" pattern every other
static reference in this project already uses (achievements.json,
item_icons.json, spell_icons.json, talent_spells.json).

Two things confirmed directly against the real client data before
writing this, not assumed:
  - A glyph's real "Glyph of X" name isn't on GlyphProperties' own
    SpellID - that's a separate, often-generic passive-aura spell (e.g.
    SpellID 52084 is shared by multiple unrelated glyph ids, an inactive
    placeholder-looking row). The real name is on the spell that teaches
    it: Effect[i] == SPELL_EFFECT_APPLY_GLYPH (confirmed as effect id 74
    against AzerothCore's own SharedDefines.h SPELL_EFFECT_* enum) with
    EffectMiscValue[i] == the glyph's own GlyphProperties.ID - 353 of
    357 real glyphs resolve a name starting with "Glyph of " this way
    (one of the other 3 - id 2, sharing its SpellID with another real
    glyph, id 81 - did resolve a name, "Copy of Holy Bolt", but not that
    prefix, a sure sign of leftover dev/test data; excluded below for
    exactly that reason, not just a missing name).
  - Neither GlyphProperties' own SpellIconID nor that teaching spell's
    own SpellIconID carry a picture unique to one glyph's ability -
    GlyphProperties.SpellIconID only ever cycles through ~20 generic
    "UI-Glyph-Rune-N" rune textures (the same Interface/Spellbook set
    the real in-game Glyphs wheel itself uses - confirmed against a
    reference screenshot of that wheel, round rune-style icons, not
    ability-specific art), reused across many unrelated glyphs. That's
    used here anyway, deliberately: it's real, authentic WotLK UI art
    (bundled at assets/icons/items/ui-glyph-rune-*.png, fetched from the
    same Gethe/wow-ui-textures mirror this project's other icons use),
    not a fallback - and unlike the item-icon chain, it needs nothing
    from the live server at all.

Three DBC-derived CSVs from the same r-o-b-o-t-o/azerothcore-armory
project (the same source assets/data/achievements.json came from):
  - GlyphProperties_3.3.5_12340.csv: id, SpellID, GlyphSlotFlags (0 =
    Major, 1 = Minor - confirmed by cross-checking known glyphs: Glyph
    of Fireball/Ice Block came back 0, the purely cosmetic Glyph of the
    White Bear/Glyph of Fortitude came back 1), SpellIconID
  - Spell_3.3.5_12340.csv: id, Effect[0..2], EffectMiscValue[0..2],
    Name_lang[0] (used only to find each glyph's teaching spell/name)
  - SpellIcon_3.3.5_12340.csv: id, TextureFilename

Usage:
  python3 generate-glyph-data.py <GlyphProperties.csv> <Spell.csv> <SpellIcon.csv> <output-path>
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
            clean = texture.split("\\")[-1].lower()
            for ext in (".tga", ".blp", ".png"):
                if clean.endswith(ext):
                    clean = clean[:-len(ext)]
                    break
            icon_texture[row["ID"]] = clean
    return icon_texture


def load_glyph_names(spell_csv_path):
    names = {}
    with open(spell_csv_path) as f:
        for row in csv.DictReader(f):
            for i in range(3):
                if row.get(f"Effect[{i}]") == "74":
                    glyph_id = row.get(f"EffectMiscValue[{i}]")
                    if glyph_id and glyph_id != "0":
                        names[glyph_id] = row["Name_lang[0]"]
    return names


def generate(glyph_csv_path, spell_csv_path, spell_icon_csv_path):
    icon_texture = load_icon_textures(spell_icon_csv_path)
    glyph_names = load_glyph_names(spell_csv_path)
    glyphs = {}
    with open(glyph_csv_path) as f:
        for row in csv.DictReader(f):
            flags = row["GlyphSlotFlags"]
            if flags not in ("0", "1"):
                continue  # a handful of unused/dev-only rows, not real glyphs
            glyph_id = row["ID"]
            name = glyph_names.get(glyph_id)
            # Every real glyph's teaching spell is named "Glyph of X" - a
            # name that doesn't start with that (confirmed on this build:
            # exactly one real row, id 2, resolves to "Copy of Holy
            # Bolt") is leftover dev/test data sharing a duplicate
            # SpellID with another real glyph (id 2 and id 81 both
            # resolve GlyphProperties.SpellID to 52084), not something a
            # player could ever actually have - excluded here rather
            # than shown with a nonsense name.
            if not name or not name.startswith("Glyph of "):
                continue
            glyphs[glyph_id] = {
                "name": name,
                "icon": icon_texture.get(row["SpellIconID"]),
                "major": flags == "0",
            }
    return glyphs


def main():
    if len(sys.argv) != 5:
        print(__doc__)
        sys.exit(1)
    glyph_csv_path, spell_csv_path, spell_icon_csv_path, out_path = sys.argv[1:5]

    glyphs = generate(glyph_csv_path, spell_csv_path, spell_icon_csv_path)

    with open(out_path, "w") as f:
        json.dump(glyphs, f, separators=(",", ":"), sort_keys=True)

    major_count = sum(1 for g in glyphs.values() if g["major"])
    icons = {g["icon"] for g in glyphs.values() if g["icon"]}
    print(f"glyphs.json: {len(glyphs)} glyphs ({major_count} Major, {len(glyphs) - major_count} Minor), {len(icons)} distinct icons -> {out_path}")


if __name__ == "__main__":
    main()
