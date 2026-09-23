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

// Not a top-level stat yet — shown inside the expanded panel only, under
// Achievements. Icon confirmed from real Blizzard client data, not
// guessed: item 43308 ("Honor Points", the currency-wrapper item id used
// pre-modern-currency-system) -> DisplayInfoID 40753 in ItemDisplayInfo.dbc
// -> InventoryIcon "Spell_Holy_ChampionsBond" (same source/method as
// assets/data/item_icons.json).
const HONOR_ICON = "assets/icons/spell_holy_championsbond.png";

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
function itemIconImg(slug, className) {
  if (!slug) return "";
  return `<img class="${className}" src="assets/icons/items/${slug}.png" alt="" onerror="console.warn('icon failed to load:', this.src); this.remove();">`;
}

// WoW's fixed EQUIPMENT_SLOT_* order (0-18) - stable across the game's
// entire history, matches the character_inventory.slot values the export
// scripts already filter to (bag=0, slot 0-18).
const EQUIP_SLOT_LABELS = [
  "Head", "Neck", "Shoulder", "Shirt", "Chest", "Waist", "Legs", "Feet",
  "Wrist", "Hands", "Ring 1", "Ring 2", "Trinket 1", "Trinket 2", "Back",
  "Main Hand", "Off Hand", "Ranged", "Tabard",
];

// A stat value with its icon in front instead of a text label (e.g. gold
// coin icon instead of the word "Gold"). Used for both the per-faction
// summary row and each character row, in the same Gold/Achievements/Played
// order, so the two stay visually consistent.
function statWithIcon(iconSrc, text, extraIconClass) {
  const cls = extraIconClass ? `stat-icon ${extraIconClass}` : "stat-icon";
  return `<span class="stat"><img class="${cls}" src="${iconSrc}" alt="" onerror="console.warn('icon failed to load:', this.src); this.remove();">${text}</span>`;
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
const generatedAtEl = document.getElementById("generated-at");
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

  generatedAtEl.textContent = data.generated_at
    ? "Generated " + new Date(data.generated_at).toLocaleString()
    : "";

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
  header.innerHTML = `<span class="faction-panel__title">${factionIcon}${faction}</span><span class="faction-panel__count">${characters.length} character${characters.length === 1 ? "" : "s"}</span>`;
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
    <div class="char-card__level">${c.level}</div>
    <div class="char-card__icons">${raceIcon}${classIcon}</div>
    <div class="char-card__main">
      <p class="char-card__name" style="color:${classColor}">${escapeHtml(c.name)}</p>
      <p class="char-card__meta">${escapeHtml(c.race_name)} ${escapeHtml(c.class_name)}${c.account ? " · " + escapeHtml(c.account) : ""}</p>
    </div>
    <div class="char-card__stats">
      ${statWithIcon(STAT_ICONS.played, formatPlayedTime(c.played_time_seconds))}
      ${statWithIcon(STAT_ICONS.achievements, formatAchievements(c.achievement_points, c.achievement_count), "stat-icon--achievement")}
      ${statWithIcon(STAT_ICONS.gold, formatMoneyPlain(c.money_copper))}
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

  const equippedGearHtml = renderEquippedGear(c.equipped_gear || [], itemIcons);
  const honorHtml = renderHonorPoints(c.honor_points);

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

  if (collectionGroups.length === 0 && categoryGroups.length === 0 && !equippedGearHtml && !honorHtml) {
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

  // Three independent modules, in this fixed order: Equipped, Collections/
  // Achievements (with its own Type/Date toggle), PvP - each shown only
  // when it has something to show. Equipped and PvP are both headed by
  // .achv-section__name, which already grows its own top border whenever
  // it isn't .char-achievements' literal first child, so they need no
  // manual divider before or after them - adding one would double up
  // against that automatic border. sortSectionHtml starts with .sort-row
  // instead, which has no built-in separator, so it's the only module that
  // needs an explicit .module-divider in front of it (and only when
  // something already precedes it).
  const parts = [];
  if (equippedGearHtml) parts.push(equippedGearHtml);
  if (sortSectionHtml) {
    if (parts.length > 0) parts.push(`<div class="module-divider"></div>`);
    parts.push(sortSectionHtml);
  }
  if (honorHtml) parts.push(honorHtml);
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

// Equipped Gear: the character's current loadout, slot by slot, straight
// from character_inventory (see export-characters-json.sh/wowbackup.sh's
// equipped_gear) - not sticky, not "earned", just what's on right now.
// Icons resolve against the bundled item_icons.json (item id -> icon
// name, see scripts/generate-item-icons.py); a slot with no icon in that
// map (or whose file failed to load) just shows the name with no icon,
// same graceful fallback every other icon in this app already uses.
function renderEquippedGear(gear, itemIcons) {
  if (gear.length === 0) return "";
  const items = gear
    .map((g) => ({ ...g, slotLabel: EQUIP_SLOT_LABELS[g.slot] }))
    .filter((g) => g.slotLabel)
    .sort((a, b) => a.slot - b.slot);
  if (items.length === 0) return "";
  return `
    <h3 class="achv-section__name">Equipped</h3>
    <ul class="achv-list">
      ${items.map((g) => `
        <li class="achv-list__item">${itemIconImg(itemIcons[g.id], "achv-list__icon")}${escapeHtml(g.slotLabel)}: ${escapeHtml(g.name)}</li>
      `).join("")}
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
function renderHonorPoints(honorPoints) {
  if (honorPoints === undefined) return "";
  return `
    <h3 class="achv-section__name">PvP</h3>
    <ul class="achv-list">
      <li class="achv-list__item"><img class="achv-list__icon" src="${HONOR_ICON}" alt="" onerror="console.warn('icon failed to load:', this.src); this.remove();">Honor Points: ${formatNumber(honorPoints)}</li>
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

// Blank when there's no date to show (e.g. the rare achievement whose
// completion date Blizzard never recorded) rather than a misleading blank
// or placeholder date.
function formatEarnedDate(earnedAt) {
  if (!earnedAt) return "";
  const date = new Date(earnedAt);
  if (Number.isNaN(date.getTime())) return "";
  const dd = String(date.getDate()).padStart(2, "0");
  const mm = String(date.getMonth() + 1).padStart(2, "0");
  const yy = String(date.getFullYear()).slice(-2);
  return ` <span class="achv-list__date">${dd}/${mm}/${yy}</span>`;
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
