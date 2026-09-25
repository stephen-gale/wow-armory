// Registered mainly for PWA installability (Chrome's "Install app" prompt
// requires one); see sw.js for what it actually does.
if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("sw.js").catch((err) => {
      console.warn("Service worker registration failed:", err);
    });
  });
}

const CLASS_COLORS = {
  Warrior: "#C79C6E",
  Paladin: "#F58CBA",
  Hunter: "#ABD473",
  Rogue: "#FFF569",
  Priest: "#FFFFFF",
  "Death Knight": "#C41F3B",
  Shaman: "#0070DE",
  Mage: "#69CCF0",
  Warlock: "#9482C9",
  Druid: "#FF7D0A",
};

const CLASS_ICON_SLUGS = {
  Warrior: "classicon_warrior",
  Paladin: "classicon_paladin",
  Hunter: "classicon_hunter",
  Rogue: "classicon_rogue",
  Priest: "classicon_priest",
  "Death Knight": "classicon_deathknight",
  Shaman: "classicon_shaman",
  Mage: "classicon_mage",
  Warlock: "classicon_warlock",
  Druid: "classicon_druid",
};

const FACTION_ICON_SLUGS = {
  Alliance: "achievement_pvp_a_a",
  Horde: "achievement_pvp_h_h",
};

const RACE_ICON_SLUGS = {
  Human: "achievement_character_human_male",
  Orc: "achievement_character_orc_male",
  Dwarf: "achievement_character_dwarf_male",
  "Night Elf": "achievement_character_nightelf_male",
  Undead: "achievement_character_undead_male",
  Tauren: "achievement_character_tauren_male",
  Gnome: "achievement_character_gnome_male",
  Troll: "achievement_character_troll_male",
  "Blood Elf": "achievement_character_bloodelf_male",
  Draenei: "achievement_character_draenei_male",
};

const STAT_ICONS = {
  gold: "assets/icons/ui_goldicon.png",
  achievements: "assets/icons/ui_achievement_tinyshield.png",
  played: "assets/icons/clock.svg",
};

// Faction-specific, confirmed against real in-game screenshots of the
// default PvP frame's "Honor:" display (Alliance lion crest / Horde
// crest) - the earlier assumption of one shared icon was verified
// against the wrong UI element (the Honor Points currency-wrapper item's
// own icon, Spell_Holy_ChampionsBond, which is a real Blizzard icon but
// not the one this app's Honor Points line was meant to show).
const HONOR_ICON = {
  Alliance: "assets/icons/achievement_pvp_a_a.png",
  Horde: "assets/icons/achievement_pvp_h_h.png",
};

// item_template.Quality (0-7) -> Blizzard's own item quality colors, used
// everywhere in the real client (item names, tooltip borders, etc).
// These are computed client-side by the native GetItemQualityColor() call
// rather than stored as a literal table in any client Lua source - true
// back through WotLK's own FrameXML (checked directly against Gethe's
// wow-ui-source mirror) - so the exact hex isn't extractable from client
// source the way icon slugs or achievement text were for other features.
// One value here (7, Heirloom) was cross-checked directly against
// Blizzard's own FrameXML/Constants.lua (HEIRLOOM_BLUE_COLOR = 0, 0.8, 1 ->
// #00CCFF), confirming it against the same widely-published values used
// for the rest - these have been unchanged since each quality's
// introduction across every WoW client version.
const QUALITY_COLORS = {
  0: "#9d9d9d", // Poor
  1: "#ffffff", // Common
  2: "#1eff00", // Uncommon
  3: "#0070dd", // Rare
  4: "#a335ee", // Epic
  5: "#ff8000", // Legendary
  6: "#e6cc80", // Artifact
  7: "#00ccff", // Heirloom
};

function iconUrl(slug) {
  return `assets/icons/${slug}.png`;
}

function iconImg(slug, className) {
  if (!slug) return "";
  return `<img class="${className}" src="${iconUrl(slug)}" alt="" onerror="console.warn('icon failed to load:', this.src); this.remove();">`;
}

// Item icons (assets/data/item_icons.json) are a much larger, separately
// bundled set (see scripts/generate-item-icons.py) — kept in their own
// assets/icons/items/ subfolder rather than mixed into the flat top-level
// assets/icons/ used for the small, hand-picked UI icon set above.
function itemIconImg(slug, className, style) {
  if (!slug) return "";
  const styleAttr = style ? ` style="${style}"` : "";
  return `<img class="${className}" src="assets/icons/items/${slug}.png" alt=""${styleAttr} onerror="console.warn('icon failed to load:', this.src); this.remove();">`;
}

// WoW's fixed EQUIPMENT_SLOT_* order (0-18) - stable across the game's
// entire history, matches the character_inventory.slot values the export
// scripts already filter to (bag=0, slot 0-18).
const EQUIP_SLOT_LABELS = [
  "Head", "Neck", "Shoulder", "Shirt", "Chest", "Waist", "Legs", "Feet",
  "Wrist", "Hands", "Ring 1", "Ring 2", "Trinket 1", "Trinket 2", "Back",
  "Main Hand", "Off Hand", "Ranged", "Tabard",
];

// Slot 17 isn't a single "Ranged" slot for every class - it's the real
// client's own behavior (confirmed against WotLK FrameXML: PaperDollFrame
// picks RANGEDSLOT ("Ranged") or RELICSLOT ("Relic") based on
// UnitHasRelicSlot(), which is true only for these three). Paladins get a
// Libram there, Druids an Idol, Shamans a Totem - "Ranged" never applied
// to them even though it's the same inventory slot index.
const RELIC_SLOT_CLASSES = new Set(["Paladin", "Druid", "Shaman"]);

