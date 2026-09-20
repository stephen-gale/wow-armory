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

Right now it loads data via a file picker (`Load characters.json` button).
There's also a `Load example data` button that pulls in
`characters.example.json` so you can see the layout without real data.

No data is ever uploaded — the JSON is parsed entirely in your browser.

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

## Producing `characters.json` on the server

`wowbackup.sh` already builds a text progress report (`playtime_by_character.txt`)
straight from `acore_characters.characters` / `acore_auth.account` /
`character_achievement_points`. The block below is the same data reshaped as
JSON, written to `$BACKUP_DIR/characters.json` — paste it into `wowbackup.sh`
right after the existing "Saving progress report..." block (i.e. right after
the `} > "$BACKUP_DIR/playtime_by_character.txt" || { ... }` line) and before
the "Compressing..." step. It rides along with the rest of that run's backup
and gets picked up by the existing `rclone copy "$BACKUP_DIR" ...` step
automatically — no extra wiring needed.

```bash
echo "  Saving characters.json..."
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

data = {
    'generated_at': datetime.datetime.utcnow().strftime('%Y-%m-%dT%H:%M:%SZ'),
    'characters': characters,
}

with open('$BACKUP_DIR/characters.json', 'w') as f:
    json.dump(data, f, indent=2)

print(f'  characters.json: wrote {len(characters)} characters')
" || { echo "Failed: characters.json export"; exit 1; }
```

This reuses the same `-h 127.0.0.1 -u acore -pacore` credentials already in
`wowbackup.sh` — if those ever change, update them here too.

Once it's in and you've run `wowbackup.sh` (or want to test standalone),
`characters.json` will be at `$BACKUP_DIR/characters.json` for that run, and
also synced to `wow-backup:wow-backup/backups/<timestamp>/` on Drive. Grab
it from there onto whatever device you want to view the dashboard on, and
load it with the file picker.

`scripts/export-characters-json.sh` in this repo is the same query as a
standalone script (with configurable `DB_HOST`/`DB_USER`/`OUTPUT_DIR` env
vars), useful for regenerating `characters.json` on its own without running
a full backup.

## GitHub Pages

This repo is set up to be served straight from the root of `main` — no
build step. To turn it on (one-time):

1. On GitHub, go to the repo's **Settings → Pages**.
2. Under **Build and deployment**, set **Source** to `Deploy from a
   branch`, branch `main`, folder `/ (root)`.
3. Save. The app will be live at
   `https://stephen-gale.github.io/wow-companion/` shortly after.

## Roadmap

- Auto-fetch `characters.json` directly from this repo (or a gist/Drive
  link) instead of requiring a manual file pick.
- Additional dashboard views (achievements, playtime trends over multiple
  backups, etc.).
