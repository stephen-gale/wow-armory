# WoW Armory

A character armory web app for a solo AzerothCore (3.3.5a) + Playerbots
private server, hosted on GitHub Pages — named and styled after the same
kind of "armory" sites/apps that exist for retail WoW. Starts with a
character dashboard; more tools can be added later.

This file is the technical reference — how each feature works, where its
data comes from, and how to set up and run the publishing pipeline. For
what's shipped, what's in progress, and the ranked backlog of ideas, see
[ROADMAP.md](ROADMAP.md) instead.

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
"Collections" sections other WoW armory sites/apps have. Two tenets drive
every category here: **celebrate accomplishments, not the unobtained**
(nothing here ever lists or counts what a character *doesn't* have — nothing
to hide), and **mechanical, not subjective** — every category is generated
straight from `item_template` by `scripts/generate-collections-data.py`
(see that script's own docstring for the exact rule and rationale behind
each category), never hand-picked or curated. Nothing about any of this
touches the AzerothCore server, DBC files, or the live game — detection and
storage both happen entirely in the export scripts and `characters.json`.

There are six categories: **Sets**, **Mounts**, **Companions**,
**Legendaries**, **Tabards**, and **Heirlooms**. Adding a further one later
is purely a data-file + one-line registration change (`COLLECTION_CATEGORIES`
in `app.js`, the `CATEGORIES` list in the export scripts) — no other code
changes.

#### Sets

Equipping every piece of a named gear set — every set in the game, not a
curated subset, spanning Classic through WotLK content.

- **Data source**: `assets/data/collections/sets.json`, mechanically
  generated from `item_template.itemset` — id, display name (derived by
  intersecting the whitespace-tokenized names of every piece, e.g.
  "Breastplate of Valor" + "Helm of Valor" + ... → "of Valor"), and the
  item ids that make it up, grouped by real equipment slot
  (`InventoryType`) into `slot_groups`. Grouping by slot (rather than by
  itemset id alone) recovers the intended "one piece per slot, any
  interchangeable version counts" structure from itemsets that otherwise
  bundle several interchangeable duplicates under one id (10-/25-player
  tokens, valor-purchased duplicates, etc.).
- **Detection**: the export scripts query each character's *currently
  equipped* items only (`character_inventory.bag = 0`, slot 0-18 — not
  bags or bank) and check them against every set's `slot_groups`. A set is
  earned when at least one item from every slot group is currently
  equipped.
- **Sticky**: once earned, a Set is permanent — never re-derived from
  scratch, only added to. Each run unions its freshly-detected sets into
  whatever was already recorded in the previous `characters.json`, so
  swapping gear away later never removes it.

#### Mounts

Every mount in the game — ordinary trainer mounts included, not just rare
or noteworthy ones — spanning Classic through WotLK content.

- **Data source**: `assets/data/collections/mounts.json`, mechanically
  generated from `item_template` (`class` 15, `subclass` 5 — the game's
  own Mount item subclass) — id, display name, and the mount-learn spell
  id(s) that grant it. A mount with multiple color variants (Netherwing
  Drake, Qiraji Battle Tank) lists every variant's spell id in
  `spell_ids`; knowing any single one is enough — collecting every color
  is never required. It also includes a short list of items Blizzard
  itself filed under the wrong item subclass (`Junk`, subclass 0) but
  which pass the exact same "genuine teach-spell" mechanical test as every
  other entry — see the script's docstring for how those were found and
  verified, not guessed from item names.