// A stat value with its icon in front instead of a text label (e.g. gold
// coin icon instead of the word "Gold"). Used for both the per-faction
// summary row and each character row, in the same Gold/Achievements/Played
// order, so the two stay visually consistent.
function statWithIcon(iconSrc, text, extraIconClass, iconAfter) {
  const cls = extraIconClass ? `stat-icon ${extraIconClass}` : "stat-icon";
  const icon = `<img class="${cls}" src="${iconSrc}" alt="" onerror="console.warn('icon failed to load:', this.src); this.remove();">`;
  return iconAfter
    ? `<span class="stat">${text}${icon}</span>`
    : `<span class="stat">${icon}${text}</span>`;
}

// Each Collections category lives in its own data file (mirroring the SQL
// export's characters.json shape) and renders as one flat section — no
// sub-grouping by tier/expansion. Adding a future category means one more
// entry here, no other code changes.
//
// Heirlooms are marked factionLevel: still detected/stored per character
// exactly like Legendaries (equipped-only, sticky), but since heirlooms
// are Bind-on-Account and get mailed between characters, showing them
// inside each character's own panel would make the same heirloom look
// "earned" repeatedly. buildAchievementsPanel skips factionLevel
// categories; renderFactionPanel renders their union instead, once per
// faction (see buildFactionHeirloomsPanel).
// Titles' id is simply the granting achievement's id - see
// assets/data/collections/titles.json's generator
// (scripts/generate-titles-collection-data.py) for why: it's scoped to
// achievement-granted titles only (not every title source in the game),
// since that's the one source this project can resolve names/dates for
// without a live DB dependency.
const COLLECTION_CATEGORIES = [
  { key: "sets", file: "assets/data/collections/sets.json", label: "Sets" },
  { key: "mounts", file: "assets/data/collections/mounts.json", label: "Mounts" },
  { key: "companions", file: "assets/data/collections/companions.json", label: "Companions" },
  { key: "legendaries", file: "assets/data/collections/legendaries.json", label: "Legendaries" },
  { key: "tabards", file: "assets/data/collections/tabards.json", label: "Tabards" },
  { key: "heirlooms", file: "assets/data/collections/heirlooms.json", label: "Heirlooms", factionLevel: true },
  { key: "titles", file: "assets/data/collections/titles.json", label: "Titles" },
];

// Fetched once, eagerly, so it's usually already resolved by the time
// someone taps a character to expand their achievements/collections.
let achievementDataPromise = null;

function loadAchievementData() {
  if (!achievementDataPromise) {
    achievementDataPromise = Promise.all([
      fetch("assets/data/achievements.json").then((r) => r.json()),
      fetch("assets/data/achievement_categories.json").then((r) => r.json()),
      fetch("assets/data/item_icons.json").then((r) => r.json()),
      ...COLLECTION_CATEGORIES.map((cat) => fetch(cat.file).then((r) => r.json()).catch(() => [])),
    ]).then(([achievements, categories, itemIcons, ...collectionLists]) => ({
      achievementsById: new Map(achievements.map((a) => [a.id, a])),
      categoriesById: new Map(categories.map((c) => [c.id, c])),
      itemIcons,
      collectionsByCategory: new Map(
        COLLECTION_CATEGORIES.map((cat, i) => [cat.key, new Map(collectionLists[i].map((item) => [item.id, item]))])
      ),
    }));
  }
  return achievementDataPromise;
}
loadAchievementData();


const fileInput = document.getElementById("file-input");
const emptyStateEl = document.getElementById("empty-state");
const summaryBarEl = document.getElementById("summary-bar");
const factionsEl = document.getElementById("factions");

fileInput.addEventListener("change", (event) => {
  const file = event.target.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = () => {
    try {
      const data = JSON.parse(reader.result);
      renderDashboard(data);
    } catch (err) {
      alert("Couldn't parse that file as JSON: " + err.message);
    }
  };
  reader.readAsText(file);
});

// Auto-load the published characters.json (if present) so the dashboard
// works without a manual file pick. Silently falls back to the empty
// state / manual load if it's missing or unreachable (e.g. running from
// a local file:// URL).
fetch("characters.json?t=" + Date.now())
  .then((res) => {
    if (!res.ok) throw new Error("characters.json not found");
    return res.json();
  })
  .then(renderDashboard)
  .catch(() => {});

function renderDashboard(data) {
  const characters = data.characters || [];

  emptyStateEl.hidden = true;
  summaryBarEl.hidden = false;
  factionsEl.hidden = false;

  renderSummary(characters);
  renderFactions(characters);
}

function renderSummary(characters) {
  const totalPlayed = characters.reduce((sum, c) => sum + (c.played_time_seconds || 0), 0);
  const totalMoney = characters.reduce((sum, c) => sum + (c.money_copper || 0), 0);
  const totalAP = characters.reduce((sum, c) => sum + (c.achievement_points || 0), 0);
  const totalAchievementCount = characters.reduce((sum, c) => sum + (c.achievement_count || 0), 0);

  summaryBarEl.innerHTML = "";
  summaryBarEl.append(
    statTile(STAT_ICONS.played, formatPlayedTime(totalPlayed)),
    statTile(STAT_ICONS.achievements, formatAchievements(totalAP, totalAchievementCount), "stat-tile-icon--achievement"),
    statTile(STAT_ICONS.gold, formatMoneyPlain(totalMoney))
  );
}

function statTile(iconSrc, value, extraIconClass) {
  const cls = extraIconClass ? `stat-tile-icon ${extraIconClass}` : "stat-tile-icon";
  const el = document.createElement("div");
  el.className = "stat-tile";
  el.innerHTML = `<img class="${cls}" src="${iconSrc}" alt="" onerror="console.warn('icon failed to load:', this.src); this.remove();"><p class="stat-tile__value">${value}</p>`;
  return el;
}

function renderFactions(characters) {
  factionsEl.innerHTML = "";
  factionsEl.append(
    renderFactionPanel("Alliance", characters.filter((c) => c.faction === "Alliance")),
    renderFactionPanel("Horde", characters.filter((c) => c.faction === "Horde"))
  );
}

