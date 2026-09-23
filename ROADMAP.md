# WoW Armory Roadmap

_Kept in the repo so it's always in context for future work, not stuck in a chat thread. Update this file directly as things ship or plans change._

## Shipped

- **Collections rebuild** — Sets, Mounts, Companions, Legendaries, Tabards, and Heirlooms (shown once per faction, not per character); mechanical spell/item detection, junk-bucket recovery, a trainer-taught-mounts exception, and one-time date corrections against real DB data.
- **Sort by Type/Date** — a toggle on the Collections/Achievements module; Type groups by category, Date groups by year then month with a consistent dd/mm/yy format.
- **Equipped Gear** — the character's current loadout, slot by slot, with real item icons resolved client-side from bundled DBC data (2,742/2,747 icons, 99.8% coverage). Not sticky — a plain point-in-time snapshot, unlike Collections.
- **Honor Points / PvP module** — an independent third module (peer of Equipped and Collections/Achievements), not gated by the Sort toggle. Data shape already matches the fields that roll up into faction/account totals, so that rollup is a one-line change whenever it's wanted.

## In progress / near-term

- [ ] **Verify the Honor Points icon** — take an in-game screenshot of where Honor Points shows in the UI, share it, and confirm/correct the icon currently used in `app.js` (`assets/icons/spell_holy_championsbond.png`, resolved from item 43308). Checked the client data already: WotLK's unified Honor Points currency (id 1901) has one icon shared by both factions, no Alliance/Horde split — this is a sanity check against the real client, not a known bug.

## Backlog ideas

From the feasibility review against AzerothCore's real schema, ranked by rough effort.

| Idea | Effort | Notes |
| --- | --- | --- |
| Last online | Trivial | `characters.logout_time`, a plain column |
| Stats (str/agi/stam/int/spirit, armor, crit%, etc.) | Low–medium | `character_stats` has a full computed snapshot updated on save — no simulation needed |
| Titles | Low–medium | Not yet scoped in detail |
| Skills | Medium | `character_skills` (guid, skill, value, max) — needs a skill-name lookup table |
| Talent spec (name, not just points) | High | `character_talent` only stores spell id + spec mask, no tree/spec name — needs external Talent.dbc data |
| Screenshots gallery | Medium–high | Reframed per feedback: a general slideshow to browse, not sorted per character |
| PvP: honor rolled up to faction/account | Trivial (when wanted) | Data shape already supports it — `honor_points` matches the fields `renderSummary`/`renderFactionPanel` already reduce over |
| PvP: kills | Dropped for now | Bots are currently off, so kill counts wouldn't reflect real activity |

## How this works

- **Data pipeline**: `export-characters-json.sh` (dev/reference copy) and `reference/wowbackup.sh` (mirrored, what actually runs) query the live AzerothCore DB and publish `characters.json` to GitHub Pages.
- **Icons**: resolved client-side from bundled DBC-derived data (`assets/data/item_icons.json`, achievement icons, etc.) — no DB dependency, since this client build (3.3.5.12340) is frozen and covers every item that could ever be equipped.
- **Syncing a script change to the live Steam Deck script**:
  ```bash
  cd ~/wow-armory
  git pull origin main
  python3 scripts/patch-wowbackup.py /home/deck/wowbackup.sh
  wowbackup
  ```
- `README.md` keeps an embedded copy of the "Saving characters.json…" block from `wowbackup.sh`, kept in sync via that same patch script's start/end markers.
