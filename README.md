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
      "played_time_seconds": 1234567
    }
  ]
}
```

## Producing `characters.json` on the server

`scripts/export-characters-json.sh` queries `acore_characters.characters`
joined against `acore_auth.account` (filtering out Playerbots with
`WHERE a.username NOT LIKE 'RNDBOT%'`) and left-joined against
`acore_characters.character_achievement_points`, and writes the result as
JSON via a small embedded Python step.

To wire it into the existing `wowbackup.sh` on the Steam Deck:

1. Copy `scripts/export-characters-json.sh` onto the Deck (e.g. next to
   `wowbackup.sh`).
2. At the top of the script, adjust `DB_HOST` / `DB_PORT` / `DB_USER` /
   `DB_PASS` / `OUTPUT_DIR` to match whatever credentials and paths
   `wowbackup.sh` already uses for its `mysqldump` calls.
3. If `character_achievement_points` doesn't use a column named `points`,
   update the `cap.points` reference in the query (check with
   `DESCRIBE acore_characters.character_achievement_points;`).
4. Call it from `wowbackup.sh`, after the `acore_auth`/`acore_characters`
   dumps and before the rclone sync step, e.g.:

   ```bash
   OUTPUT_DIR="$BACKUP_DIR" bash /home/deck/export-characters-json.sh
   ```

   so `characters.json` rides along with the rest of the backup and gets
   synced to Google Drive too.
5. Run `wowbackup.sh` (or just the export script on its own) once to
   confirm `characters.json` is produced correctly, then grab that file
   (e.g. from the synced Google Drive folder) onto whatever device you
   want to view the dashboard on, and load it with the file picker.

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