function renderFactionPanel(faction, characters) {
  const sorted = [...characters].sort((a, b) => b.level - a.level || a.name.localeCompare(b.name));
  const totalPlayed = characters.reduce((sum, c) => sum + (c.played_time_seconds || 0), 0);
  const totalMoney = characters.reduce((sum, c) => sum + (c.money_copper || 0), 0);
  const totalAP = characters.reduce((sum, c) => sum + (c.achievement_points || 0), 0);
  const totalAchievementCount = characters.reduce((sum, c) => sum + (c.achievement_count || 0), 0);

  const panel = document.createElement("section");
  panel.className = "faction-panel faction-panel--" + faction.toLowerCase();

  const factionIcon = iconImg(FACTION_ICON_SLUGS[faction], "faction-icon");

  const header = document.createElement("div");
  header.className = "faction-panel__header";
  header.innerHTML = `<span class="faction-panel__title">${factionIcon}${faction}</span>`;
  panel.appendChild(header);

  const stats = document.createElement("div");
  stats.className = "faction-panel__stats";
  stats.innerHTML = [
    statWithIcon(STAT_ICONS.played, formatPlayedTime(totalPlayed)),
    statWithIcon(STAT_ICONS.achievements, formatAchievements(totalAP, totalAchievementCount), "stat-icon--achievement"),
    statWithIcon(STAT_ICONS.gold, formatMoneyPlain(totalMoney)),
  ].join("");
  panel.appendChild(stats);

  const list = document.createElement("ul");
  list.className = "char-list";
  for (const c of sorted) {
    list.appendChild(renderCharCard(c));
  }
  panel.appendChild(list);

  const heirloomsPlaceholder = document.createElement("div");
  heirloomsPlaceholder.className = "char-achievements faction-heirlooms";
  heirloomsPlaceholder.innerHTML = `<p class="char-achievements__empty">Loading…</p>`;
  panel.appendChild(heirloomsPlaceholder);
  loadAchievementData().then(({ collectionsByCategory }) => {
    const panel = buildFactionHeirloomsPanel(characters, collectionsByCategory);
    if (panel) {
      heirloomsPlaceholder.replaceWith(panel);
    } else {
      heirloomsPlaceholder.remove();
    }
  });

  return panel;
}

// Heirlooms are Bind-on-Account and get mailed between characters, so
// per-character detection (see COLLECTION_CATEGORIES) would make the same
// heirloom look "earned" over and over as it's handed around. This unions
// every character's detections in the faction into one family-wide list,
// keeping the earliest earned_at seen for each item (when the family
// first had it) — always visible under the roster, not tucked inside any
// one character's expandable panel. Returns null when the faction has none
// at all, so the caller can render nothing rather than an empty-state
// message — Collections celebrates what's earned, never flags what isn't.
function buildFactionHeirloomsPanel(characters, collectionsByCategory) {
  const heirloomsById = collectionsByCategory.get("heirlooms");
  const earliestByItemId = new Map();
  for (const c of characters) {
    const entries = (c.collections?.heirlooms || []).map(normalizeEntry);
    for (const entry of entries) {
      const prev = earliestByItemId.get(entry.id);
      if (prev === undefined || (entry.earned_at && (!prev || entry.earned_at < prev))) {
        earliestByItemId.set(entry.id, entry.earned_at);
      }
    }
  }
  const items = [...earliestByItemId.entries()]
    .map(([id, earned_at]) => {
      const item = heirloomsById.get(id);
      return item && { ...item, earned_at };
    })
    .filter(Boolean)
    .sort((a, b) => a.name.localeCompare(b.name));

  if (items.length === 0) return null;

  const div = document.createElement("div");
  div.className = "char-achievements faction-heirlooms";
  div.innerHTML = renderAchievementGroups([{ name: "Heirlooms", achievements: items }], null, false);
  return div;
}

function renderCharCard(c) {
  const li = document.createElement("li");
  li.className = "char-card";
  li.tabIndex = 0;
  li.setAttribute("role", "button");
  li.setAttribute("aria-expanded", "false");

  const classColor = CLASS_COLORS[c.class_name] || "#e8e6e1";
  const classIcon = iconImg(CLASS_ICON_SLUGS[c.class_name], "class-icon");
  const raceIcon = iconImg(RACE_ICON_SLUGS[c.race_name], "race-icon");

  li.innerHTML = `
    <div class="char-card__icons">${classIcon}${raceIcon}</div>
    <div class="char-card__main">
      <p class="char-card__name" style="color:${classColor}">${escapeHtml(c.name)} <span class="char-card__level">${c.level}</span></p>
      <div class="char-card__stats">
        ${statWithIcon(STAT_ICONS.played, formatPlayedTime(c.played_time_seconds))}
        ${statWithIcon(STAT_ICONS.achievements, formatAchievements(c.achievement_points, c.achievement_count), "stat-icon--achievement")}
        ${statWithIcon(STAT_ICONS.gold, formatMoneyPlain(c.money_copper))}
      </div>
    </div>
  `;

  li.addEventListener("click", () => toggleAchievementsPanel(li, c));
  li.addEventListener("keydown", (event) => {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      toggleAchievementsPanel(li, c);
    }
  });

  return li;
}

function toggleAchievementsPanel(rowLi, c) {
  const next = rowLi.nextElementSibling;
  if (next && next.classList.contains("char-achievements")) {
    const nowHidden = !next.hidden;
    next.hidden = nowHidden;
    rowLi.setAttribute("aria-expanded", String(!nowHidden));
    rowLi.classList.toggle("char-card--expanded", !nowHidden);
    return;
  }

  rowLi.classList.add("char-card--expanded");
  rowLi.setAttribute("aria-expanded", "true");

  const placeholder = document.createElement("li");
  placeholder.className = "char-achievements";
  placeholder.innerHTML = `<p class="char-achievements__empty">Loading…</p>`;
  rowLi.after(placeholder);

  loadAchievementData().then(({ achievementsById, categoriesById, collectionsByCategory, itemIcons }) => {
    placeholder.replaceWith(buildAchievementsPanel(c, achievementsById, categoriesById, collectionsByCategory, itemIcons));
  });
}

