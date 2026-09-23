#!/usr/bin/env python3
"""
generate-titles-data.py

Regenerates assets/data/titles.json - a static {achievement id: title text}
map used to show every Feat of Strength/achievement-granted title a
character has earned (see app.js). Client data only, no DB access.

Why achievement id, not a CharTitles.dbc id: titles are actually granted
server-side via the `achievement_reward` world-DB table (title_A/title_H
columns, a real CharTitles.dbc id each), looked up live when an
achievement completes - see AzerothCore's AchievementMgr.cpp. There is no
CharTitles.dbc-derived CSV available from the same r-o-b-o-t-o/
azerothcore-armory source this project already uses for Item/Achievement/
Talent data (unlike those, nobody has published one), and reading the raw
DBC would need the actual client file, which isn't available here. So
this deliberately sidesteps CharTitles.dbc entirely: Achievement_3.3.5_
12340.csv's own Reward_lang[0] field is Blizzard's human-readable tooltip
text for what an achievement grants (e.g. "Title Reward: Elder"), already
bundled in the same achievements.json this project resolves achievement
names from. A completed achievement's title, if any, is looked up here by
the SAME achievement id already in character_achievement/characters.json
- no new query, no new characters.json field, no CharTitles bit-index
decoding needed at all.

The trade-off, stated plainly: this only covers achievement-granted
titles. A handful of WotLK titles come from quests (e.g. quest_template.
RewardTitle) or other non-achievement sources instead, and won't appear
here - same kind of deliberate, documented gap as Collections' Blood
Parrot exception, not an oversight.

Only rows whose Reward_lang[0] literally starts with "Title Reward:" are
included (every other reward type - items, tabards, spells - uses a
different prefix, e.g. "Reward: Tabard of ..."). The raw tooltip text
needs a little more than a straight prefix-strip in a handful of cases:

- The ten "Exalted Champion of <capital city>" achievements only reward
  the suffix fragment ("of Stormwind") in Reward_lang[0], since the
  in-game title itself is "Champion of <city>" - reconstructed here by
  prepending "Champion " to the reward text specifically for these known
  ids, not guessed from the text shape.
- "100000 Honorable Kills" (id 870) rewards a faction-conditional title
  ("Of the Horde or Of the Alliance") - stored here as a {faction: text}
  dict instead of a bare string so app.js can pick the right half; every
  other entry is a bare string.
- The two Argent Tournament "Exalted Argent Champion" achievements (2816,
  2817) carry an explanatory sentence after the title itself ("Title
  Reward: Crusader. Unlocks Crusader dailies...") - only the first
  sentence is kept.

Usage:
  python3 generate-titles-data.py <Achievement.csv> <output-path>
"""
import csv
import json
import sys

PREFIX = "title reward:"

# achievement id -> "Champion " gets prepended to the raw reward text.
# Verified individually against each achievement's own name (all ten
# "Exalted Champion of <capital>" achievements), not pattern-guessed.
CHAMPION_OF_CITY_IDS = {
    "2760",  # Exalted Champion of Darnassus
    "2761",  # Exalted Champion of the Exodar
    "2762",  # Exalted Champion of Gnomeregan
    "2763",  # Exalted Champion of Ironforge
    "2764",  # Exalted Champion of Stormwind
    "2765",  # Exalted Champion of Orgrimmar
    "2766",  # Exalted Champion of Sen'jin
    "2767",  # Exalted Champion of Silvermoon City
    "2768",  # Exalted Champion of Thunder Bluff
    "2769",  # Exalted Champion of the Undercity
}

# achievement id -> only the text up to (not including) the first period
# is the actual title; the rest is unrelated explanatory tooltip text.
TRUNCATE_AT_PERIOD_IDS = {
    "2816",  # Exalted Argent Champion of the Horde -> "Crusader"
    "2817",  # Exalted Argent Champion of the Alliance -> "Crusader"
}

# achievement id -> faction-conditional title text, split on " or ".
FACTION_SPLIT_IDS = {"870"}  # 100000 Honorable Kills


def clean(raw):
    text = raw.strip()
    assert text.lower().startswith(PREFIX), text
    return text[len(PREFIX):].strip()


def main():
    if len(sys.argv) != 3:
        sys.exit(f"Usage: {sys.argv[0]} <Achievement.csv> <output-path>")
    achievement_csv, output_path = sys.argv[1], sys.argv[2]

    titles = {}
    with open(achievement_csv, encoding="utf-8") as f:
        for row in csv.DictReader(f):
            raw = row["Reward_lang[0]"].strip()
            if not raw.lower().startswith(PREFIX):
                continue
            achievement_id = row["ID"]
            text = clean(raw)

            if achievement_id in CHAMPION_OF_CITY_IDS:
                text = f"Champion {text}"
            elif achievement_id in TRUNCATE_AT_PERIOD_IDS:
                text = text.split(".", 1)[0].strip()
            elif achievement_id in FACTION_SPLIT_IDS:
                horde_part, _, alliance_part = text.partition(" or ")
                text = {"Horde": horde_part.strip(), "Alliance": alliance_part.strip()}

            titles[achievement_id] = text

    with open(output_path, "w") as f:
        json.dump(titles, f, indent=2, sort_keys=True)

    print(f"Wrote {len(titles)} achievement-granted titles to {output_path}")


if __name__ == "__main__":
    main()
