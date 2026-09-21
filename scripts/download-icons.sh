#!/usr/bin/env bash
# download-icons.sh
#
# One-time (re-run only if you add a class/race combo not covered below)
# script to download the class/race/faction icons the dashboard uses from
# Wowhead's icon CDN and save them locally in this repo, so the site no
# longer depends on fetching them from wow.zamimg.com at runtime.
#
# Run this from a machine with normal internet access, inside a clone of
# this repo (e.g. the Steam Deck's wow-companion-data clone already set
# up for pushing characters.json). It does NOT commit or push
# automatically — check the output, then commit yourself.
#
# Keep this list in sync with CLASS_ICON_SLUGS / FACTION_ICON_SLUGS /
# RACE_ICON_SLUGS in app.js.

set -euo pipefail

cd "$(dirname "$0")/.."
mkdir -p assets/icons

ICONS=(
  achievement_pvp_a_a
  achievement_pvp_h_h
  classicon_warrior
  classicon_paladin
  classicon_hunter
  classicon_rogue
  classicon_priest
  classicon_deathknight
  classicon_shaman
  classicon_mage
  classicon_warlock
  classicon_druid
  achievement_character_human_male
  achievement_character_orc_male
  achievement_character_dwarf_male
  achievement_character_nightelf_male
  achievement_character_undead_male
  achievement_character_tauren_male
  achievement_character_gnome_male
  achievement_character_troll_male
  achievement_character_bloodelf_male
  achievement_character_draenei_male
)

fail=0
for icon in "${ICONS[@]}"; do
  url="https://wow.zamimg.com/images/wow/icons/medium/${icon}.jpg"
  dest="assets/icons/${icon}.jpg"
  if curl -sS -f -o "$dest" "$url"; then
    echo "  OK: $icon"
  else
    echo "  FAILED: $icon ($url)"
    rm -f "$dest"
    fail=$((fail + 1))
  fi
done

echo
if [ "$fail" -eq 0 ]; then
  echo "All icons downloaded to assets/icons/. Review, then:"
else
  echo "$fail icon(s) failed to download — check the names above before committing."
fi
echo "  git add assets/icons"
echo "  git commit -m 'Add self-hosted class/race/faction icons'"
echo "  git push origin main"