// Two separate, clearly-labeled systems in one expandable panel:
// - Collections: custom, companion-app-only tracking across categories
//   (see COLLECTION_CATEGORIES). Not real WoW achievements; never mixed
//   into the Achievements totals or grouping below. Heirlooms are left out
//   here (factionLevel) — they render once per faction in
//   renderFactionPanel instead, see buildFactionHeirloomsPanel.
// - Achievements: the character's real completed Blizzard achievements,
//   grouped by whichever category Blizzard's own data files directly tag
//   them with — no re-grouping or custom categorization on top.
// Accepts either the current {id, earned_at} shape or the older bare-id
// shape (a stale cached characters.json, or one from before earned_at
// existed) so a mismatch between a freshly-deployed app.js and
// not-yet-regenerated data degrades to "no date shown" rather than to
// every entry silently failing to match at all.
function normalizeEntry(entry) {
  return typeof entry === "object" && entry !== null
    ? entry
    : { id: entry, earned_at: null };
}

function buildAchievementsPanel(c, achievementsById, categoriesById, collectionsByCategory, itemIcons) {
  const li = document.createElement("li");
  li.className = "char-achievements";

  const statsHtml = renderCharacterStats(c.stats, c.class_name);
  const talentsHtml = renderTalents(c.talents, c.class_name);
  const equippedGearHtml = renderEquippedGear(c.equipped_gear || [], itemIcons, c.class_name);
  const pvpHtml = renderPvP(c.honor_points, c.faction, c.last_online, c.quests_completed);

  // One flat section per category — no sub-grouping by tier/expansion — in
  // COLLECTION_CATEGORIES' own declared order. factionLevel categories
  // (Heirlooms) are skipped here; they render once per faction instead.
  const collectionGroups = [];
  for (const cat of COLLECTION_CATEGORIES) {
    if (cat.factionLevel) continue;
    const itemsById = collectionsByCategory.get(cat.key);
    const entries = (c.collections?.[cat.key] || []).map(normalizeEntry);
    const items = entries
      .map((entry) => {
        const item = itemsById.get(entry.id);
        return item && { ...item, earned_at: entry.earned_at };
      })
      .filter(Boolean);
    if (items.length === 0) continue;
    collectionGroups.push({
      name: cat.label,
      achievements: items.sort((a, b) => a.name.localeCompare(b.name)),
    });
  }

  const achievementEntries = (c.achievements || []).map(normalizeEntry);
  const byCategory = new Map();
  for (const entry of achievementEntries) {
    const achievement = achievementsById.get(entry.id);
    if (!achievement) continue;
    const list = byCategory.get(achievement.category_id) || [];
    list.push({ ...achievement, earned_at: entry.earned_at });
    byCategory.set(achievement.category_id, list);
  }
  const categoryGroups = [...byCategory.entries()]
    .map(([categoryId, achievements]) => ({
      name: categoriesById.get(categoryId)?.name || "Other",
      achievements: achievements.sort((a, b) => a.name.localeCompare(b.name)),
    }))
    .sort((a, b) => a.name.localeCompare(b.name));

  if (collectionGroups.length === 0 && categoryGroups.length === 0 && !statsHtml && !talentsHtml && !equippedGearHtml && !pvpHtml) {
    li.innerHTML = `<p class="char-achievements__empty">No collections or achievements recorded.</p>`;
    return li;
  }

  // The toggle itself only makes sense when there's actually Collections/
  // Achievements data to sort - skip it entirely otherwise (e.g. a
  // character with gear equipped but nothing recorded yet).
  let sortSectionHtml = "";
  if (collectionGroups.length > 0 || categoryGroups.length > 0) {
    const typeViewHtml =
      renderAchievementGroups(collectionGroups, "Collections", false) +
      renderAchievementGroups(categoryGroups, "Achievements", false);
    const allItems = [...collectionGroups, ...categoryGroups].flatMap((group) => group.achievements);
    const dateViewHtml = renderDateView(allItems);

    // Radio `name` must be unique per panel — multiple characters' panels
    // can be expanded on the page at once, and a shared name would let
    // toggling one character's Sort by also move every other open panel's.
    const toggleName = `sort-${c.guid}`;
    sortSectionHtml = `
      <div class="sort-row">
        <span class="sort-row__label">Sort</span>
        <div class="sort-toggle" role="radiogroup" aria-label="Sort by">
          <input type="radio" name="${toggleName}" id="${toggleName}-type" checked>
          <label class="sort-toggle__label" for="${toggleName}-type">Type</label>
          <input type="radio" name="${toggleName}" id="${toggleName}-date">
          <label class="sort-toggle__label" for="${toggleName}-date">Date</label>
        </div>
      </div>
      <div class="sort-view is-active" data-view="type">${typeViewHtml}</div>
      <div class="sort-view" data-view="date">${dateViewHtml}</div>
    `;
  }

  // Five independent modules, in this fixed order: Talents, Equipped,
  // Stats, Collections/Achievements (with its own Type/Date toggle),
  // PvP - each shown only when it has something to show. Talents,
  // Equipped, Stats and PvP are all headed by .achv-section__name, which
  // already grows its own top border whenever it isn't
  // .char-achievements' literal first child, so they need no manual
  // divider before or after them - adding one would double up against
  // that automatic border. (Whichever of these ends up first is exactly
  // why this rule is driven by :first-child rather than by which module
  // JS puts first - each one automatically picks up its own top border
  // the moment something starts coming before it, no CSS change needed
  // when the order changes.)
  // sortSectionHtml starts with .sort-row instead, which has no built-in
  // separator, so it's the only module that needs an explicit
  // .module-divider in front of it (and only when something already
  // precedes it).
  const parts = [];
  if (talentsHtml) parts.push(talentsHtml);
  if (equippedGearHtml) parts.push(equippedGearHtml);
  if (statsHtml) parts.push(statsHtml);
  if (sortSectionHtml) {
    if (parts.length > 0) parts.push(`<div class="module-divider"></div>`);
    parts.push(sortSectionHtml);
  }
  if (pvpHtml) parts.push(pvpHtml);
  li.innerHTML = parts.join("");

  const views = li.querySelectorAll(".sort-view");
  for (const radio of li.querySelectorAll(".sort-toggle input")) {
    radio.addEventListener("change", () => {
      const which = radio.id.endsWith("-date") ? "date" : "type";
      views.forEach((view) => view.classList.toggle("is-active", view.dataset.view === which));
    });
  }

  return li;
}

