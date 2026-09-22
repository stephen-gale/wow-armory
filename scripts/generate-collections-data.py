#!/usr/bin/env python3
"""
generate-collections-data.py

Regenerates assets/data/collections/{sets,mounts,companions,legendaries,
tabards,heirlooms}.json directly from AzerothCore's item_template (world
database) — fully mechanically, no curation. See README.md's "Collections"
section for the SQL used to produce the input dumps and the design
rationale (why each category uses the filter it does).

Mounts/Companions spell extraction: an item's "teaches you..." spell is
whichever spellid_N is non-zero and isn't one of the two generic flavour
spells (483, 55884) that many mount/companion items share and that carry
no item-specific meaning. This was derived empirically, not from any
documented rule — see the commit this script was added in for the
worked examples that led to it.

Sets: item_template.itemset groups pieces, but a single itemset can bundle
several interchangeable versions of the same piece under one id (10-/25-
player tokens, valor-purchased duplicates, etc — see the Windrunner's set
for the clearest example: 20 rows for a nominally 5-piece set). Grouping
those by InventoryType (the real equipment slot) recovers the intended
"one piece per slot, any interchangeable version counts" structure — the
same slot_groups shape the old hand-curated gear.json used, just derived
mechanically here instead of picked by hand.

A set's display name isn't in item_template at all (that's Item_Set.dbc,
not exposed over SQL) — this script derives one by intersecting the
whitespace-tokenized piece names and keeping whatever's common to every
piece, in first-piece order (e.g. "Breastplate of Valor" + "Helm of
Valor" + ... -> "of Valor"; falls back to "Set #<itemset id>" on the rare
itemset with no common token at all, e.g. a 2-item weapon-only set).

Legendaries/Heirlooms: quality 5/7 respectively, filtered to InventoryType
!= 0 so the file doesn't carry quest components, reagents, and enchant
scrolls that can never actually be equipped (harmless to detection either
way, since nothing not equippable can ever match, but pointless clutter
in the data file).

Legendaries/Tabards/Heirlooms are represented the same shape as Sets (one
slot_group containing one item id) so detection code doesn't need a
separate function per category — "equipped, all slot groups satisfied"
means "equipped, this one item" when there's only one group of one.

Junk-bucket recoveries: item_template's class=15 (Miscellaneous) subclass 0
("Junk") holds ~2100 items, mostly genuine junk, but a handful are real
mounts/companions that Blizzard itself filed under the wrong subclass (this
is upstream game data, not a server-specific error - an independent,
differently-sourced item dataset agrees with the same "wrong" subclass).
Rather than guess from item names, this script applies the exact same
trigger=6 "teaches you" rule used for the trusted subclass 2/5 items to
this bucket too: of ~160 subclass-0 items carrying any spell at all, only
those with a genuine trigger=6 slot pass - everything else only has an
unrelated on-use/on-equip spell (a consumable, a quest item, a banner) and
is correctly left out. That leaves a short, named list (see
JUNK_BUCKET_RECOVERIES below) where the *mechanism* (trigger=6, dropping
the subclass restriction) is fully mechanical; only the mount-vs-companion
axis needs a human call, since subclass no longer disambiguates it once
pulled from the Junk bucket, and item_template has no other field that
does. Recipe items (Formula:/Pattern:/Plans:/Schematic:/Recipe:/Design:/
Manual: prefixes) also use trigger=6 for unrelated reasons and are
excluded by that prefix check before the list is even built.

Class-trainer-taught mounts: a Paladin's Warhorse/Charger and a Warlock's
Felsteed/Dreadsteed are learned directly as a spell from the class trainer
- no item is ever involved, so item_template can never surface them no
matter how the query is widened. spell_dbc (which would otherwise give a
spell's name over SQL) is unpopulated for standard spells on this server
(confirmed empirically - see the commit history), so these can't be found
by query at all; they were instead confirmed in-game with `.lookup spell
<name>` as a GM (which reads the client's loaded DBC data directly,
sidestepping the SQL gap) - see TRAINER_TAUGHT_MOUNTS below. Each id is
the base trainer spell itself (confirmed via the `[known]` tag against a
character who has it), not the race-specific "Summon X" spell variant it
grants - the base spell is the one stable id that works across every race.

Usage:
  python3 generate-collections-data.py <dump-dir> <output-dir>

<dump-dir> must contain: mounts_dump.txt, companions_dump.txt,
null_spell_diagnosis.txt, sets_dump2.txt, legendaries_dump.txt,
tabards_dump.txt, heirlooms_dump.txt, junk_bucket_strays.txt (see
README.md for the SQL that produces each).
"""
import sys
import json
import os
from collections import defaultdict

