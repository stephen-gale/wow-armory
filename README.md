# wow-companion

A companion web app for a solo AzerothCore (3.3.5a) + Playerbots private
server, hosted on GitHub Pages. Starts with a character dashboard; more
tools can be added later.

Live app (once Pages is enabled): `https://stephen-gale.github.io/wow-companion/`

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

Faction crests, class icons, and race icons are self-hosted at
`assets/icons/` (originally sourced from Wowhead's icon CDN,
`wow.zamimg.com`, via `scripts/download-icons.sh` — see below) rather than
fetched live, so the dashboard has no runtime dependency on that CDN.
Icon names are defined in `CLASS_ICON_SLUGS` / `FACTION_ICON_SLUGS` /
`RACE_ICON_SLUGS` in `app.js`. If an icon file is missing, it's silently
removed (logged to the browser console as `icon failed to load: ...`)
rather than showing a broken-image box — falls back to the plain
text/color layout.

### Updating the icon set

If you add a class/race combo not already covered (shouldn't happen for
a 3.3.5a server, but just in case), run `scripts/download-icons.sh` from
a machine with normal internet access inside a clone of this repo (e.g.
the Deck's `wow-companion-data` clone) after adding the new slug to both
the script's `ICONS` list and the matching map in `app.js`. It downloads
into `assets/icons/` and prints the `git add`/`commit`/`push` commands to
run — it doesn't push automatically.

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
      "played_time_seconds": 1234567
    }
  ]
}
```

Schema matches the achievement columns used by `wowbackup.sh`'s own progress
report: `acore_characters.character_achievement_points(guid, total_points,
total_achievements)`.

### Privacy note

`wow-companion` is a **public** repo, and GitHub Pages serves it to anyone
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
   git clone https://github.com/stephen-gale/wow-companion.git /home/deck/wow-companion-data
   cd /home/deck/wow-companion-data
   git config user.name "wowbackup"
   git config user.email "wowbackup@localhost"
   ```
2. Store the `wow` personal access token so `wowbackup.sh` can push
   unattended, scoped to just this clone (not your global git config):
   ```bash
   cd /home/deck/wow-companion-data
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
**public** copy (without `account`) into the `wow-companion-data` clone,
which it then commits and pushes to GitHub. Paste it into `wowbackup.sh`
right after the existing "Saving progress report..." block (i.e. right
after the `} > "$BACKUP_DIR/playtime_by_character.txt" || { ... }` line)
and before the "Compressing..." step.

```bash
echo "  Saving characters.json..."
REPO_DATA_DIR="/home/deck/wow-companion-data"
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
import sys, json, datetime

characters = []
for line in sys.stdin:
    line = line.rstrip('\n')
    if not line:
        continue
    (guid, name, account, race, race_name, cls, class_name,
     faction, level, money, ap, ac, played) = line.split('\t')
    characters.append({
        'guid': int(guid),
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
    })

generated_at = datetime.datetime.utcnow().strftime('%Y-%m-%dT%H:%M:%SZ')

with open('$BACKUP_DIR/characters.json', 'w') as f:
    json.dump({'generated_at': generated_at, 'characters': characters}, f, indent=2)

public_characters = [{k: v for k, v in c.items() if k != 'account'} for c in characters]
with open('$REPO_DATA_DIR/characters.json', 'w') as f:
    json.dump({'generated_at': generated_at, 'characters': public_characters}, f, indent=2)

print(f'  characters.json: wrote {len(characters)} characters')
" || { echo "Failed: characters.json export"; exit 1; }

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
   `https://stephen-gale.github.io/wow-companion/` shortly after.

## Roadmap

- Additional dashboard views (achievements, playtime trends over multiple
  backups, etc.).