// Stats: a full character_stats snapshot (see
// export-characters-json.sh/wowbackup.sh's `stats`), grouped and styled
// identically to Collections/Achievements categories (.achv-category
// cards) - same shape of data (a labelled group of lines), just a
// different source. Per-character only, like Equipped/PvP - averaging
// Str across a roster isn't meaningful the way achievement counts are.
// Deliberately excludes the 7 maxpower columns (mana/rage/energy/rune/
// runic power/etc) - not wanted per the character's own steer, and mostly
// zero for any given class anyway. Labels are Blizzard's own client
// abbreviations where one exists (Str/Agi/Sta/Int/Spi from WotLK's
// GlobalStrings.lua; Resil from RESILIENCE_ABBR) - the rest have no
// official short form, so they're spelled out or use the AP/SP shorthand
// this game's own community has used since Vanilla.
//
// Resil, the six resistances, Block, and Parry are hidden client-side for
// now (per the character's own steer) - still collected in full by the
// export scripts (see `stats` there), so re-adding any of them here later
// is a one-line change, not a data/schema change.
const STAT_GROUPS = [
  {
    name: "Attributes",
    stats: [
      { key: "strength", label: "Str" },
      { key: "agility", label: "Agi" },
      { key: "stamina", label: "Sta" },
      { key: "intellect", label: "Int" },
      { key: "spirit", label: "Spi" },
    ],
  },
  {
    name: "Defense",
    stats: [
      { key: "max_health", label: "HP" },
      { key: "armor", label: "Armor" },
      { key: "dodge_pct", label: "Dodge", isPct: true },
      { key: "parry_pct", label: "Parry", isPct: true },
      { key: "block_pct", label: "Block", isPct: true },
    ],
  },
  {
    name: "Combat",
    stats: [
      { key: "attack_power", label: "AP" },
      { key: "ranged_attack_power", label: "Ranged AP" },
      { key: "spell_power", label: "SP" },
      { key: "crit_pct", label: "Crit", isPct: true },
      { key: "ranged_crit_pct", label: "Ranged Crit", isPct: true },
      { key: "spell_crit_pct", label: "Spell Crit", isPct: true },
    ],
  },
];

// Stats where only some of a related set are relevant to a given class -
// Warrior/Rogue/Death Knight are melee-only, Hunter is the one
// ranged-physical class, Mage/Warlock/Priest are pure casters.
// Paladin/Shaman/Druid are hybrids (melee, healer or caster depending on
// spec, which this app has no data for) - shown everything genuinely
// spec-dependent rather than guessing a spec, kept purely mechanical
// (class-based) rather than pinned to any one character's current spec.
// Any class not listed at all in a set's byClass (a future addition, or
// one this project doesn't yet name) falls back to the same "show
// everything in the set" treatment.
//
// Ranged Crit/Ranged AP are the one exception to "hybrids see everything"
// - not spec-dependent for Paladin/Shaman/Druid the way melee-vs-spell
// is, just never applicable: RELIC_SLOT_CLASSES already establishes
// these three equip a Relic in the ranged slot, never a ranged weapon,
// in any spec. So they're explicitly excluded below rather than left to
// the default fallback.
const CLASS_FILTERED_STAT_SETS = [
  {
    keys: ["crit_pct", "ranged_crit_pct", "spell_crit_pct"],
    byClass: {
      Warrior: ["crit_pct"],
      Rogue: ["crit_pct"],
      "Death Knight": ["crit_pct"],
      Hunter: ["ranged_crit_pct"],
      Mage: ["spell_crit_pct"],
      Warlock: ["spell_crit_pct"],
      Priest: ["spell_crit_pct"],
      Paladin: ["crit_pct", "spell_crit_pct"],
      Shaman: ["crit_pct", "spell_crit_pct"],
      Druid: ["crit_pct", "spell_crit_pct"],
    },
  },
  {
    keys: ["attack_power", "ranged_attack_power"],
    byClass: {
      Warrior: ["attack_power"],
      Rogue: ["attack_power"],
      "Death Knight": ["attack_power"],
      Hunter: ["ranged_attack_power"],
      // Pure casters don't rely on either kind of physical damage.
      Mage: [],
      Warlock: [],
      Priest: [],
      Paladin: ["attack_power"],
      Shaman: ["attack_power"],
      Druid: ["attack_power"],
    },
  },
  {
    // No WotLK Warrior/Rogue/Death Knight/Hunter ability scales off Spell
    // Power (Death Knight diseases scale off Attack Power, not SP, in this
    // era) - SP reads as pure noise for those four, same reasoning as why
    // they don't get the other class's AP/Crit variant.
    keys: ["spell_power"],
    byClass: {
      Warrior: [],
      Rogue: [],
      "Death Knight": [],
      Hunter: [],
      Mage: ["spell_power"],
      Warlock: ["spell_power"],
      Priest: ["spell_power"],
    },
  },
  {
    // Parry is excluded only for the classes with no real melee-combat
    // use case at all - Mage/Warlock/Priest are pure casters. Hunter is
    // NOT excluded, unlike its treatment everywhere else in this file:
    // confirmed against real WotLK talent data that Parry is a genuine,
    // designed-around Survival-tree stat for Hunters, not vestigial -
    // Deflection (talent 19295) directly reads "Increases your chance to
    // parry by X%", and Counterattack (19306) is a whole ability that
    // "becomes active after parrying an opponent's attack". Melee-only
    // classes and the melee/tank/healer/caster hybrids all fall through
    // to the default "show it" treatment.
    keys: ["parry_pct"],
    byClass: {
      Mage: [],
      Warlock: [],
      Priest: [],
    },
  },
  {
    // Block is gated by shield proficiency, not spec ambiguity like the
    // sets above - confirmed directly against AzerothCore's own equip
    // check (Player::CanEquipItem in PlayerStorage.cpp): only Warrior,
    // Paladin, and Shaman can equip a shield at all in this game version.
    // Every other class, Druid included even though it's a hybrid
    // elsewhere in this file, genuinely cannot block - so this is the one
    // set where "everyone but these" is spelled out explicitly rather
    // than left to the default fallback.
    keys: ["block_pct"],
    byClass: {
      Warrior: ["block_pct"],
      Paladin: ["block_pct"],
      Shaman: ["block_pct"],
      Rogue: [],
      "Death Knight": [],
      Hunter: [],
      Mage: [],
      Warlock: [],
      Priest: [],
      Druid: [],
    },
  },
];
const CLASS_FILTERED_STAT_KEYS = new Set(CLASS_FILTERED_STAT_SETS.flatMap((s) => s.keys));

