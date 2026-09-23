#!/usr/bin/env python3
"""
generate-titles-collection-data.py

Regenerates assets/data/collections/titles.json - the reference data for
the Titles Collection category (see app.js/README). Unlike every other
Collections category, this can't be generated from a static DBC-derived
CSV: titles come from CharTitles.dbc, and nobody has published a CSV
export of it from the same r-o-b-o-t-o/azerothcore-armory source this
project uses for Item/Achievement/Talent data. But AzerothCore itself
mirrors CharTitles.dbc into a live-queryable world-DB table,
`chartitles_dbc` - so this is a one-time export straight from your own
server instead, no external source needed at all.

One-time steps to (re)generate titles.json:

  1. On your server, dump the table to TSV (only titles with a nonzero
     Mask_ID are real, selectable titles - a couple of placeholder/unused
     rows in the dbc have Mask_ID 0 and are skipped):

       mysql -h 127.0.0.1 -u acore -pacore -N -B -e "
         SELECT ID, Name_Lang_enUS, Name1_Lang_enUS, Mask_ID
         FROM acore_world.chartitles_dbc
         WHERE Mask_ID > 0
         ORDER BY ID;
       " > chartitles_dump.tsv

  2. Run this script against that dump:

       python3 generate-titles-collection-data.py chartitles_dump.tsv assets/data/collections/titles.json

Only needs re-running if this project ever moves to a different client
build (chartitles_dbc's content is fixed forever for 3.3.5.12340, same
reasoning as every other bundled DBC-derived reference file here).

Output shape: [{"id": <CharTitles ID>, "bit_index": <Mask_ID>, "name":
<male-form template>, "name_female": <female-form template>}, ...]. Both
name fields keep Blizzard's own "%s" placeholder intact (e.g. "%s the
Explorer", "Elder %s") - app.js substitutes the character's own name into
it at render time, rather than this script (or anything server-side)
guessing at prefix/suffix formatting per title.

`id` is the real CharTitles.dbc ID - the same id `character_export`'s
achievement_reward cross-reference and `chosenTitle` resolution both use,
so a title's entry here is addressable the same way from every angle
(the sticky collections.titles entries, and the top-level active_title_id).
`bit_index` (Mask_ID) is only needed by the export scripts, to decode a
character's `knownTitles` bitmask into a set of these same ids - never
used for client-side rendering.
"""
import csv
import json
import sys


def main():
    if len(sys.argv) != 3:
        sys.exit(f"Usage: {sys.argv[0]} <chartitles_dbc dump.tsv> <output-path>")
    dump_path, output_path = sys.argv[1], sys.argv[2]

    titles = []
    with open(dump_path, encoding="utf-8") as f:
        for row in csv.reader(f, delimiter="\t"):
            title_id, name_male, name_female, bit_index = row
            titles.append({
                "id": int(title_id),
                "bit_index": int(bit_index),
                "name": name_male,
                "name_female": name_female or name_male,
            })

    titles.sort(key=lambda t: t["id"])
    with open(output_path, "w") as f:
        json.dump(titles, f, indent=2)

    print(f"Wrote {len(titles)} titles to {output_path}")


if __name__ == "__main__":
    main()