GENERIC_PLACEHOLDER_SPELLS = {483, 55884}

RECIPE_PREFIXES = ("Formula:", "Pattern:", "Plans:", "Schematic:", "Recipe:", "Design:", "Manual:")

# Mount-vs-companion calls for the 14 recovered Junk-subclass items (see
# module docstring). item_template gives no field to derive this once an
# item is out of the trusted subclass 2/5 split, so each is a human read of
# the item itself. Two are genuinely uncertain (flagged below) - default
# to companion there since it's the majority pattern in this bucket, and
# it's a one-line fix here if either turns out to be a mount instead.
JUNK_BUCKET_MOUNT_ENTRIES = {
    20221,  # Foror's Fabled Steed - promotional GM/event mount
    23193,  # Naxxramas Deathcharger Reins - 40-man Naxx version of Deathcharger's Reins
    23720,  # Riding Turtle - ridden turtle mount
}
JUNK_BUCKET_UNCERTAIN_ENTRIES = {
    34955,  # Scorched Stone - unconfirmed, defaulted to companion below
    53641,  # Ice Chip - unconfirmed, defaulted to companion below
}

# See module docstring. Confirmed in-game via `.lookup spell <name>`, not
# derivable from any SQL dump.
TRAINER_TAUGHT_MOUNTS = [
    {"id": "spell_13819", "name": "Warhorse", "spell_ids": [13819]},
    {"id": "spell_23214", "name": "Charger", "spell_ids": [23214]},
]


def read_tsv(path):
    with open(path) as f:
        lines = [line.rstrip("\n") for line in f]
    header = lines[0].split("\t")
    rows = []
    for line in lines[1:]:
        if not line:
            continue
        rows.append(dict(zip(header, line.split("\t"))))
    return rows


def load_spell_fallbacks(diagnosis_path):
    """entry -> first non-zero, non-generic spellid_N, from the raw-column
    diagnosis dump (covers items with no spelltrigger=6 slot at all)."""
    fallback = {}
    for row in read_tsv(diagnosis_path):
        entry = int(row["entry"])
        for i in range(1, 6):
            spellid = int(row.get(f"spellid_{i}", "0") or "0")
            if spellid and spellid not in GENERIC_PLACEHOLDER_SPELLS:
                fallback[entry] = spellid
                break
    return fallback


def load_junk_bucket_recoveries(dump_path):
    """Returns (mount_entries, companion_entries), each a list of
    {"id", "name", "spell_ids"} dicts, for the Junk-subclass items that
    genuinely have a trigger=6 learn spell (see module docstring)."""
    mounts, companions = [], []
    for row in read_tsv(dump_path):
        spell_raw = row.get("learn_spell_id")
        if not spell_raw or spell_raw == "NULL":
            continue
        name = row["name"].strip()
        if name.startswith(RECIPE_PREFIXES):
            continue
        entry = int(row["entry"])
        item = {"id": f"item_{entry}", "name": name, "spell_ids": [int(spell_raw)]}
        if entry in JUNK_BUCKET_MOUNT_ENTRIES:
            mounts.append(item)
        else:
            companions.append(item)
    return mounts, companions