function visibleClassFilteredKeys(className) {
  const visible = new Set();
  for (const { keys, byClass } of CLASS_FILTERED_STAT_SETS) {
    for (const key of byClass[className] || keys) visible.add(key);
  }
  return visible;
}

// The three groups render as their own 3-column row (.stats-columns)
// rather than flowing into the outer auto-fill grid like every other
// .achv-category does - that grid's minmax(220px, 1fr) columns mean only
// one fits per row on mobile, so three short stat cards (a handful of
// "Label: value" lines each) were taking up three screens' worth of
// vertical space for content that's mostly empty horizontal space at
// that width.
function renderCharacterStats(stats, className) {
  if (!stats) return "";
  const visible = visibleClassFilteredKeys(className);
  const groups = STAT_GROUPS.map((group) => {
    const visibleStats = group.stats.filter((s) => !CLASS_FILTERED_STAT_KEYS.has(s.key) || visible.has(s.key));
    return `
    <div class="achv-category">
      <h4 class="achv-category__name">${escapeHtml(group.name)}</h4>
      <ul class="achv-list">
        ${visibleStats.map((s) => {
          const value = stats[s.key];
          const formatted = s.isPct ? `${Number(value || 0).toFixed(2)}%` : formatNumber(value);
          return `<li class="achv-list__item">${escapeHtml(s.label)}: ${formatted}</li>`;
        }).join("")}
      </ul>
    </div>
  `;
  }).join("");
  return `<h3 class="achv-section__name">Stats</h3><div class="stats-columns">${groups}</div>`;
}

// Each class's 3 talent trees, in the same left-to-right order the real
// client shows them (TalentTab.OrderIndex) - confirmed against the real
// WotLK Talent/TalentTab DBC data (r-o-b-o-t-o/azerothcore-armory CSVs),
// not assumed from memory. Tab ids match assets/data/talent_spells.json's
// tab_id (see scripts/generate-talent-data.py) and each character's own
// `talents` object (export-characters-json.sh/wowbackup.sh) - already
// summed to points-per-tab server-side, for the character's own
// currently active spec only (dual-spec's inactive spec is never
// included). Icons are Blizzard's own tree icons, bundled at
// assets/icons/talents/ - 27 of 30 fetched from the same
// Gethe/wow-ui-textures mirror the rest of this app's icons use; Paladin
// Protection and Druid Restoration have no icon in that mirror's current
// snapshot, so those two just render with no icon, same graceful
// fallback every other icon in this app already has.
const TALENT_TABS_BY_CLASS = {
  Warrior: [
    { id: 161, name: "Arms", icon: "ability_rogue_eviscerate" },
    { id: 164, name: "Fury", icon: "ability_warrior_innerrage" },
    { id: 163, name: "Protection", icon: "inv_shield_06" },
  ],
  Paladin: [
    { id: 382, name: "Holy", icon: "spell_holy_holybolt" },
    { id: 383, name: "Protection", icon: "spell_holy_devotionaura" },
    { id: 381, name: "Retribution", icon: "spell_holy_auraoflight" },
  ],
  Hunter: [
    { id: 361, name: "Beast Mastery", icon: "ability_hunter_beasttaming" },
    { id: 363, name: "Marksmanship", icon: "ability_marksmanship" },
    { id: 362, name: "Survival", icon: "ability_hunter_swiftstrike" },
  ],
  Rogue: [
    { id: 182, name: "Assassination", icon: "ability_rogue_eviscerate" },
    { id: 181, name: "Combat", icon: "ability_backstab" },
    { id: 183, name: "Subtlety", icon: "ability_stealth" },
  ],
  Priest: [
    { id: 201, name: "Discipline", icon: "spell_holy_wordfortitude" },
    { id: 202, name: "Holy", icon: "spell_holy_guardianspirit" },
    { id: 203, name: "Shadow", icon: "spell_shadow_shadowwordpain" },
  ],
  "Death Knight": [
    { id: 398, name: "Blood", icon: "spell_deathknight_bloodpresence" },
    { id: 399, name: "Frost", icon: "spell_deathknight_frostpresence" },
    { id: 400, name: "Unholy", icon: "spell_deathknight_unholypresence" },
  ],
  Shaman: [
    { id: 261, name: "Elemental", icon: "spell_nature_lightning" },
    { id: 263, name: "Enhancement", icon: "spell_nature_lightningshield" },
    { id: 262, name: "Restoration", icon: "spell_nature_magicimmunity" },
  ],
  Mage: [
    { id: 81, name: "Arcane", icon: "spell_holy_magicalsentry" },
    { id: 41, name: "Fire", icon: "spell_fire_firebolt02" },
    { id: 61, name: "Frost", icon: "spell_frost_frostbolt02" },
  ],
  Warlock: [
    { id: 302, name: "Affliction", icon: "spell_shadow_deathcoil" },
    { id: 303, name: "Demonology", icon: "spell_shadow_metamorphosis" },
    { id: 301, name: "Destruction", icon: "spell_shadow_rainoffire" },
  ],
  Druid: [
    { id: 283, name: "Balance", icon: "spell_nature_starfall" },
    { id: 281, name: "Feral Combat", icon: "ability_racial_bearform" },
    { id: 282, name: "Restoration", icon: "spell_nature_healingtouch" },
  ],
};