- **The one deliberate exception**: a small, explicitly non-mechanical
  list (`TRAINER_TAUGHT_MOUNTS`) for mounts with no backing item at all —
  a Paladin's Warhorse/Charger, a Warlock's Felsteed/Dreadsteed, and a
  Death Knight's Acherus Deathcharger, each learned directly as a spell
  (trainer-taught for the first two, a starting-zone quest reward for the
  last) rather than from an item. There's no query that can enumerate
  "spells that are secretly mounts with no item," so this only grows when
  a specific character's real, known mount turns out to need it — never as
  a speculative completeness pass — each one identified in-game via
  `.lookup spell` since `spell_dbc` is unpopulated for standard spells on
  this server. Warhorse/Charger are directly `[known]`-verified against a
  Paladin who has them; the other three follow the identical "bare name,
  no verb prefix" pattern those two established, but aren't yet verified
  the same way for lack of a Warlock/Death Knight character to check.
- **Detection**: the export scripts query each character's *known spells*
  (`character_spell`, filtered server-side to just the mount-learn spell
  ids this list cares about) and check for a match against each mount's
  `spell_ids`. Unlike `character_achievement`, `character_spell` has no
  timestamp column at all, so there's no real acquisition date to read —
  same sticky-timestamp fallback as Sets (see below).
- **Sticky**: once earned, a Mount is permanent, following the same
  union-with-previous-run pattern as Sets.
- A small number of mounts predate this app and were backfilled once with
  their real acquisition dates (from memory/screenshots, not detection
  time) — see `scripts/apply-date-corrections.py`.

#### Companions

Every non-combat companion pet in the game, same "no curation" bar as
Mounts, spanning Classic through WotLK content.

- **Data source**: `assets/data/collections/companions.json`, same
  generation mechanism as Mounts — `item_template` `class` 15, `subclass`
  2 (the game's own Companion Pet item subclass), plus the same short list
  of genuinely-miscategorized `Junk`-subclass items.
- **Detection**: identical mechanism to Mounts — a companion's teach item
  grants a permanently known `character_spell` entry, same as a mount.
  Both categories are detected from one shared known-spells query (see
  below), just checked against two different data files.
- **Sticky**: same union-with-previous-run pattern as Sets and Mounts.
- One real companion, Blood Parrot, can't be detected this way: unlike
  every other entry, it's summoned by *using* a worn item (unequipping it
  despawns the pet) rather than by knowing a permanent spell, so
  `character_spell`-based detection can't see it. It would need a
  different detection mechanism (inventory + reputation) to ever be added.

#### Legendaries

Equipping any Legendary-quality (orange, `quality` 5) item.

- **Data source**: `assets/data/collections/legendaries.json`, mechanically
  generated from `item_template` — id, display name, and a single-item
  `slot_groups` entry (`[[item_id]]`), the same shape Sets uses, filtered
  to `InventoryType != 0` so quest components/reagents that can never
  actually be equipped don't clutter the file.
- **Detection/sticky**: identical mechanism to Sets — "equipped, all slot
  groups satisfied" reduces to "equipped, this one item" when there's only
  one group of one item, so the same detection function and sticky
  behavior apply unchanged. Equipped-only, not merely owned — useful even
  for a raid leader who collects an item without ever equipping it
  themselves.

#### Tabards

Equipping any Tabard (`InventoryType` 19).

- **Data source**: `assets/data/collections/tabards.json`, same generation
  mechanism and shape as Legendaries.
- **Detection/sticky**: identical mechanism to Sets/Legendaries.

#### Heirlooms

Equipping any Heirloom-quality (`quality` 7) item — displayed differently
from every other category, see below.

- **Data source**: `assets/data/collections/heirlooms.json`, same
  generation mechanism and shape as Legendaries.
- **Detection/storage**: identical mechanism to Legendaries — per
  character, equipped-only, sticky. Stored in `characters.json` exactly
  like every other category.
- **Display is faction-level, not per-character**: heirlooms are
  Bind-on-Account and get mailed between characters, so showing them
  inside each character's own panel would make the same heirloom look
  "earned" over and over as it's handed around the roster. `app.js`
  instead unions every character's detections within a faction into one
  family-wide list (keeping the earliest `earned_at` seen for each item —
  when the family first had it) and renders it once, under that faction's
  character list. This is purely a rendering choice — the underlying data
  is stored identically to Legendaries/Tabards.