def generate_spell_category(dump_path, spell_fallbacks):
    out = []
    for row in read_tsv(dump_path):
        entry = int(row["entry"])
        name = row["name"].strip()
        if not name or name.startswith("NPC Equip") or name.startswith("zzold") or name.startswith("[PH]") or name.startswith("[UNUSED]") or "(NOT IN USE)" in name or "DEPRECATED" in name.upper():
            continue
        spell_raw = row.get("learn_spell_id")
        spell_id = int(spell_raw) if spell_raw and spell_raw != "NULL" else None
        if spell_id is None:
            spell_id = spell_fallbacks.get(entry)
        if spell_id is None:
            continue
        out.append({"id": f"item_{entry}", "name": name, "spell_ids": [spell_id]})
    out.sort(key=lambda e: e["name"])
    return out


def derive_set_name(piece_names, itemset_id):
    token_lists = [n.split() for n in piece_names]
    common = None
    for tokens in token_lists:
        s = set(tokens)
        common = s if common is None else (common & s)
    if common:
        ordered = [t for t in token_lists[0] if t in common]
        if ordered:
            return " ".join(ordered)
    return f"Set #{itemset_id}"


def generate_sets(dump_path):
    rows = read_tsv(dump_path)
    by_itemset = defaultdict(list)
    for row in rows:
        by_itemset[int(row["itemset"])].append(row)

    out = []
    for itemset_id, items in sorted(by_itemset.items()):
        by_slot = defaultdict(list)
        for item in items:
            inv_type = item.get("InventoryType", "0")
            by_slot[inv_type].append(int(item["entry"]))
        slot_groups = [sorted(ids) for _, ids in sorted(by_slot.items(), key=lambda kv: kv[0])]
        piece_names = [item["name"].strip() for item in items]
        name = derive_set_name(piece_names, itemset_id)
        out.append({
            "id": f"itemset_{itemset_id}",
            "name": name,
            "piece_count": len(items),
            "slot_groups": slot_groups,
        })
    out.sort(key=lambda e: e["name"])
    return out


def generate_equipped_category(dump_path, require_inventory_type=True):
    out = []
    for row in read_tsv(dump_path):
        entry = int(row["entry"])
        name = row["name"].strip()
        if not name or name.startswith("NPC Equip") or name.startswith("zzold") or name.startswith("[PH]") or name.startswith("[UNUSED]") or "TEST" in name.upper() or "DEPRECATED" in name.upper() or "(NOT IN USE)" in name:
            continue
        if require_inventory_type and row.get("InventoryType", "0") == "0":
            continue
        out.append({
            "id": f"item_{entry}",
            "name": name,
            "slot_groups": [[entry]],
        })
    out.sort(key=lambda e: e["name"])
    return out


def main():
    if len(sys.argv) != 3:
        print(__doc__)
        sys.exit(1)
    dump_dir, out_dir = sys.argv[1], sys.argv[2]
    os.makedirs(out_dir, exist_ok=True)

    def dp(name):
        return os.path.join(dump_dir, name)

    spell_fallbacks = load_spell_fallbacks(dp("null_spell_diagnosis.txt"))
    junk_mounts, junk_companions = load_junk_bucket_recoveries(dp("junk_bucket_strays.txt"))

    mounts = generate_spell_category(dp("mounts_dump.txt"), spell_fallbacks) + junk_mounts + TRAINER_TAUGHT_MOUNTS
    companions = generate_spell_category(dp("companions_dump.txt"), spell_fallbacks) + junk_companions
    mounts.sort(key=lambda e: e["name"])
    companions.sort(key=lambda e: e["name"])

    files = {
        "mounts.json": mounts,
        "companions.json": companions,
        "sets.json": generate_sets(dp("sets_dump2.txt")),
        "legendaries.json": generate_equipped_category(dp("legendaries_dump.txt")),
        "tabards.json": generate_equipped_category(dp("tabards_dump.txt"), require_inventory_type=False),
        "heirlooms.json": generate_equipped_category(dp("heirlooms_dump.txt")),
    }

    for filename, data in files.items():
        out_path = os.path.join(out_dir, filename)
        with open(out_path, "w") as f:
            json.dump(data, f, indent=2)
        print(f"{filename}: {len(data)} entries -> {out_path}")


if __name__ == "__main__":
    main()