function renderTalents(talents, className) {
  if (!talents) return "";
  const tabs = TALENT_TABS_BY_CLASS[className];
  if (!tabs) return "";
  const columns = tabs.map((tab) => `
    <div class="talent-tab">
      <img class="talent-tab__icon" src="assets/icons/talents/${tab.icon}.png" alt="" onerror="console.warn('icon failed to load:', this.src); this.remove();">
      <div class="talent-tab__name">${escapeHtml(tab.name)}</div>
      <div class="talent-tab__points">${formatNumber(talents[tab.id])}</div>
    </div>
  `).join("");
  return `<h3 class="achv-section__name">Talents</h3><div class="talent-columns">${columns}</div>`;
}

// Equipped Gear: the character's current loadout, slot by slot, straight
// from character_inventory (see export-characters-json.sh/wowbackup.sh's
// equipped_gear) - not sticky, not "earned", just what's on right now.
// Icons resolve against the bundled item_icons.json (item id -> icon
// name, see scripts/generate-item-icons.py); a slot with no icon in that
// map (or whose file failed to load) just shows the name with no icon,
// same graceful fallback every other icon in this app already uses.
// The icon border and item name are tinted by item_template.Quality (see
// QUALITY_COLORS) the same way retail colors item names by rarity; a
// character exported before `quality` was added to equipped_gear just
// renders with no tint, same graceful fallback.
function renderEquippedGear(gear, itemIcons, className) {
  if (gear.length === 0) return "";
  const relicSlot = RELIC_SLOT_CLASSES.has(className);
  const items = gear
    .map((g) => ({ ...g, slotLabel: g.slot === 17 && relicSlot ? "Relic" : EQUIP_SLOT_LABELS[g.slot] }))
    .filter((g) => g.slotLabel)
    .sort((a, b) => a.slot - b.slot);
  if (items.length === 0) return "";
  return `
    <h3 class="achv-section__name">Equipped</h3>
    <ul class="achv-list">
      ${items.map((g) => {
        const color = QUALITY_COLORS[g.quality];
        const iconStyle = color ? `border-color: ${color}` : "";
        const nameStyle = color ? ` style="color: ${color}"` : "";
        return `
        <li class="achv-list__item">${itemIconImg(itemIcons[g.id], "achv-list__icon", iconStyle)}<span${nameStyle}>${escapeHtml(g.name)}</span> <span class="achv-list__date">${escapeHtml(g.slotLabel)}</span></li>
      `;
      }).join("")}
    </ul>
  `;
}

// PvP — its own module, a peer of Equipped and Collections/Achievements,
// not nested inside either (Honor Points is the first thing in it; more
// PvP stats can join it later). Independent of the Type/Date toggle
// entirely, same reasoning as Equipped: no earned_at, not something
// "earned" on a date, so it doesn't belong in either sorted view. A plain
// current-value stat, not a Collection, so it's shown whenever the field
// is present (including 0) — only hidden for a stale characters.json from
// before this field existed (honor_points undefined), same degrade-
// gracefully pattern equipped_gear already uses.
//
// Per-character only for now, deliberately not rolled up into the
// faction/account-level summary stats - though `honor_points` is already
// a plain top-level int per character, the same shape as
// achievement_points/money_copper/played_time_seconds, which already do
// roll up (see renderSummary/renderFactionPanel's .reduce() calls) - so
// adding Honor Points there later is a one-line change whenever that's
// wanted, not a data/schema change.
//
// "Last logged in" isn't a PvP stat, but it lives in this module too
// (the character's own request - see `characters.logout_time`, gated by
// the same "PvP module exists" check rather than its own). A thin
// divider (no header, not yet its own module) separates it from Honor
// Points so it doesn't read as another PvP stat - same visual weight as
// the divider between modules, not squashed against Honor Points above
// it. No icon (unlike every other .achv-list__item): there's no single
// established icon for "last logged in" the way Played Time/Honor
// Points each have one, so it's left plain rather than reusing an icon
// that implies the wrong thing. Its date is rendered plain, not through
// formatEarnedDate's dim .achv-list__date styling - that styling means
// "the date this was unlocked" everywhere else in this app, which is the
// wrong implication for a plain current fact like this. Blank (not
// "Last logged in" with no date) for a character exported before
// `last_online` existed, or one that's never logged out (logout_time = 0
// -> iso() already returns null server-side).
//
// Quests is its own labeled sub-section within this same module (not a
// standalone module - not enough here yet to justify its own
// .achv-section__name), same divider treatment as Last logged in for
// the same reason: it needs separating from Honor Points above it
// without introducing a new heading weight. The sub-header itself reuses
// .achv-category__name - the exact class the Collections/Achievements
// category cards and Stats' Attributes/Defense/Combat groups already use
// for this "small dim uppercase label above a list" shape - applied to
// an <li> here instead of the <h4> it's normally on, since this stays a
// single .achv-list item flowing in the PvP module rather than its own
// grid cell (matching how Honor Points/Last logged in already share one
// list instead of separate grid cells each).
function renderPvP(honorPoints, faction, lastOnline, questsCompleted) {
  if (honorPoints === undefined) return "";
  const icon = HONOR_ICON[faction] || HONOR_ICON.Alliance;
  const lastOnlineDate = formatDDMMYY(lastOnline);
  const lastOnlineItem = lastOnlineDate
    ? `<li class="achv-list__item achv-list__item--divider">Last logged in ${lastOnlineDate}</li>`
    : "";
  const questsItems = questsCompleted === undefined
    ? ""
    : `
      <li class="achv-list__item achv-list__item--divider achv-category__name">Quests</li>
      <li class="achv-list__item">Completed: ${formatNumber(questsCompleted)}</li>
    `;
  return `
    <h3 class="achv-section__name">PvP</h3>
    <ul class="achv-list">
      <li class="achv-list__item"><img class="achv-list__icon" src="${icon}" alt="" onerror="console.warn('icon failed to load:', this.src); this.remove();">Honor Points: ${formatNumber(honorPoints)}</li>
      ${questsItems}
      ${lastOnlineItem}
    </ul>
  `;
}

