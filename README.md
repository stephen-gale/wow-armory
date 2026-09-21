# WoW Armory

A character armory web app for a solo AzerothCore (3.3.5a) + Playerbots
private server, hosted on GitHub Pages — named and styled after the same
kind of "armory" sites/apps that exist for retail WoW. Starts with a
character dashboard; more tools can be added later.

Live app (once Pages is enabled): `https://stephen-gale.github.io/wow-armory/`

## Character Dashboard

`index.html` / `style.css` / `app.js` — a static, dependency-free page that
reads a `characters.json` file and renders your roster grouped by faction
(Alliance / Horde), with level, race/class, gold, achievement points, and
played time.

On load, it auto-fetches `characters.json` from this repo (see below), so
once that's wired up the dashboard just works when you open the page — no
manual step needed. A small `Load characters.json manually` link at the
bottom of the page is kept as a fallback, in case the auto-publish step
ever fails and you want to load a file directly.

Faction crests, class icons, and race icons are bundled directly in this
repo at `assets/icons/*.png` (originally sourced from
[Gethe/wow-ui-textures](https://github.com/Gethe/wow-ui-textures), a
GitHub mirror of Blizzard's UI texture files — `wow.zamimg.com`/
`wowhead.com` turned out to be unreachable from the server this dashboard
is maintained from, hence pulling from GitHub instead of hotlinking or
downloading at deploy time). No runtime or build-time fetch of any kind —
the PNGs just sit in the repo like any other static asset. Icon names are
defined in `CLASS_ICON_SLUGS` / `FACTION_ICON_SLUGS` / `RACE_ICON_SLUGS`
in `app.js`, mapped to lowercase filenames in `assets/icons/`. If an icon
file is ever missing, it's silently removed (logged to the browser
console as `icon failed to load: ...`) rather than showing a
broken-image box — falls back to the plain text/color layout.

To add a class/race combo not already covered (shouldn't happen for a
3.3.5a server), grab the matching PNG from
`Gethe/wow-ui-textures`'s `ICONS/` folder, drop it in `assets/icons/`
under the naming convention above, and add the slug to the relevant map
in `app.js`.

Stat rows (gold, achievements, played time — both the per-faction summary
and each character row) use icons instead of text labels: the gold coin
(`assets/icons/ui_goldicon.png`, from `MONEYFRAME/UI-GoldIcon.PNG`) and
the achievement badge (`assets/icons/ui_achievement_tinyshield.png`, from
`ACHIEVEMENTFRAME/UI-Achievement-TinyShield.PNG`) are real assets from the
same `Gethe/wow-ui-textures` mirror. The played-time clock
(`assets/icons/clock.svg`) is a plain drawn icon, since WoW's own UI has
no standalone "time played" glyph — everything else in this app is a real
game asset by design, this one icon is the deliberate exception. Both
rows list stats in the same order: gold, achievements, played.

### Achievement & Collections detail (tap a character)

Tapping/clicking a character row expands a panel with two separate,
clearly-labeled systems:

- **Achievements** — the character's real completed Blizzard achievements,
  grouped by category exactly as Blizzard's own category tree has them, no
  custom grouping on top (so e.g. gear-related achievements show under the
  real nested "Gear" category rather than an invented bucket).
- **Collections** — a custom, companion-app-only tracking system (see
  below) that is **not** part of Blizzard's achievement system at all —
  a different concept, kept visually and structurally separate.