### Equipped Gear

A separate feature from Collections, sitting above it in each character's
panel: the character's full current loadout, slot by slot, with a real
item icon next to each piece. Unlike every Collections category, this is
**not sticky** — it's a plain point-in-time snapshot of
`character_inventory`, fully replaced every run, since "what you're
wearing right now" isn't something that gets permanently "earned". It has
no `earned_at` and doesn't appear in the Sort by: Date view for that
reason.

- **Data source**: the export scripts' existing equipped-items query
  (`character_inventory.bag = 0`, slot 0-18 — the same one Collections'
  "equip" categories already use) extended with two columns:
  `character_inventory.slot` and `item_template.name` (joined live from
  `acore_world`, the simplest and most accurate source for whatever's
  actually on the server right now — unlike Collections, no bundled
  reference file is needed for names here).
- **Icons**: resolved client-side in `app.js` against
  `assets/data/item_icons.json` (item id → icon name), generated once by
  `scripts/generate-item-icons.py` from two DBC-derived CSVs (the same
  `r-o-b-o-t-o/azerothcore-armory` source `achievements.json` came from):
  `Item_3.3.5_12340.csv` (item → `DisplayInfoID`) joined against
  `ItemDisplayInfo_3.3.5_12340.csv` (`DisplayInfoID` → icon name). Item ids
  for this build match `item_template.entry` 1:1 for standard content (the
  same assumption every Collections category already relies on), so this
  needs no DB access at all — pure client-data, and complete for every
  equippable item in the game, not just what's currently on the roster.
  The actual icon PNGs are a one-time bundle at `assets/icons/items/*.png`
  from the same `Gethe/wow-ui-textures` mirror the class/race/faction
  icons already use (2,742 of the 2,747 distinct icons this build ever
  needs — the rest silently show no icon, same graceful fallback as any
  other icon in this app).
- **Why new gear "just works"**: this build (3.3.5.12340) is frozen
  forever, so `item_icons.json` already covers every item that could ever
  be equipped, not only what's currently worn — equip something new and
  run `wowbackup`, and the name comes live from the DB while the icon
  resolves from data that was already complete. No re-fetching, no manual
  step, ever — regenerating `item_icons.json` is only ever needed if this
  project moved to a different client build.

### Honor Points

Not a top-level stat yet — per character only, for now. The expanded
panel is three independent modules (Equipped, Collections/Achievements,
PvP), each shown only when it has something to show; PvP is a peer of
the other two, not nested inside Achievements or gated by its Type/Date
toggle (no `earned_at`, so no place in either view), same "plain
current-value stat, always shown including 0" treatment as Equipped
Gear. `honor_points` is already the same top-level-int shape as
`achievement_points`/`money_copper`/`played_time_seconds`, which already
roll up into the faction/account summary stats — so adding it there
later, or a faction/account-level PvP stat, is a one-line change
whenever that's wanted, not a data or schema change.

- **Data source**: `characters.totalHonorPoints`, one existing column,
  added to the export scripts' main character query.