// Returns achv-category blocks as siblings (not wrapped in a container), so
// they keep flowing into the same auto-fill grid as `.char-achievements`
// uses for every category — an optional full-width heading is inserted
// ahead of this group's own categories to label the section.
function renderAchievementGroups(groups, sectionLabel, showPoints) {
  if (groups.length === 0) return "";
  const heading = sectionLabel
    ? `<h3 class="achv-section__name">${escapeHtml(sectionLabel)}</h3>`
    : "";
  const categories = groups
    .map((group) => `
      <div class="achv-category">
        <h4 class="achv-category__name">${escapeHtml(group.name)} <span class="achv-category__count">(${group.achievements.length})</span></h4>
        <ul class="achv-list">
          ${group.achievements.map((a) => `
            <li class="achv-list__item">${escapeHtml(a.name)}${showPoints ? ` <span class="achv-list__points">${a.points} pts</span>` : ""}${formatEarnedDate(a.earned_at)}</li>
          `).join("")}
        </ul>
      </div>
    `)
    .join("");
  return heading + categories;
}

const MONTH_NAMES = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

// The "Sort by: Date" alternative to renderAchievementGroups: every dated
// Collections/Achievements entry (across every category) as one flat
// timeline, newest first, grouped by year (gold, reusing achv-section__name)
// then month (grey, achv-category__name) instead of by category. No
// per-entry category tag (Sets/Achievement/etc.) — tried it, but it ate too
// much width and caused extra wrapping on mobile, so which list an entry
// came from is only visible in the Type view.
function renderDateView(items) {
  const dated = items.filter((item) => item.earned_at);
  if (dated.length === 0) {
    return `<p class="char-achievements__empty">Nothing dated yet.</p>`;
  }
  const sorted = [...dated].sort((a, b) => b.earned_at.localeCompare(a.earned_at));

  const byYear = new Map();
  for (const item of sorted) {
    const date = new Date(item.earned_at);
    const year = date.getFullYear();
    const month = date.getMonth();
    if (!byYear.has(year)) byYear.set(year, new Map());
    const byMonth = byYear.get(year);
    if (!byMonth.has(month)) byMonth.set(month, []);
    byMonth.get(month).push(item);
  }

  let html = "";
  for (const [year, byMonth] of byYear) {
    html += `<h3 class="achv-section__name">${year}</h3>`;
    for (const [month, monthItems] of byMonth) {
      html += `
        <div class="achv-category">
          <h4 class="achv-category__name">${MONTH_NAMES[month]}</h4>
          <ul class="achv-list">
            ${monthItems.map((item) => `
              <li class="achv-list__item">${escapeHtml(item.name)}${formatEarnedDate(item.earned_at)}</li>
            `).join("")}
          </ul>
        </div>
      `;
    }
  }
  return html;
}

// Blank when there's no date to parse (e.g. the rare achievement whose
// completion date Blizzard never recorded) rather than a misleading blank
// or placeholder date.
function formatDDMMYY(dateStr) {
  if (!dateStr) return "";
  const date = new Date(dateStr);
  if (Number.isNaN(date.getTime())) return "";
  const dd = String(date.getDate()).padStart(2, "0");
  const mm = String(date.getMonth() + 1).padStart(2, "0");
  const yy = String(date.getFullYear()).slice(-2);
  return `${dd}/${mm}/${yy}`;
}

function formatEarnedDate(earnedAt) {
  const formatted = formatDDMMYY(earnedAt);
  return formatted ? ` <span class="achv-list__date">${formatted}</span>` : "";
}

function formatPlayedTime(totalSeconds) {
  totalSeconds = totalSeconds || 0;
  const hours = Math.floor(totalSeconds / 3600);
  return formatNumber(hours) + "h";
}

// The achievement count reads as secondary to the points value (dimmer,
// smaller) rather than both looking equally weighted with only
// parentheses to tell them apart.
function formatAchievements(points, count) {
  return `${formatNumber(points)} <span class="ap-count">(${formatNumber(count)})</span>`;
}

function formatNumber(n) {
  return String(n || 0);
}

function goldAmount(copper) {
  return Math.floor((copper || 0) / 10000);
}

function formatMoneyPlain(copper) {
  return `${formatNumber(goldAmount(copper))}g`;
}

function escapeHtml(str) {
  const div = document.createElement("div");
  div.textContent = str == null ? "" : String(str);
  return div.innerHTML;
}