Achievements are powered by two bundled, static reference files,
`assets/data/achievements.json` and `assets/data/achievement_categories.json`
— id/name/category/points data for all 1,817 WotLK 3.3.5a (build 12340)
achievements and their 86 categories. Sourced from
[r-o-b-o-t-o/azerothcore-armory](https://github.com/r-o-b-o-t-o/azerothcore-armory)
(MIT licensed), which ships this as CSV exported from the same client
build's `Achievement.dbc`/`Achievement_Category.dbc`. Like the icons, this
is fetched once and committed — no runtime dependency. The per-character
`achievements` array in `characters.json` (see below) is just a list of
completed achievement IDs; the dashboard resolves names/categories/points
against this bundled data at render time.

### Collections

A custom tracking system for things worth showing off that aren't part of
Blizzard's own achievement system — named and modeled after the
"Collections" sections other WoW armory sites/apps have, for mounts,
pets, toys, tabards, and so on. **Gear** is the first collection category
built; more (Mounts, Pets, Tabards, etc.) can be added later as siblings
without changing anything already here. Nothing about this touches the
AzerothCore server, DBC files, or the live game — detection and storage
both happen entirely in the export scripts and `characters.json`.

#### Gear

Equipping a full named gear set (raid tier sets, dungeon sets, and a
handful of other notable sets), covering Classic through WotLK content.

- **Data source**: `assets/data/collections/gear.json`, a static list of
  every curated set — id, display name, category/tier, class or armor
  type, and the item ids that make it up (grouped by equipment slot, since
  a few sets have more than one valid item per slot — e.g. a
  faction-specific pair sharing one display name). Generated from the
  [nexus-devs/wow-classic-items](https://github.com/nexus-devs/wow-classic-items)
  dataset, cross-checked item by item against real tooltip set groupings,
  acquisition source, and item level banding.
- **Detection**: the export scripts (`scripts/export-characters-json.sh`,
  and the equivalent block in `wowbackup.sh`) query each character's
  *currently equipped* items only (`character_inventory.bag = 0`, slot
  0-18 — not bags or bank) and check them against every set's item ids. A
  set is earned when every one of its slot groups has a match currently
  equipped.
- **Sticky, one-per-variant**: once earned, a Gear collection is
  permanent — it's never re-derived from scratch, only added to. Each run
  unions its freshly-detected sets into whatever was already recorded in
  the previous `characters.json`, so swapping gear away later never
  removes it. Each spec/faction/difficulty variant of a set (e.g. 10- and
  25-player Wrath tier armor, or the Horde/Alliance names for Tier 9) is
  its own separate collection.
- Each is worth 10 points, shown under their own "Gear" grouping in the
  detail panel's Collections section — kept entirely separate from the
  real `achievement_points`/`achievement_count` totals, which only ever
  reflect actual Blizzard achievements.

### `characters.json` shape

```json
{
  "generated_at": "2026-09-20T04:00:00Z",
  "characters": [
    {
      "guid": 1,
      "name": "Brannthor",
      "account": "steve",
      "race_id": 3,
      "race_name": "Dwarf",
      "class_id": 1,
      "class_name": "Warrior",
      "faction": "Alliance",
      "level": 80,
      "money_copper": 4582311,
      "achievement_points": 3120,
      "achievement_count": 130,
      "played_time_seconds": 1234567,
      "achievements": [6, 42, 556],
      "collections": {
        "gear": ["t0_warrior", "t1_warrior"]
      }
    }
  ]
}
```

`achievements` is the character's completed achievement IDs, straight from
`acore_characters.character_achievement` — no names/categories attached
here. The dashboard resolves those client-side against the bundled
reference data (see below).

Schema matches the achievement columns used by `wowbackup.sh`'s own progress
report: `acore_characters.character_achievement_points(guid, total_points,
total_achievements)`.

`collections` is the custom, companion-app-only tracking system — see
[Collections](#collections) above. `collections.gear` is the Gear
category's earned ids; future categories (mounts, pets, tabards, etc.)
would land as sibling keys alongside `gear`. Unlike `achievements`, these
ids are never recomputed from scratch: once one appears here, the export
scripts always carry it forward, even if the character no longer has the
set equipped.

### Privacy note

`wow-armory` is a **public** repo, and GitHub Pages serves it to anyone
with the URL. The published `characters.json` (the copy this repo commits
and the dashboard auto-fetches) intentionally **omits the `account`
field** so real account usernames aren't exposed — everything else
(character names, level, gold, playtime, achievement points) is visible to
anyone who finds the site. If that's not okay, don't wire up the
auto-push step below and stick to the manual file picker instead.

## Producing and publishing `characters.json`

### One-time setup on the Steam Deck

1. Clone this repo to a stable path outside the timestamped backup dirs,
   e.g.:
   ```bash
   git clone https://github.com/stephen-gale/wow-armory.git /home/deck/wow-armory-data
   cd /home/deck/wow-armory-data
   git config user.name "wowbackup"
   git config user.email "wowbackup@localhost"
   ```
2. Store the `wow` personal access token so `wowbackup.sh` can push
   unattended, scoped to just this clone (not your global git config):
   ```bash
   cd /home/deck/wow-armory-data
   git config credential.helper store
   echo "https://stephen-gale:<YOUR_PAT>@github.com" > ~/.git-credentials
   chmod 600 ~/.git-credentials
   ```
   Swap in the real token for `<YOUR_PAT>`. This keeps the token out of the
   backup script itself and out of `ps`/shell history.

### The `wowbackup.sh` addition

`wowbackup.sh` already builds a text progress report (`playtime_by_character.txt`)
straight from `acore_characters.characters` / `acore_auth.account` /
`character_achievement_points`. The block below reshapes the same data as
JSON — writing a **full** copy (with `account`) to `$BACKUP_DIR/characters.json`
so it rides along with the rest of that run's backup as before, and a
**public** copy (without `account`) into the `wow-armory-data` clone,
which it then commits and pushes to GitHub. Paste it into `wowbackup.sh`
right after the existing "Saving progress report..." block (i.e. right
after the `} > "$BACKUP_DIR/playtime_by_character.txt" || { ... }` line)
and before the "Compressing..." step.

It also detects the **Gear collection** (see [Collections](#collections)
above): a second query pulls each character's currently-equipped items,
checks them against `assets/data/collections/gear.json`, and unions any
newly-earned set into whatever was already published to
`wow-armory-data/characters.json` last run, so earned sets are never lost
even after the gear is swapped away. This means `wow-armory-data` needs
the repo's `assets/data/` folder present — since it's a full clone of this
repo, a one-time `git pull` there after this feature first ships is enough
to pick it up (and again any time `assets/data/collections/gear.json`
changes).

```bash
echo "  Saving characters.json..."
REPO_DATA_DIR="/home/deck/wow-armory-data"

# Sync the clone to the latest published state before touching anything in
# it — both so the sticky-collectable merge below reads the true latest
# characters.json (not a stale local copy), and so the commit+push at the
# end of this step is always a clean fast-forward instead of colliding with
# whatever else has been pushed to main since the last backup run (code
# changes, a rename, etc. — this directory is purely an auto-managed
# publish target, never hand-edited, so discarding any local state here is
# always safe).
(cd "$REPO_DATA_DIR" && git fetch origin main && git reset --hard origin/main) \
  || echo "  Warning: failed to sync $REPO_DATA_DIR with origin/main before publishing (non-fatal)"

COLLECTION_GEAR_DEFS="$REPO_DATA_DIR/assets/data/collections/gear.json"
ACHIEVEMENTS_TMP="$(mktemp)"
EQUIPPED_TMP="$(mktemp)"
mysql -h 127.0.0.1 -u acore -pacore -N -B -e "
  SELECT ca.guid, ca.achievement
  FROM acore_characters.character_achievement ca
  JOIN acore_characters.characters c ON c.guid = ca.guid
  JOIN acore_auth.account a ON a.id = c.account
  WHERE a.username NOT LIKE 'RNDBOT%';
" > "$ACHIEVEMENTS_TMP"
mysql -h 127.0.0.1 -u acore -pacore -N -B -e "
  SELECT ci.guid, ii.itemEntry
  FROM acore_characters.character_inventory ci
  JOIN acore_characters.item_instance ii ON ii.guid = ci.item
  JOIN acore_characters.characters c ON c.guid = ci.guid
  JOIN acore_auth.account a ON a.id = c.account
  WHERE ci.bag = 0 AND ci.slot BETWEEN 0 AND 18
    AND a.username NOT LIKE 'RNDBOT%';
" > "$EQUIPPED_TMP"
mysql -h 127.0.0.1 -u acore -pacore -N -B -e "
  SELECT
    c.guid,
    c.name,
    a.username,
    c.race,
    CASE c.race
      WHEN 1 THEN 'Human' WHEN 2 THEN 'Orc' WHEN 3 THEN 'Dwarf' WHEN 4 THEN 'Night Elf'
      WHEN 5 THEN 'Undead' WHEN 6 THEN 'Tauren' WHEN 7 THEN 'Gnome' WHEN 8 THEN 'Troll'
      WHEN 9 THEN 'Goblin' WHEN 10 THEN 'Blood Elf' WHEN 11 THEN 'Draenei'
      ELSE 'Unknown'
    END,
    c.class,
    CASE c.class
      WHEN 1 THEN 'Warrior' WHEN 2 THEN 'Paladin' WHEN 3 THEN 'Hunter' WHEN 4 THEN 'Rogue'
      WHEN 5 THEN 'Priest' WHEN 6 THEN 'Death Knight' WHEN 7 THEN 'Shaman' WHEN 8 THEN 'Mage'
      WHEN 9 THEN 'Warlock' WHEN 11 THEN 'Druid'
      ELSE 'Unknown'
    END,
    CASE
      WHEN c.race IN (1,3,4,7,11) THEN 'Alliance'
      WHEN c.race IN (2,5,6,8,9,10) THEN 'Horde'
      ELSE 'Unknown'
    END,
    c.level,
    c.money,
    COALESCE(cap.total_points, 0),
    COALESCE(cap.total_achievements, 0),
    c.totaltime
  FROM acore_characters.characters c
  JOIN acore_auth.account a ON a.id = c.account
  LEFT JOIN acore_characters.character_achievement_points cap ON cap.guid = c.guid
  WHERE a.username NOT LIKE 'RNDBOT%'
  ORDER BY c.totaltime DESC;
" | python3 -c "
import sys, json, datetime, os
from collections import defaultdict

achievements_by_guid = defaultdict(list)
with open('$ACHIEVEMENTS_TMP') as f:
    for line in f:
        line = line.rstrip('\n')
        if not line:
            continue
        guid, achievement_id = line.split('\t')
        achievements_by_guid[int(guid)].append(int(achievement_id))

# Currently-equipped item entries per character (bag=0, slot 0-18 — actual
# gear, not bags/bank).
equipped_by_guid = defaultdict(set)
with open('$EQUIPPED_TMP') as f:
    for line in f:
        line = line.rstrip('\n')
        if not line:
            continue
        guid, item_entry = line.split('\t')
        equipped_by_guid[int(guid)].add(int(item_entry))

with open('$COLLECTION_GEAR_DEFS') as f:
    collection_gear_defs = json.load(f)

def detect_collection_gear(equipped_ids):
    # Earned when the character has at least one item from EVERY slot group
    # equipped right now (each slot group lists interchangeable item ids for
    # that slot — a 'Conquest'-suffixed variant and its plain counterpart, or
    # a Horde/Alliance pair sharing one display name).
    earned = []
    for gs in collection_gear_defs:
        if all(any(item_id in equipped_ids for item_id in group) for group in gs['slot_groups']):
            earned.append(gs['id'])
    return earned

# Sticky: once earned, a collection is never removed, even after the gear
# is swapped away. Union this run's live detection with whatever was
# already published to the repo (the ongoing source of truth) last run.
previous_collection_gear_by_guid = defaultdict(set)
prev_path = '$REPO_DATA_DIR/characters.json'
if os.path.exists(prev_path):
    try:
        with open(prev_path) as f:
            previous_data = json.load(f)
        for prev_char in previous_data.get('characters', []):
            previous_gear = prev_char.get('collections', {}).get('gear', [])
            previous_collection_gear_by_guid[prev_char['guid']] = set(previous_gear)
    except (json.JSONDecodeError, OSError):
        pass  # first run, or an unreadable/corrupt previous file — start fresh

characters = []
for line in sys.stdin:
    line = line.rstrip('\n')
    if not line:
        continue
    (guid, name, account, race, race_name, cls, class_name,
     faction, level, money, ap, ac, played) = line.split('\t')
    guid = int(guid)
    newly_detected = detect_collection_gear(equipped_by_guid.get(guid, set()))
    collection_gear = sorted(previous_collection_gear_by_guid.get(guid, set()) | set(newly_detected))
    characters.append({
        'guid': guid,
        'name': name,
        'account': account,
        'race_id': int(race),
        'race_name': race_name,
        'class_id': int(cls),
        'class_name': class_name,
        'faction': faction,
        'level': int(level),
        'money_copper': int(money),
        'achievement_points': int(ap),
        'achievement_count': int(ac),
        'played_time_seconds': int(played),
        'achievements': sorted(achievements_by_guid.get(guid, [])),
        'collections': {
            'gear': collection_gear,
        },
    })

generated_at = datetime.datetime.utcnow().strftime('%Y-%m-%dT%H:%M:%SZ')

with open('$BACKUP_DIR/characters.json', 'w') as f:
    json.dump({'generated_at': generated_at, 'characters': characters}, f, indent=2)

public_characters = [{k: v for k, v in c.items() if k != 'account'} for c in characters]
with open('$REPO_DATA_DIR/characters.json', 'w') as f:
    json.dump({'generated_at': generated_at, 'characters': public_characters}, f, indent=2)

print(f'  characters.json: wrote {len(characters)} characters')
" || { echo "Failed: characters.json export"; exit 1; }
rm -f "$ACHIEVEMENTS_TMP" "$EQUIPPED_TMP"

echo "  Publishing characters.json to GitHub..."
(
  cd "$REPO_DATA_DIR" \
    && git add characters.json \
    && if ! git diff --cached --quiet; then
         git commit -m "Update character data $TIMESTAMP" \
           && git push origin main
       else
         echo "  No character data changes to publish."
       fi
) || echo "  Warning: failed to publish characters.json to GitHub (non-fatal)"
```

This reuses the same `-h 127.0.0.1 -u acore -pacore` credentials already in
`wowbackup.sh` — if those ever change, update them here too. The publish
step is wrapped so a network hiccup or GitHub being down doesn't fail the
whole backup run (same pattern as the existing Drive-rotation warnings).

Once this is wired in and `wowbackup.sh` runs, the dashboard picks up the
new data automatically on next page load/refresh — no manual file step
needed. The full copy (with `account`) still lands at
`$BACKUP_DIR/characters.json` and gets synced to Drive as before, for your
own records.

`scripts/export-characters-json.sh` in this repo is the same query as a
standalone script (with configurable `DB_HOST`/`DB_USER`/`OUTPUT_DIR` env
vars), useful for regenerating `characters.json` on its own without running
a full backup. It still includes `account` — redact it yourself before
publishing if you use it standalone for that purpose.

## GitHub Pages

This repo is set up to be served straight from the root of `main` — no
build step. To turn it on (one-time):

1. On GitHub, go to the repo's **Settings → Pages**.
2. Under **Build and deployment**, set **Source** to `Deploy from a
   branch`, branch `main`, folder `/ (root)`.
3. Save. The app will be live at
   `https://stephen-gale.github.io/wow-armory/` shortly after.

## Roadmap

- Additional dashboard views (achievements, playtime trends over multiple
  backups, etc.).