- **Icon**: found from real Blizzard client data, not guessed. Blizzard
  represents Honor Points internally via a currency-wrapper item (id
  `43308`) even though it's not truly an inventory item; that item's
  `DisplayInfoID` (`40753` in `ItemDisplayInfo_3.3.5_12340.csv`) resolves
  to `Spell_Holy_ChampionsBond` — the same official icon the game itself
  uses. Bundled at `assets/icons/spell_holy_championsbond.png` (the small,
  hand-picked UI icon set, not `assets/icons/items/`, since it was
  resolved and fetched individually rather than as part of the bulk
  equippable-item icon set).

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
      "honor_points": 15230,
      "achievements": [
        {"id": 6, "earned_at": "2026-01-04T18:22:10Z"},
        {"id": 42, "earned_at": "2026-02-11T02:47:33Z"},
        {"id": 556, "earned_at": null}
      ],
      "collections": {
        "sets": [
          {"id": "itemset_209", "earned_at": "2026-03-01T20:15:00Z"},
          {"id": "itemset_218", "earned_at": "2026-06-19T23:04:41Z"}
        ],
        "mounts": [
          {"id": "item_13335", "earned_at": "2026-04-12T09:30:00Z"}
        ],
        "companions": [
          {"id": "item_29960", "earned_at": "2026-05-02T16:40:00Z"}
        ],
        "legendaries": [],
        "tabards": [],
        "heirlooms": [
          {"id": "item_42991", "earned_at": "2026-02-14T08:00:00Z"}
        ]
      },
      "equipped_gear": [
        {"slot": 0, "id": 22418, "name": "Dreadnaught Helmet"},
        {"slot": 15, "id": 19019, "name": "Thunderfury, Blessed Blade of the Windseeker"}
      ]
    }
  ]
}
```

`achievements` is the character's completed achievements, straight from
`acore_characters.character_achievement` — no names/categories attached
here, the dashboard resolves those client-side against the bundled
reference data (see below). Each entry's `earned_at` is Blizzard's own
completion date (`character_achievement.date`), converted from a Unix
timestamp to ISO 8601 UTC; it's `null` on the rare achievement whose date
was never recorded (seen as `0` in the raw column).

Schema matches the achievement columns used by `wowbackup.sh`'s own progress
report: `acore_characters.character_achievement_points(guid, total_points,
total_achievements)`.

`collections` is the custom, companion-app-only tracking system — see
[Collections](#collections) above. `collections.sets`, `.mounts`,
`.companions`, `.legendaries`, `.tabards`, and `.heirlooms` are each
category's earned entries; a future category would land as a further
sibling key. Unlike `achievements`, these are never recomputed from
scratch: once an entry appears here, the export scripts always carry it
forward, even if the character no longer has the item equipped — and
`earned_at`, stamped the first time it's detected, is never overwritten on
later runs either, since there's no Blizzard-side date to read for
something that isn't a real achievement (except for a small number of
one-time, hand-verified corrections — see `scripts/apply-date-corrections.py`
and the Mounts section above).

`equipped_gear` is the character's current loadout — see
[Equipped Gear](#equipped-gear) above. Unlike `collections`, this array is
fully replaced every run (no sticky merge, no `earned_at`); `id` is the
item entry, resolved to a name live from `item_template` and to an icon
client-side against `assets/data/item_icons.json`.

`honor_points` is `characters.totalHonorPoints`, read straight through —
see [Honor Points](#honor-points) above.

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

It also detects all six Collections categories (see [Collections](#collections)
above): a second query pulls each character's currently-equipped items and
checks them against the "equip" categories (Sets, Legendaries, Tabards,
Heirlooms); a third pulls each character's known spells (filtered to just
the learn-spell ids Mounts/Companions care about — one shared query for
both) and checks them against those two. Every category unions any
newly-earned entries into whatever was already published to
`wow-armory-data/characters.json` last run, so earned entries are never
lost — the equip categories even after the item is unequipped, Mounts and
Companions regardless (neither can be un-learned). This means
`wow-armory-data` needs the repo's `assets/data/` folder present — since
it's a full clone of this repo, a one-time `git pull` there after this
feature first ships is enough to pick it up (and again any time a
`assets/data/collections/*.json` file changes).

That same equipped-items query also carries [Equipped Gear](#equipped-gear)
(slot and item name, joined live from `item_template`) — unlike
Collections, this one isn't unioned with anything from last run, since
`equipped_gear` is a plain current-loadout snapshot, not something that
accumulates.

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

COLLECTION_SETS_DEFS="$REPO_DATA_DIR/assets/data/collections/sets.json"
COLLECTION_MOUNTS_DEFS="$REPO_DATA_DIR/assets/data/collections/mounts.json"
COLLECTION_COMPANIONS_DEFS="$REPO_DATA_DIR/assets/data/collections/companions.json"
COLLECTION_LEGENDARIES_DEFS="$REPO_DATA_DIR/assets/data/collections/legendaries.json"
COLLECTION_TABARDS_DEFS="$REPO_DATA_DIR/assets/data/collections/tabards.json"
COLLECTION_HEIRLOOMS_DEFS="$REPO_DATA_DIR/assets/data/collections/heirlooms.json"
ACHIEVEMENTS_TMP="$(mktemp)"
EQUIPPED_TMP="$(mktemp)"
KNOWN_SPELLS_TMP="$(mktemp)"
mysql -h 127.0.0.1 -u acore -pacore -N -B -e "
  SELECT ca.guid, ca.achievement, ca.date
  FROM acore_characters.character_achievement ca
  JOIN acore_characters.characters c ON c.guid = ca.guid
  JOIN acore_auth.account a ON a.id = c.account
  WHERE a.username NOT LIKE 'RNDBOT%';
" > "$ACHIEVEMENTS_TMP"
mysql -h 127.0.0.1 -u acore -pacore -N -B -e "
  SELECT ci.guid, ci.slot, ii.itemEntry, it.name
  FROM acore_characters.character_inventory ci
  JOIN acore_characters.item_instance ii ON ii.guid = ci.item
  JOIN acore_characters.characters c ON c.guid = ci.guid
  JOIN acore_auth.account a ON a.id = c.account
  JOIN acore_world.item_template it ON it.entry = ii.itemEntry
  WHERE ci.bag = 0 AND ci.slot BETWEEN 0 AND 18
    AND a.username NOT LIKE 'RNDBOT%';
" > "$EQUIPPED_TMP"
# Only the spell ids that actually matter for Mounts/Companions detection —
# a max-level character can know thousands of spells, so filtering
# server-side keeps this cheap. Both categories share this one query.
SPELL_COLLECTION_IDS="$(python3 -c "
import json
ids = set()
for path in ('$COLLECTION_MOUNTS_DEFS', '$COLLECTION_COMPANIONS_DEFS'):
    with open(path) as f:
        defs = json.load(f)
    ids.update(str(s) for d in defs for s in d['spell_ids'])
print(','.join(sorted(ids)) if ids else '0')
")"
mysql -h 127.0.0.1 -u acore -pacore -N -B -e "
  SELECT cs.guid, cs.spell
  FROM acore_characters.character_spell cs
  JOIN acore_characters.characters c ON c.guid = cs.guid
  JOIN acore_auth.account a ON a.id = c.account
  WHERE cs.spell IN ($SPELL_COLLECTION_IDS)
    AND a.username NOT LIKE 'RNDBOT%';
" > "$KNOWN_SPELLS_TMP"
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
    c.totaltime,
    c.totalHonorPoints
  FROM acore_characters.characters c
  JOIN acore_auth.account a ON a.id = c.account
  LEFT JOIN acore_characters.character_achievement_points cap ON cap.guid = c.guid
  WHERE a.username NOT LIKE 'RNDBOT%'
  ORDER BY c.totaltime DESC;
" | python3 -c "
import sys, json, datetime, os
from collections import defaultdict

def iso(unix_ts):
    try:
        ts = int(unix_ts)
    except (TypeError, ValueError):
        return None
    if ts <= 0:
        return None
    return datetime.datetime.utcfromtimestamp(ts).strftime('%Y-%m-%dT%H:%M:%SZ')

# Achievements carry their real completion date straight from
# character_achievement.date (Blizzard's own record) — no tracking needed.
achievements_by_guid = defaultdict(list)
with open('$ACHIEVEMENTS_TMP') as f:
    for line in f:
        line = line.rstrip('\n')
        if not line:
            continue
        guid, achievement_id, earned_unix = line.split('\t')
        achievements_by_guid[int(guid)].append({
            'id': int(achievement_id),
            'earned_at': iso(earned_unix),
        })

# Currently-equipped item entries per character (bag=0, slot 0-18 — actual
# gear, not bags/bank). Also kept per-slot (equipped_gear_by_guid) for the
# plain current-loadout snapshot - see equipped_gear below.
equipped_by_guid = defaultdict(set)
equipped_gear_by_guid = defaultdict(list)
with open('$EQUIPPED_TMP') as f:
    for line in f:
        line = line.rstrip('\n')
        if not line:
            continue
        guid, slot, item_entry, item_name = line.split('\t')
        guid = int(guid)
        equipped_by_guid[guid].add(int(item_entry))
        equipped_gear_by_guid[guid].append({
            'slot': int(slot),
            'id': int(item_entry),
            'name': item_name,
        })

# Known mount/companion-learn spells per character (character_spell has no
# per-row timestamp, unlike character_achievement — that's why every
# collection category uses the same sticky-timestamp fallback below).
known_spells_by_guid = defaultdict(set)
with open('$KNOWN_SPELLS_TMP') as f:
    for line in f:
        line = line.rstrip('\n')
        if not line:
            continue
        guid, spell_id = line.split('\t')
        known_spells_by_guid[int(guid)].add(int(spell_id))

# (json key, detection kind, defs path) — 'equip' entries have slot_groups
# (matched against currently-equipped items), 'spell' entries have
# spell_ids (matched against known character_spell rows). Heirlooms are
# stored here exactly like Legendaries (per-character, equipped-only,
# sticky) — the faction-level de-duplicated display (heirlooms are
# Bind-on-Account and can be mailed between characters) is purely an
# app.js rendering concern, not a detection/storage one.
CATEGORIES = [
    ('sets', 'equip', '$COLLECTION_SETS_DEFS'),
    ('mounts', 'spell', '$COLLECTION_MOUNTS_DEFS'),
    ('companions', 'spell', '$COLLECTION_COMPANIONS_DEFS'),
    ('legendaries', 'equip', '$COLLECTION_LEGENDARIES_DEFS'),
    ('tabards', 'equip', '$COLLECTION_TABARDS_DEFS'),
    ('heirlooms', 'equip', '$COLLECTION_HEIRLOOMS_DEFS'),
]

def detect_equip(equipped_ids, defs):
    # Earned when the character has at least one item from EVERY slot group
    # equipped right now (each slot group lists interchangeable item ids for
    # that slot — a 10-/25-player token pair, or a Horde/Alliance pair
    # sharing one display name). A single-item slot_groups entry ([[id]])
    # reduces to 'is this exact item equipped' — how Legendaries/Tabards/
    # Heirlooms use this same function.
    earned = []
    for entry in defs:
        if all(any(item_id in equipped_ids for item_id in group) for group in entry['slot_groups']):
            earned.append(entry['id'])
    return earned

def detect_spell(known_spell_ids, defs):
    # Shared by Mounts and Companions: earned when the character knows ANY
    # ONE of its spell_ids — multi-color mounts (Netherwing Drake, Qiraji
    # Battle Tank) list every color's spell id and complete on any single
    # color, never requiring every color.
    earned = []
    for entry in defs:
        if any(spell_id in known_spell_ids for spell_id in entry['spell_ids']):
            earned.append(entry['id'])
    return earned

DETECTORS = {'equip': detect_equip, 'spell': detect_spell}

defs_by_key = {}
for key, kind, defs_path in CATEGORIES:
    with open(defs_path) as f:
        defs_by_key[key] = json.load(f)

# Sticky, with the original earned_at preserved: once earned, a collection
# is never removed and its earned_at is never overwritten, even after the
# gear is swapped away. Read whatever was already published last run (if
# any) and carry its earned_at forward for anything still present.
def _earned_at_map(entries):
    # entries used to be bare ids (pre-earned_at); accept both
    return {
        (entry['id'] if isinstance(entry, dict) else entry):
            (entry.get('earned_at') if isinstance(entry, dict) else None)
        for entry in entries
    }

previous_by_key_by_guid = {key: defaultdict(dict) for key, _, _ in CATEGORIES}
prev_path = '$REPO_DATA_DIR/characters.json'
if os.path.exists(prev_path):
    try:
        with open(prev_path) as f:
            previous_data = json.load(f)
        for prev_char in previous_data.get('characters', []):
            prev_collections = prev_char.get('collections', {})
            for key, _, _ in CATEGORIES:
                previous_by_key_by_guid[key][prev_char['guid']] = _earned_at_map(prev_collections.get(key, []))
    except (json.JSONDecodeError, OSError):
        pass  # first run, or an unreadable/corrupt previous file — start fresh

generated_at = datetime.datetime.utcnow().strftime('%Y-%m-%dT%H:%M:%SZ')

characters = []
for line in sys.stdin:
    line = line.rstrip('\n')
    if not line:
        continue
    (guid, name, account, race, race_name, cls, class_name,
     faction, level, money, ap, ac, played, honor) = line.split('\t')
    guid = int(guid)

    equipped_ids = equipped_by_guid.get(guid, set())
    known_spells = known_spells_by_guid.get(guid, set())

    collections = {}
    for key, kind, _ in CATEGORIES:
        detector = DETECTORS[kind]
        current_ids = detector(equipped_ids if kind == 'equip' else known_spells, defs_by_key[key])
        earned_at_map = dict(previous_by_key_by_guid[key].get(guid, {}))
        for entry_id in current_ids:
            earned_at_map.setdefault(entry_id, generated_at)
        collections[key] = [
            {'id': entry_id, 'earned_at': earned_at}
            for entry_id, earned_at in sorted(earned_at_map.items())
        ]

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
        'honor_points': int(honor),
        'achievements': sorted(achievements_by_guid.get(guid, []), key=lambda a: a['id']),
        'collections': collections,
        'equipped_gear': sorted(equipped_gear_by_guid.get(guid, []), key=lambda g: g['slot']),
    })

with open('$BACKUP_DIR/characters.json', 'w') as f:
    json.dump({'generated_at': generated_at, 'characters': characters}, f, indent=2)

public_characters = [{k: v for k, v in c.items() if k != 'account'} for c in characters]
with open('$REPO_DATA_DIR/characters.json', 'w') as f:
    json.dump({'generated_at': generated_at, 'characters': public_characters}, f, indent=2)

print(f'  characters.json: wrote {len(characters)} characters')
" || { echo "Failed: characters.json export"; exit 1; }
rm -f "$ACHIEVEMENTS_TMP" "$EQUIPPED_TMP" "$KNOWN_SPELLS_TMP"

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

### Keeping your live `wowbackup.sh` in sync

`reference/wowbackup.sh` in this repo is the maintained copy of the block
above — kept byte-identical to this README's copy of it via matching
start/end markers, so both always describe the same script. Rather than
hand-copying changes into your real, untracked `/home/deck/wowbackup.sh`
every time it changes, run:

```bash
cd /home/deck/wow-armory-data   # or wherever this repo is cloned
git pull origin main
python3 scripts/patch-wowbackup.py /home/deck/wowbackup.sh
```

This finds the same "Saving characters.json..." block in your live script
by those same start/end markers and replaces it with the current version
from `reference/wowbackup.sh`, writing a `.bak` backup first. It aborts
with no changes if either file's markers can't be found, so an
already-hand-edited or unexpected file fails loudly instead of silently
mangling something. Run this once after any `reference/wowbackup.sh`
change, then run `wowbackup` as normal.

## GitHub Pages

This repo is set up to be served straight from the root of `main` — no
build step. To turn it on (one-time):

1. On GitHub, go to the repo's **Settings → Pages**.
2. Under **Build and deployment**, set **Source** to `Deploy from a
   branch`, branch `main`, folder `/ (root)`.
3. Save. The app will be live at
   `https://stephen-gale.github.io/wow-armory/` shortly after.
