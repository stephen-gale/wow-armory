#!/usr/bin/env python3
"""
extract-faction-baselines.py

Extracts each faction's per-race/class reputation baseline from
Faction.dbc - the piece extract-dbc-names.py's plain id->name lookup
doesn't cover, needed to correctly compute Exalted status.

Why this is a separate step: character_reputation.standing is NOT the
character's total reputation with a faction - it's a delta on top of a
baseline that depends on the character's own race and class. Confirmed
directly against AzerothCore's ReputationMgr.cpp:

  GetReputation() returns GetBaseReputation(factionEntry) + standing
  GetBaseReputation() walks FactionEntry's 4 (raceMask, classMask,
  baseValue) slots and returns the baseValue of the first slot whose
  raceMask/classMask matches the character (via Unit::getRaceMask() /
  getClassMask(), both `1 << (id - 1)` - the standard WoW bitmask
  encoding, confirmed against Unit.h)

For most factions every baseValue is 0 (no race/class ever gets a
baseline bump), so this script only outputs factions where at least one
of the 4 slots has a nonzero baseValue - the ones this actually matters
for. Everything else is safe to treat as baseline 0.

Field offsets are from AzerothCore's own DBCStructure.h (FactionEntry):
  field 0: ID
  field 1: reputationListID (signed int32) - FactionEntry::CanHaveReputation()
  is `reputationListID >= 0`; most of Faction.dbc's ~400 rows are NPC
  hostility factions or other non-trackable entries with a negative
  value here, not real "shows up on your reputation pane" factions, so
  this is included for every row specifically to filter those out.
  fields 2-5: BaseRepRaceMask[4]
  fields 6-9: BaseRepClassMask[4]
  fields 10-13: BaseRepValue[4] (signed int32, unlike every other field
  in this table, which are unsigned)

Usage:
  python3 extract-faction-baselines.py Faction.dbc -o faction_baselines.json
"""
import argparse
import json
import struct
import sys

MAGIC = b"WDBC"


def parse_dbc(path):
    with open(path, "rb") as f:
        data = f.read()

    if data[:4] != MAGIC:
        sys.exit(f"{path}: not a WDBC file (bad magic {data[:4]!r})")

    record_count, field_count, record_size, string_block_size = struct.unpack_from("<4I", data, 4)
    records_start = 20

    records = []
    for i in range(record_count):
        rec_offset = records_start + i * record_size
        fields = struct.unpack_from(f"<{field_count}I", data, rec_offset)
        records.append(fields)

    return records, field_count, record_count


def to_signed(u32):
    return struct.unpack("<i", struct.pack("<I", u32))[0]


def main():
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("dbc_path", help="Path to Faction.dbc")
    parser.add_argument("-o", "--output", required=True, help="Output JSON path")
    args = parser.parse_args()

    records, field_count, record_count = parse_dbc(args.dbc_path)
    print(f"{args.dbc_path}: {record_count} records, {field_count} fields per record", file=sys.stderr)

    if field_count < 14:
        sys.exit(f"This file only has {field_count} fields - expected at least 14 (BaseRepValue ends at field 13). Wrong file?")

    factions = {}
    trackable_count = 0
    for fields in records:
        row_id = fields[0]
        reputation_list_id = to_signed(fields[1])
        if reputation_list_id < 0:
            continue
        trackable_count += 1
        race_masks = fields[2:6]
        class_masks = fields[6:10]
        base_values = [to_signed(v) for v in fields[10:14]]
        entry = {"reputation_list_id": reputation_list_id}
        if any(base_values):
            entry["race_masks"] = list(race_masks)
            entry["class_masks"] = list(class_masks)
            entry["base_values"] = base_values
        factions[str(row_id)] = entry

    with open(args.output, "w") as f:
        json.dump(factions, f, separators=(",", ":"), sort_keys=True)

    print(f"Wrote {trackable_count} trackable factions (reputationListID >= 0) to {args.output}, "
          f"{sum(1 for e in factions.values() if 'base_values' in e)} of them with a nonzero baseline "
          f"(out of {record_count} total rows in the file)", file=sys.stderr)


if __name__ == "__main__":
    main()
