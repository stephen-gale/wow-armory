#!/usr/bin/env python3
"""
extract-dbc-names.py

Extracts an id -> English name lookup from a WDBC file (the classic
WoW 3.3.5.12340 client data format), for the two currently-blocked
naming backlog items: AreaTable.dbc (Zone last logged out in) and
Faction.dbc (Exalted factions list).

Your worldserver already has both files locally - it can't boot without
them. Look under wherever AzerothCore's data path points, typically a
`dbc` folder next to your server binaries (e.g. env/dist/data/dbc/ or
similar, depending on how you set the server up).

Field offsets below are taken directly from AzerothCore's own
DBCStructure.h (src/server/shared/DataStores/DBCStructure.h) - the exact
struct the server itself uses to read these files - not assumed:

  AreaTableEntry: field 0 = ID, field 11 = area_name[0] (first locale
  slot). characters.zone stores this same ID directly.

  FactionEntry: field 0 = ID, field 23 = name[0] (first locale slot).
  character_reputation.faction stores this same ID directly - confirmed
  against ReputationMgr::LoadFromDB, which looks up
  sFactionStore.LookupEntry(fields[0]) on the raw DB column, i.e. by the
  DBC's own ID field, not some other index.

Locale slot [0] is enUS for a standard English client, matching the
same "index 0 = English" convention this project already uses for
Achievement_3.3.5_12340.csv's Reward_lang[0] and TalentTab's
Name_lang[0]. If your client isn't English, your primary locale may sit
in a different slot (up to 16 locale slots exist per string field) -
pass --name-locale to pick a different one, or run with --list-locales
to see every non-empty candidate string per row and check by eye.

The WDBC format itself (header + fixed-size records + trailing
null-terminated string block, string fields stored as a uint32 offset
into that block) is the standard, stable binary layout every WDBC file
from this era uses - not specific to these two files.

Usage:
  python3 extract-dbc-names.py AreaTable.dbc --id-field 0 --name-field 11 -o area_names.json
  python3 extract-dbc-names.py Faction.dbc --id-field 0 --name-field 23 -o faction_names.json

Output is a compact JSON object: {"<id>": "<name>", ...} - paste the
whole file back, or just the two output files, whichever is easier.
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
        sys.exit(f"{path}: not a WDBC file (bad magic {data[:4]!r}) - wrong file, or a newer/different format")

    record_count, field_count, record_size, string_block_size = struct.unpack_from("<4I", data, 4)
    header_size = 20
    records_start = header_size
    string_block_start = records_start + record_count * record_size

    if len(data) < string_block_start + string_block_size:
        sys.exit(f"{path}: file shorter than header claims - truncated download?")

    string_block = data[string_block_start:string_block_start + string_block_size]

    def read_string(offset):
        if offset == 0:
            return ""
        end = string_block.index(b"\x00", offset)
        return string_block[offset:end].decode("utf-8", errors="replace")

    records = []
    for i in range(record_count):
        rec_offset = records_start + i * record_size
        fields = struct.unpack_from(f"<{field_count}I", data, rec_offset)
        records.append(fields)

    return records, read_string, field_count, record_count


def main():
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("dbc_path", help="Path to the .dbc file (e.g. AreaTable.dbc)")
    parser.add_argument("--id-field", type=int, required=True, help="0-based field index holding the row's ID")
    parser.add_argument("--name-field", type=int, required=True,
                         help="0-based field index holding the name string's locale-0 slot (e.g. 11 for AreaTable, 23 for Faction)")
    parser.add_argument("-o", "--output", required=True, help="Output JSON path")
    parser.add_argument("--list-locales", action="store_true",
                         help="Instead of writing output, print every non-empty locale string (fields name-field..name-field+15) for the first few rows, to help pick the right slot for a non-English client")
    args = parser.parse_args()

    records, read_string, field_count, record_count = parse_dbc(args.dbc_path)
    print(f"{args.dbc_path}: {record_count} records, {field_count} fields per record", file=sys.stderr)

    if args.id_field >= field_count or args.name_field >= field_count:
        sys.exit(f"--id-field/--name-field out of range (this file only has {field_count} fields, 0-{field_count - 1})")

    if args.list_locales:
        for fields in records[:5]:
            row_id = fields[args.id_field]
            print(f"id={row_id}:")
            for locale in range(16):
                idx = args.name_field + locale
                if idx >= field_count:
                    break
                s = read_string(fields[idx])
                if s:
                    print(f"  locale[{locale}] (field {idx}): {s!r}")
        return

    names = {}
    for fields in records:
        row_id = fields[args.id_field]
        name = read_string(fields[args.name_field])
        if name:
            names[str(row_id)] = name

    with open(args.output, "w") as f:
        json.dump(names, f, separators=(",", ":"), sort_keys=True)

    print(f"Wrote {len(names)} id -> name entries to {args.output}", file=sys.stderr)


if __name__ == "__main__":
    main()
