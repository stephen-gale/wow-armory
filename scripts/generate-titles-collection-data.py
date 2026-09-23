#!/usr/bin/env python3
"""
generate-titles-collection-data.py

Regenerates assets/data/collections/titles.json - the reference data for
the Titles Collection category (see app.js/README): every title id this
project can currently detect, with its display name.

Detection is scoped to achievement-granted titles only, not every title
source in the game (see README's Titles section for the full reasoning).
The mechanically "complete" alternative - decoding characters.knownTitles,
the bitmask the game itself uses, which would catch every source - needs
each title's CharTitles.dbc bit_index to decode against, and that data
turns out not to exist anywhere reachable: AzerothCore's own source
repos never ship chartitles_dbc populated (confirmed by checking both
azerothcore-wotlk and the separate database-wotlk content repo - neither
seeds it), and getting it populated means extracting the real client's
CharTitles.dbc file and running a separate community tool against it, not
something to assume a server has done. Achievement data has no such gap:
this project already bundles it (assets/data/achievements.json, from the
same source this script reads), and Blizzard's own achievement reward
tooltip text doubles as a usable title label.

`id` here is simply the granting achievement's id - the same id already
in every character's `achievements` array, so detection needs no new DB
query at all: a completed achievement whose id appears here means the
character has that title, with that achievement's own real completion
date (see the export scripts' dedicated titles block, not the generic
CATEGORIES sticky-fallback loop every other category uses - a title's
date is never a guess here, so there's nothing to fall back to).

Achievement_3.3.5_12340.csv's Reward_lang[0] field is Blizzard's own
human-readable tooltip text for what an achievement grants (e.g. "Title
Reward: Elder") - only rows starting with that literal prefix grant an
actual title (everything else - items, tabards, spells - uses a
different prefix, e.g. "Reward: Tabard of ..."). The raw text needs a
little more than a straight prefix-strip in a couple of cases:

- The ten "Exalted Champion of <capital city>" achievements only reward
  the suffix fragment ("of Stormwind") in Reward_lang[0], since the
  in-game title itself is "Champion of <city>" - reconstructed here by
  prepending "Champion " to the reward text specifically for these known
  ids, not guessed from the text shape.
- The two Argent Tournament "Exalted Argent Champion" achievements (2816,
  2817) carry an explanatory sentence after the title itself ("Title
  Reward: Crusader. Unlocks Crusader dailies...") - only the first
  sentence is kept.
- "100000 Honorable Kills" (id 870) rewards a faction-conditional title
  ("Of the Horde or Of the Alliance") - kept as the raw combined text
  rather than split per-faction, since resolving it correctly needs a
  per-character lookup this simple id->name reference file can't carry,
  and PvP kill tracking is already out of scope on this server (bots are
  off) - not expected to ever actually show up.

Usage:
  python3 generate-titles-collection-data.py <Achievement.csv> <output-path>
"""
import csv
import json
import sys

PREFIX = "title reward:"

# achievement id -> "Champion " gets prepended to the raw reward text.
# Verified individually against each achievement's own name (all ten
# "Exalted Champion of <capital>" achievements), not pattern-guessed.
CHAMPION_OF_CITY_IDS = {
    2760,  # Exalted Champion of Darnassus
    2761,  # Exalted Champion of the Exodar
    2762,  # Exalted Champion of Gnomeregan
    2763,  # Exalted Champion of Ironforge
    2764,  # Exalted Champion of Stormwind
    2765,  # Exalted Champion of Orgrimmar
    2766,  # Exalted Champion of Sen'jin
    2767,  # Exalted Champion of Silvermoon City
    2768,  # Exalted Champion of Thunder Bluff
    2769,  # Exalted Champion of the Undercity
}

# achievement id -> only the text up to (not including) the first period
# is the actual title; the rest is unrelated explanatory tooltip text.
TRUNCATE_AT_PERIOD_IDS = {
    2816,  # Exalted Argent Champion of the Horde -> "Crusader"
    2817,  # Exalted Argent Champion of the Alliance -> "Crusader"
}


def clean(raw):
    text = raw.strip()
    assert text.lower().startswith(PREFIX), text
    return text[len(PREFIX):].strip()


def main():
    if len(sys.argv) != 3:
        sys.exit(f"Usage: {sys.argv[0]} <Achievement.csv> <output-path>")
    achievement_csv, output_path = sys.argv[1], sys.argv[2]

    titles = []
    with open(achievement_csv, encoding="utf-8") as f:
        for row in csv.DictReader(f):
            raw = row["Reward_lang[0]"].strip()
            if not raw.lower().startswith(PREFIX):
                continue
            achievement_id = int(row["ID"])
            text = clean(raw)

            if achievement_id in CHAMPION_OF_CITY_IDS:
                text = f"Champion {text}"
            elif achievement_id in TRUNCATE_AT_PERIOD_IDS:
                text = text.split(".", 1)[0].strip()

            titles.append({"id": achievement_id, "name": text})

    titles.sort(key=lambda t: t["id"])
    with open(output_path, "w") as f:
        json.dump(titles, f, indent=2)

    print(f"Wrote {len(titles)} achievement-granted titles to {output_path}")


if __name__ == "__main__":
    main()
