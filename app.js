// Registered mainly for PWA installability (Chrome's "Install app" prompt
// requires one); see sw.js for what it actually does.
if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("sw.js").catch((err) => {
      console.warn("Service worker registration failed:", err);
    });
  });
}

// Auto-hiding header: scrolling down hides it (screen space back for the
// roster, the point of this on a phone-sized viewport), scrolling up
// reveals it again immediately, from anywhere on the page - not just back
// at the top. .app-header is `position: fixed` (style.css) to actually
// leave that space behind when hidden, which means body needs real
// padding-top to compensate, computed from the header's own real height
// (it wraps to a taller two-line block at narrow widths) rather than a
// guessed constant that would drift out of sync with a CSS-only change.
const appHeaderEl = document.querySelector(".app-header");
const appHeaderIconEl = document.querySelector(".app-header__icon");

function syncHeaderHeight() {
  document.body.style.paddingTop = appHeaderEl.offsetHeight + "px";
}
syncHeaderHeight();
window.addEventListener("resize", syncHeaderHeight);

// A small threshold avoids flicker from sub-pixel/rubber-band scroll
// deltas (most noticeable on iOS's overscroll bounce), and the header
// always shows right at the top of the page regardless of direction -
// scrolling up into the very top shouldn't leave it hidden.
let lastScrollY = window.scrollY;
const SCROLL_HIDE_THRESHOLD = 8;
window.addEventListener("scroll", () => {
  const currentY = window.scrollY;
  const delta = currentY - lastScrollY;
  if (currentY <= 0) {
    appHeaderEl.classList.remove("app-header--hidden");
    lastScrollY = currentY;
  } else if (delta > SCROLL_HIDE_THRESHOLD) {
    appHeaderEl.classList.add("app-header--hidden");
    lastScrollY = currentY;
  } else if (delta < -SCROLL_HIDE_THRESHOLD) {
    appHeaderEl.classList.remove("app-header--hidden");
    lastScrollY = currentY;
  }
}, { passive: true });

appHeaderIconEl.addEventListener("click", () => {
  window.scrollTo({ top: 0, behavior: "smooth" });
});

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

// Collections icons, category by category - only where a real per-item icon
// actually resolves. Titles have no natural item or spell to hang an icon
// off, so they stay icon-less rather than guessing.
//
// Legendaries/Tabards/Heirlooms are single-item entries (`slot_groups:
// [[id]]`), so their own item id is `slot_groups[0][0]` trivially. Sets
// share the same field, but generate-collections-data.py sorts each set's
// slot_groups by real InventoryType ascending - so slot_groups[0] is
// whichever piece the set actually leads with: the head piece when the set
// has one (InventoryType 1 is always lowest), otherwise some other real
// piece of that exact set. A single fixed icon (e.g. always a helm) would
// misrepresent the 107 of 475 current sets that have no head piece at all -
// this always shows a real item from the set in hand instead.
//
// Mounts/Companions can't use item_icons.json the way the other four do:
// their `item_*` ids are mostly InventoryType 0, excluded from that file's
// own generation. Icons for these instead come from spell_icons.json (see
// scripts/generate-spell-icons.py), keyed by the entry's own first
// `spell_ids` value - any single variant's icon is representative of the
// whole entry, same "any one spell id is enough" reasoning the export
// scripts already use for detection.
function collectionItemIcon(categoryKey, item, itemIcons, spellIcons) {
  if (categoryKey === "sets" || categoryKey === "legendaries" || categoryKey === "tabards" || categoryKey === "heirlooms") {
    const firstItemId = item.slot_groups?.[0]?.[0];
    return itemIconImg(itemIcons[firstItemId], "achv-list__icon");
  }
  if (categoryKey === "mounts" || categoryKey === "companions") {
    const firstSpellId = item.spell_ids?.[0];
    return itemIconImg(spellIcons[firstSpellId], "achv-list__icon");
  }
  return "";
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

// Achievements-with-icons started as a deliberate, narrow rollout (First
// Aid/Cooking/Fishing only, to confirm the idea worked before a bigger
// visual change), then widened once that held up into every category
// verified against real data rather than a blanket "every achievement"
// enable. The rule applied uniformly: walk each of Blizzard's own
// top-level categories that are genuinely completable achievements (not
// live Statistics-pane counters like "Total Deaths"/"Gold looted"/"Largest
// hit dealt", which structurally never have a completion date and were
// checked by name, not guessed), include its full subtree, and cut a
// subtree at any branch whose own coverage or naming shows it's a counter
// too (Rated Arenas, PvP's "World" duels tally - both children of Player
// vs. Player but shaped like the Statistics-pane counters, not real
// achievements). Two extra non-descendant categories (147 "Reputation",
// 191 "Gear") were added by hand after checking their own achievement
// names read as real one-time milestones, not counters, despite living
// under Blizzard's Statistics tree. Result: 1268 achievements in scope,
// 1261 (99.4%) with a real icon in achievement_icons.json - the remaining
// 0.6% (all in Gear) degrade to no icon the same graceful way every other
// icon miss in this app already does.
const ACHIEVEMENT_ICON_CATEGORIES = new Set([
  170, 171, 172, // Cooking, Fishing, First Aid
  81, // Feats of Strength
  92, // General
  95, 165, 14801, 14802, 14803, 14804, 14881, 14901, 15003, // Player vs. Player + Arena/battlegrounds
  96, 14861, 14862, 14863, // Quests (+ Classic/TBC/WotLK quest lines)
  97, 14777, 14778, 14779, 14780, // Exploration (+ Eastern Kingdoms/Kalimdor/Outland/Northrend)
  155, 156, 158, 159, 160, 161, 162, 163, 187, 14941, 14981, // World Events + every holiday
  168, 14805, 14806, 14808, 14921, 14922, 14923, 14961, 14962, 15001, 15002, 15041, 15042, // Dungeons & Raids + raid tiers
  169, // Professions (the Journeyman/Expert/.../Grand Master meta achievements)
  201, 14864, 14865, 14866, // Reputation (+ Classic/TBC/WotLK)
  147, // Reputation milestones ("N Exalted Reputations", etc.) - Statistics tree, verified real
  191, // Gear milestones ("Equipped epic items in item slots", etc.) - Statistics tree, verified real
]);

// The three Professions categories each get their own single profession
// icon on every achievement in that category, rather than each
// achievement's own individually varied Blizzard icon - a skill line
// reads as belonging to that skill at a glance this way. Verified real
// (not guessed): all three already matched a reference screenshot of
// WotLK's actual profession-selection icon grid, and were already
// confirmed correct earlier via Journeyman/Expert/.../Grand Master's own
// shared achievement icon for each profession (see achievement_icons.json).
// Any category added to ACHIEVEMENT_ICON_CATEGORIES without a natural
// single representative icon like this falls through to
// achievement_icons.json's per-achievement lookup instead (see below).
const PROFESSION_ACHIEVEMENT_ICONS = {
  170: "inv_misc_food_15", // Cooking
  171: "trade_fishing", // Fishing
  172: "spell_holy_sealofsacrifice", // First Aid
};

// Shared by earned and unobtained achievements alike, so an achievement
// gets the exact same icon regardless of which list it's rendered in.
function achievementIconHtml(achievement, achievementIcons) {
  if (achievement.category_id in PROFESSION_ACHIEVEMENT_ICONS) {
    return itemIconImg(PROFESSION_ACHIEVEMENT_ICONS[achievement.category_id], "achv-list__icon");
  } else if (ACHIEVEMENT_ICON_CATEGORIES.has(achievement.category_id)) {
    return itemIconImg(achievementIcons[achievement.id], "achv-list__icon");
  }
  return "";
}

// Fetched once, eagerly, so it's usually already resolved by the time
// someone taps a character to expand their achievements/collections.
let achievementDataPromise = null;

function loadAchievementData() {
  if (!achievementDataPromise) {
    achievementDataPromise = Promise.all([
      fetch("assets/data/achievements.json").then((r) => r.json()),
      fetch("assets/data/achievement_categories.json").then((r) => r.json()),
      fetch("assets/data/item_icons.json").then((r) => r.json()),
      fetch("assets/data/spell_icons.json").then((r) => r.json()),
      fetch("assets/data/achievement_icons.json").then((r) => r.json()),
      fetch("assets/data/faction_names.json").then((r) => r.json()),
      ...COLLECTION_CATEGORIES.map((cat) => fetch(cat.file).then((r) => r.json()).catch(() => [])),
    ]).then(([achievements, categories, itemIcons, spellIcons, achievementIcons, factionNames, ...collectionLists]) => {
      // The "Show unobtained" catalog, scoped to the exact same verified-
      // real categories ACHIEVEMENT_ICON_CATEGORIES already uses for icons
      // (Statistics-pane counters like "Total Deaths" never really
      // "unlock", so they're never offered as something to chase) - one
      // consistent allowlist for both purposes, not two separately
      // maintained ones.
      const achievementsByCategory = new Map();
      for (const a of achievements) {
        if (!ACHIEVEMENT_ICON_CATEGORIES.has(a.category_id)) continue;
        const list = achievementsByCategory.get(a.category_id) || [];
        list.push(a);
        achievementsByCategory.set(a.category_id, list);
      }
      return {
        achievementsById: new Map(achievements.map((a) => [a.id, a])),
        categoriesById: new Map(categories.map((c) => [c.id, c])),
        achievementsByCategory,
        itemIcons,
        spellIcons,
        achievementIcons,
        factionNames,
        collectionsByCategory: new Map(
          COLLECTION_CATEGORIES.map((cat, i) => [cat.key, new Map(collectionLists[i].map((item) => [item.id, item]))])
        ),
      };
    });
  }
  return achievementDataPromise;
}
loadAchievementData();

// Zone names (assets/data/area_names.json, id -> English name from the
// real AreaTable.dbc - see scripts/extract-dbc-names.py) are needed on
// the always-visible collapsed character row, not just inside the
// expandable panel loadAchievementData() covers - fetched separately,
// just as eagerly, so it's ready by the time renderCharCard runs for a
// freshly loaded characters.json.
let areaNamesPromise = fetch("assets/data/area_names.json").then((r) => r.json()).catch(() => ({}));


const fileInput = document.getElementById("file-input");
const emptyStateEl = document.getElementById("empty-state");
const summaryBarEl = document.getElementById("summary-bar");
const factionsEl = document.getElementById("factions");

// Collapse all/Expand all button label reflects real state, not just
// "last bulk action taken" - checked fresh against every achv-category
// card in whichever view (Type or Date) is currently active, each time
// anything could have changed it: the button's own click, an individual
// chevron toggle (see toggleCategoryCollapse below), or switching
// Type/Date (see the Sort radio's own change listener, which calls this
// again on switch so the label stays in sync with whichever view just
// became active). Scoped to the active view specifically, not both at
// once - a user collapsing every card they can actually see should see
// this flip to "Expand all" regardless of what the *other*, not-
// currently-shown view's cards happen to be doing; scoring against a
// view nobody's looking at would leave this stuck on "Collapse all" long
// after everything visible is collapsed. Each view tracks its own
// collapsed state independently, same as their content already is
// independent. A panel with no button at all (Stats-only panels have
// none, since Stats itself isn't collapsible; the per-faction Heirlooms
// panel has cards but no Sort row/button at all) is a no-op.
function updateHideAllButton(panel) {
  const button = panel.querySelector(".hideall-toggle");
  if (!button) return;
  const activeView = panel.querySelector(".sort-view.is-active");
  if (!activeView) return;
  // A category with zero earned achievements (achv-category--all-unobtained)
  // is invisible whenever "Show all" hasn't been clicked - never
  // collapsed because it can't be clicked, so counting it toward "is
  // everything collapsed" would keep this stuck on "Collapse all" forever.
  // Excluded only while it's actually invisible; once "Show all" reveals
  // it, it counts like any other card.
  const showingUnobtained = panel.classList.contains("show-unobtained");
  const cards = [...activeView.querySelectorAll(".achv-category")].filter(
    (card) => showingUnobtained || !card.classList.contains("achv-category--all-unobtained")
  );
  const allCollapsed = cards.length > 0 && cards.every((card) => card.classList.contains("achv-category--collapsed"));
  button.textContent = allCollapsed ? "Expand all" : "Collapse all";
}

// Chevron collapse/expand for achv-category subheadings - Type view's
// category cards (Collections and Achievements alike) and Date view's
// month cards, marked achv-category__name--collapsible by
// collapsibleCategoryHeading. Stats' own cards render a plain, non-
// collapsible heading instead (see renderCharacterStats) - always fully
// visible, the character's own request. One delegated listener here
// (rather than wiring each card right after it renders, the pattern
// Sort/Unobtained use) covers every card this produces - multiple
// characters' panels, the per-faction Heirlooms panel, and any panel
// opened later - without separate wiring code at each call site.
function toggleCategoryCollapse(heading) {
  const card = heading.closest(".achv-category");
  if (!card) return;
  const collapsed = card.classList.toggle("achv-category--collapsed");
  heading.setAttribute("aria-expanded", String(!collapsed));
  // Keep the panel's own Collapse all/Expand all button (if any) in sync
  // with whatever this individual toggle just did - collapsing the last
  // open card should flip it to "Expand all" exactly as if Collapse all
  // itself had been clicked, and expanding any one card once everything
  // was collapsed should flip it back.
  const panel = card.closest(".char-achievements");
  if (panel) updateHideAllButton(panel);
}
factionsEl.addEventListener("click", (event) => {
  const heading = event.target.closest(".achv-category__name--collapsible");
  if (heading) toggleCategoryCollapse(heading);
});
factionsEl.addEventListener("keydown", (event) => {
  if (event.key !== "Enter" && event.key !== " ") return;
  const heading = event.target.closest(".achv-category__name--collapsible");
  if (!heading) return;
  event.preventDefault();
  toggleCategoryCollapse(heading);
});

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
  loadAchievementData().then(({ collectionsByCategory, itemIcons }) => {
    const panel = buildFactionHeirloomsPanel(characters, collectionsByCategory, itemIcons);
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
function buildFactionHeirloomsPanel(characters, collectionsByCategory, itemIcons) {
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
      return item && { ...item, earned_at, iconHtml: collectionItemIcon("heirlooms", item, itemIcons) };
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
      <p class="char-card__zone" hidden></p>
      <div class="char-card__stats">
        ${statWithIcon(STAT_ICONS.played, formatPlayedTime(c.played_time_seconds))}
        ${statWithIcon(STAT_ICONS.achievements, formatAchievements(c.achievement_points, c.achievement_count), "stat-icon--achievement")}
        ${statWithIcon(STAT_ICONS.gold, formatMoneyPlain(c.money_copper))}
      </div>
    </div>
    <svg class="char-card__toggle" viewBox="0 0 10 6" aria-hidden="true"><path d="M1 1l4 4 4-4" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>
  `;

  li.addEventListener("click", () => toggleAchievementsPanel(li, c));
  li.addEventListener("keydown", (event) => {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      toggleAchievementsPanel(li, c);
    }
  });

  // Zone name resolves async (see areaNamesPromise) - the .char-card__zone
  // placeholder above starts hidden and empty so nothing shifts layout
  // once it fills in a moment later. A character with no zone_id (a
  // characters.json from before this field existed) or a zone_id
  // area_names.json doesn't recognize just leaves it hidden, same
  // graceful fallback as every other optional field in this app.
  if (c.zone_id !== undefined) {
    areaNamesPromise.then((areaNames) => {
      const zoneName = areaNames[c.zone_id];
      if (!zoneName) return;
      const zoneEl = li.querySelector(".char-card__zone");
      zoneEl.textContent = zoneName;
      zoneEl.hidden = false;
    });
  }

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

  loadAchievementData().then(({ achievementsById, categoriesById, achievementsByCategory, collectionsByCategory, itemIcons, spellIcons, achievementIcons, factionNames }) => {
    placeholder.replaceWith(buildAchievementsPanel(c, achievementsById, categoriesById, achievementsByCategory, collectionsByCategory, itemIcons, spellIcons, achievementIcons, factionNames));
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

function buildAchievementsPanel(c, achievementsById, categoriesById, achievementsByCategory, collectionsByCategory, itemIcons, spellIcons, achievementIcons, factionNames) {
  const li = document.createElement("li");
  li.className = "char-achievements";

  const statsHtml = renderCharacterStats(c.stats, c.class_name);
  const talentsHtml = renderTalents(c.talents, c.class_name);
  const skillsHtml = renderSkills(c.skills);
  const equippedGearHtml = renderEquippedGear(c.equipped_gear || [], itemIcons, c.class_name);
  const glyphsHtml = renderGlyphs(c.glyphs);
  const pvpHtml = renderPvP(c.honor_points, c.faction);
  const questsHtml = renderQuests(c.quests_completed);
  const exaltedFactionsHtml = renderExaltedFactions(c.exalted_factions, factionNames);
  const lastLoggedInHtml = renderLastLoggedIn(c.last_online);

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
        if (!item) return null;
        // Sets' names come from intersecting common tokens across each
        // piece's own name (see generate-collections-data.py's
        // derive_set_name) - "of X" is a common result when pieces only
        // share that suffix (e.g. "Boots of Wrath" + "Helm of Wrath"),
        // which reads oddly right next to the item icon ("[icon] of
        // Wrath"). Display-only: doesn't touch the underlying name, so a
        // set literally named "of" (no space after, an edge case where
        // even that was the only common token) is left alone rather than
        // stripped to an empty string.
        const name = cat.key === "sets" ? item.name.replace(/^of /, "") : item.name;
        return { ...item, name, earned_at: entry.earned_at, iconHtml: collectionItemIcon(cat.key, item, itemIcons, spellIcons) };
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
    list.push({ ...achievement, earned_at: entry.earned_at, iconHtml: achievementIconHtml(achievement, achievementIcons) });
    byCategory.set(achievement.category_id, list);
  }

  // "Show unobtained" (see the checkbox below) needs every category that
  // *could* show unobtained achievements in the DOM up front, not just the
  // ones the character has already earned into - including categories with
  // zero earned achievements so far, invisible by default the same way an
  // empty Collections category already is. achievementsByCategory (see
  // loadAchievementData) already scopes this to the verified-real
  // categories, so a category outside that allowlist (which shouldn't earn
  // achievements in practice, but isn't hard-blocked from it either) just
  // never gets a `total`/unobtained list - same graceful "falls back to
  // earned-only" behavior every optional field in this app already uses.
  const allCategoryIds = new Set([...byCategory.keys(), ...achievementsByCategory.keys()]);
  const categoryGroups = [...allCategoryIds]
    .map((categoryId) => {
      const earned = (byCategory.get(categoryId) || []).sort((a, b) => a.name.localeCompare(b.name));
      const group = { name: categoriesById.get(categoryId)?.name || "Other", achievements: earned };
      const catalog = achievementsByCategory.get(categoryId);
      if (catalog) {
        const earnedIds = new Set(earned.map((a) => a.id));
        const unobtained = catalog
          .filter((a) => !earnedIds.has(a.id))
          .map((a) => ({ ...a, earned_at: null, iconHtml: achievementIconHtml(a, achievementIcons), unobtained: true }));
        group.total = catalog.length;
        group.allAchievements = [...earned, ...unobtained].sort((a, b) => a.name.localeCompare(b.name));
      }
      return group;
    })
    .filter((group) => group.achievements.length > 0 || group.total !== undefined)
    .sort((a, b) => a.name.localeCompare(b.name));

  // Whether there's any *earned* achievement to show - categoryGroups now
  // always carries one entry per verified-real category (for the
  // unobtained checklist), even for a character with none of them earned
  // yet, so the empty-state message and the Sort row's own appear-at-all
  // condition below need this rather than a raw categoryGroups.length
  // check, or they'd both wrongly fire for every character.
  const hasRealAchievements = categoryGroups.some((group) => group.achievements.length > 0);

  if (collectionGroups.length === 0 && !hasRealAchievements && !statsHtml && !talentsHtml && !skillsHtml && !equippedGearHtml && !glyphsHtml && !pvpHtml && !questsHtml && !exaltedFactionsHtml && !lastLoggedInHtml) {
    li.innerHTML = `<p class="char-achievements__empty">No collections or achievements recorded.</p>`;
    return li;
  }

  // The toggle itself only makes sense when there's actually Collections/
  // Achievements data to sort - skip it entirely otherwise (e.g. a
  // character with gear equipped but nothing recorded yet).
  let sortSectionHtml = "";
  if (collectionGroups.length > 0 || hasRealAchievements) {
    // Lives on the "Achievements" heading itself (see renderAchievementGroups'
    // headingActionHtml), not the shared Sort row - Show all/Only mine only
    // ever affects Achievements, never Collections, and this way it's
    // structurally absent from the Date view entirely (renderDateView
    // never renders an "Achievements" heading at all) rather than needing
    // separate CSS to hide it there.
    const unobtainedButtonHtml = `<button type="button" class="panel-toggle unobtained-toggle">Show all</button>`;
    const typeViewHtml =
      renderAchievementGroups(collectionGroups, "Collections", false) +
      renderAchievementGroups(categoryGroups, "Achievements", false, unobtainedButtonHtml);
    // Unobtained achievements never enter the Date view - they have no
    // earned_at, so renderDateView's own `dated` filter would drop them
    // anyway, but building allItems from `.achievements` (not
    // `.allAchievements`) keeps that implicit rather than relying on it.
    const allItems = [...collectionGroups, ...categoryGroups].flatMap((group) => group.achievements);
    const dateViewHtml = renderDateView(allItems);

    // Radio `name` must be unique per panel — multiple characters' panels
    // can be expanded on the page at once, and a shared name would let
    // toggling one character's Sort by also move every other open panel's.
    const toggleName = `sort-${c.guid}`;
    sortSectionHtml = `
      <div class="sort-row">
        <div class="sort-toggle" role="radiogroup" aria-label="Sort by">
          <input type="radio" name="${toggleName}" id="${toggleName}-date" checked>
          <label class="sort-toggle__label" for="${toggleName}-date">Date</label>
          <input type="radio" name="${toggleName}" id="${toggleName}-type">
          <label class="sort-toggle__label" for="${toggleName}-type">Type</label>
        </div>
        <button type="button" class="panel-toggle hideall-toggle">Collapse all</button>
      </div>
      <div class="sort-view" data-view="type">${typeViewHtml}</div>
      <div class="sort-view is-active" data-view="date">${dateViewHtml}</div>
    `;
  }

  // Nine independent modules, in this fixed order: Talents, Equipped,
  // Glyphs, Stats, Skills, Collections/Achievements (with its own Type/
  // Date toggle), PvP, Quests, Exalted Factions - each shown only when it
  // has something to show. Talents, Equipped, Glyphs, Stats, Skills, PvP,
  // Quests and Exalted Factions are all headed by .achv-section__name,
  // which already grows its own top border whenever it isn't
  // .char-achievements' literal first child, so they need no manual
  // divider before or after them - adding one would double up against
  // that automatic border. (Whichever of these ends up first is exactly
  // why this rule is driven by :first-child rather than by which module
  // JS puts first - each one automatically picks up its own top border
  // the moment something starts coming before it, no CSS change needed
  // when the order changes.) Glyphs sits right after Equipped (the
  // character's own request - both are "what's currently on the
  // character" snapshots, gear then glyphs).
  // sortSectionHtml starts with .sort-row instead, which has no built-in
  // separator, so it's the only module that needs an explicit
  // .module-divider in front of it (and only when something already
  // precedes it).
  // Last logged in isn't one of the nine modules - a single trailing
  // fact (the character's own request to keep it last), always pushed
  // after everything else regardless of which modules are present.
  const parts = [];
  if (talentsHtml) parts.push(talentsHtml);
  if (equippedGearHtml) parts.push(equippedGearHtml);
  if (glyphsHtml) parts.push(glyphsHtml);
  if (statsHtml) parts.push(statsHtml);
  if (skillsHtml) parts.push(skillsHtml);
  if (sortSectionHtml) {
    if (parts.length > 0) parts.push(`<div class="module-divider"></div>`);
    parts.push(sortSectionHtml);
  }
  if (pvpHtml) parts.push(pvpHtml);
  if (questsHtml) parts.push(questsHtml);
  if (exaltedFactionsHtml) parts.push(exaltedFactionsHtml);
  if (lastLoggedInHtml) parts.push(lastLoggedInHtml);
  li.innerHTML = parts.join("");

  const views = li.querySelectorAll(".sort-view");
  for (const radio of li.querySelectorAll(".sort-toggle input")) {
    radio.addEventListener("change", () => {
      const which = radio.id.endsWith("-date") ? "date" : "type";
      views.forEach((view) => view.classList.toggle("is-active", view.dataset.view === which));
      // Collapse/Expand tracks whichever view is now active (see
      // updateHideAllButton) - the view just switched away from may be
      // left in a different collapsed state than the one just switched
      // to, so the label needs recomputing here, not just after that
      // button's own click or an individual chevron toggle.
      updateHideAllButton(li);
    });
  }

  // Starts on "Show all" - celebrating what's earned (only mine) stays
  // the default view, matching Collections' own tenet - and flips to
  // "Only mine" once clicked. The label is the action clicking performs,
  // not the current state, same convention Collapse/Expand below uses.
  // CSS (`.show-unobtained`, see style.css) does the actual reveal, so
  // clicking this never re-renders the panel.
  const unobtainedButton = li.querySelector(".unobtained-toggle");
  if (unobtainedButton) {
    unobtainedButton.addEventListener("click", () => {
      const showingUnobtained = li.classList.toggle("show-unobtained");
      unobtainedButton.textContent = showingUnobtained ? "Only mine" : "Show all";
    });
  }

  // A bulk version of the same per-card chevron toggle (toggleCategoryCollapse
  // above) - collapses or expands every achv-category card at once, but
  // only in whichever view is currently active (see updateHideAllButton
  // for why: the label needs to mean "is everything you can actually see
  // collapsed", and scoring that against a hidden view nobody's looking
  // at would make it lie). Unlike "Show all"/"Only mine", this control
  // itself stays visible and useful in both views - Date view's month
  // cards can get just as long as Type view's categories - it just
  // tracks/acts on each view independently, the same way their content
  // already is independent. Label reflects real state rather than which
  // direction it was last clicked, so it stays correct even after an
  // individual chevron toggle changes whether everything happens to be
  // collapsed.
  const hideAllButton = li.querySelector(".hideall-toggle");
  if (hideAllButton) {
    hideAllButton.addEventListener("click", () => {
      const activeView = li.querySelector(".sort-view.is-active");
      if (!activeView) return;
      const collapse = hideAllButton.textContent.trim() !== "Expand all";
      for (const card of activeView.querySelectorAll(".achv-category")) {
        card.classList.toggle("achv-category--collapsed", collapse);
        const heading = card.querySelector(".achv-category__name--collapsible");
        if (heading) heading.setAttribute("aria-expanded", String(!collapse));
      }
      updateHideAllButton(li);
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

// One fixed icon per profession, same treatment PROFESSION_ACHIEVEMENT_ICONS
// already gives Cooking/Fishing/First Aid. Found without needing a DBC pull
// from the deck: acore_world has no spellicon_dbc table (see Skills'
// SQL comment), but every profession has real "Learn <Profession>" trainer
// spells literally named after it in the already-bundled Spell CSV - every
// one of those spells for a given profession shares the same SpellIconID,
// and resolving that id gave the exact real trade icon - verified against
// a reference screenshot of the actual in-game profession list, exact
// match on all 14. Cooking/Fishing/First Aid's own icons additionally
// matched exactly what the achievement-icon path already found
// independently, cross-confirming the method. Inscription's own "Learn
// Inscription" spells resolved the same way to inv_inscription_tradeskill01;
// an earlier, partial reference screenshot made that look like a mismatch
// (a plain quill/inkwell rather than the reddish rune/glyph shape it
// seemed to show), but a fuller screenshot confirmed inv_inscription_tradeskill01
// really is correct, so it's used as originally resolved.
const SKILL_ICONS = {
  129: "spell_holy_sealofsacrifice", // First Aid
  164: "trade_blacksmithing", // Blacksmithing
  165: "inv_misc_armorkit_17", // Leatherworking
  171: "trade_alchemy", // Alchemy
  182: "trade_herbalism", // Herbalism
  185: "inv_misc_food_15", // Cooking
  186: "trade_mining", // Mining
  197: "trade_tailoring", // Tailoring
  202: "trade_engineering", // Engineering
  333: "trade_engraving", // Enchanting
  356: "trade_fishing", // Fishing
  393: "inv_misc_pelt_wolf_01", // Skinning
  755: "inv_misc_gem_02", // Jewelcrafting
  773: "inv_inscription_tradeskill01", // Inscription
};

// Skills — professions only (see export-characters-json.sh/wowbackup.sh's
// SQL comment for the verified skill id list), right after Stats: a
// live snapshot like Equipped/Stats, not a Collection - skill points keep
// climbing, so there's no "earned_at" moment and no place in the Sort by
// Type/Date toggle. Names are already resolved server-side via a live
// join against acore_world.skillline_dbc (see the export scripts), so no
// client-side lookup is needed here, unlike Exalted Factions/Titles.
function renderSkills(skills) {
  if (!skills || skills.length === 0) return "";
  const sorted = [...skills].sort((a, b) => a.name.localeCompare(b.name));
  return `
    <h3 class="achv-section__name">Skills</h3>
    <ul class="achv-list">
      ${sorted.map((s) => `<li class="achv-list__item">${itemIconImg(SKILL_ICONS[s.id], "achv-list__icon")}${escapeHtml(s.name)}: ${formatNumber(s.value)}/${formatNumber(s.max)}</li>`).join("")}
    </ul>
  `;
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
// Average item level excludes Shirt (slot 3) and Tabard (slot 18) - both
// are cosmetic-only slots with no stats, and item_template.ItemLevel on
// real shirts/tabards is mostly a nominal 1 with a handful of odd
// nonzero outliers (confirmed against the real item_template data, not
// assumed) rather than anything reflecting actual gear power. Same
// exclusion the real character pane's own average item level uses.
const ITEM_LEVEL_EXCLUDED_SLOTS = new Set([3, 18]);

function renderEquippedGear(gear, itemIcons, className) {
  if (gear.length === 0) return "";
  const relicSlot = RELIC_SLOT_CLASSES.has(className);
  const items = gear
    .map((g) => ({ ...g, slotLabel: g.slot === 17 && relicSlot ? "Relic" : EQUIP_SLOT_LABELS[g.slot] }))
    .filter((g) => g.slotLabel)
    .sort((a, b) => a.slot - b.slot);
  if (items.length === 0) return "";
  const levelItems = items.filter((g) => g.item_level !== undefined && !ITEM_LEVEL_EXCLUDED_SLOTS.has(g.slot));
  const avgItemLevel = levelItems.length > 0
    ? Math.round(levelItems.reduce((sum, g) => sum + g.item_level, 0) / levelItems.length)
    : undefined;
  const avgItemLevelItem = avgItemLevel === undefined
    ? ""
    : `<li class="achv-list__item achv-list__item--spaced">Avg Item Lvl: ${formatNumber(avgItemLevel)}</li>`;
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
      ${avgItemLevelItem}
    </ul>
  `;
}

// Glyphs: the character's currently equipped Major/Minor glyphs, straight
// from character_glyphs (see export-characters-json.sh/wowbackup.sh's
// glyphs/glyph_ref queries), for the ACTIVE spec only - same
// activeTalentGroup filter Talents already uses, since character_glyphs
// keeps one full row per spec and a respec leaves the other spec's
// glyphs sitting in the table too. A plain current-state snapshot like
// Equipped/Stats/Skills: no earned_at, not part of the Sort by Date
// view. Sits right after Equipped (the character's own request - both
// are "what's on the character right now").
//
// Name and icon are both already resolved server-side rather than
// looked up here, same "live join, no bundled reference file" reasoning
// Skills already uses - and for good reason: neither GlyphProperties'
// own SpellIconID nor the spell that teaches a glyph has a distinctive
// per-glyph icon (confirmed directly against the real client data -
// both only ever cycle through a handful of generic placeholder
// textures). The real, distinctive picture only exists on the physical
// Inscription-crafted "Glyph of X" item itself, which the export
// scripts walk all the way through to via SPELL_EFFECT_APPLY_GLYPH
// (confirmed as effect id 74 against AzerothCore's own SharedDefines.h).
//
// A flat achv-list, the same shape/CSS Equipped Gear already uses
// (reused rather than the earlier circular-tile wheel-inspired layout):
// real icon at achv-list__icon size, plain name text, and a grey
// trailing achv-list__date-style label - Equipped Gear's label is the
// slot name ("Head", "Chest"); here it's "Major" or "Minor" instead,
// since that's the one piece of per-glyph context worth a label (unlike
// Equipped Gear's items, nothing here needs quality-color tinting).
// Major entries list first, Minor after - same flat list, not a
// separate section each, so the "which glyph is which tier" question is
// answered per-row rather than by position in two stacked groups.
// achv-list__icon--glyph (style.css) adds a gold circular backdrop - the
// bundled rune art is a plain grey transparent-background silhouette on
// its own, which read as flat/inactive against this app's dark theme
// until that was added.
function renderGlyphs(glyphs) {
  if (!glyphs) return "";
  const { major = [], minor = [] } = glyphs;
  if (major.length === 0 && minor.length === 0) return "";
  const item = (g, label) => `<li class="achv-list__item">${itemIconImg(g.icon, "achv-list__icon achv-list__icon--glyph")}${escapeHtml(g.name)} <span class="achv-list__date">${label}</span></li>`;
  return `
    <h3 class="achv-section__name">Glyphs</h3>
    <ul class="achv-list">
      ${major.map((g) => item(g, "Major")).join("")}
      ${minor.map((g) => item(g, "Minor")).join("")}
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
function renderPvP(honorPoints, faction) {
  if (honorPoints === undefined) return "";
  const icon = HONOR_ICON[faction] || HONOR_ICON.Alliance;
  return `
    <h3 class="achv-section__name">PvP</h3>
    <ul class="achv-list">
      <li class="achv-list__item"><img class="achv-list__icon" src="${icon}" alt="" onerror="console.warn('icon failed to load:', this.src); this.remove();">Honor Points: ${formatNumber(honorPoints)}</li>
    </ul>
  `;
}

// Last logged in - the very last thing in the whole panel, after every
// other module (the character's own request), not tucked inside PvP.
// No header (a single plain fact doesn't need one) and no icon (unlike
// every other .achv-list__item): there's no single established icon for
// "last logged in" the way Played Time/Honor Points each have one, so
// it's left plain rather than reusing an icon that implies the wrong
// thing. Rendered plain, not through formatEarnedDate's dim
// .achv-list__date styling - that styling means "the date this was
// unlocked" everywhere else in this app, which is the wrong implication
// for a plain current fact like this. Blank (not "Last logged in" with
// no date) for a character exported before `last_online` existed, or
// one that's never logged out (logout_time = 0 -> iso() already returns
// null server-side).
function renderLastLoggedIn(lastOnline) {
  const lastOnlineDate = formatDDMMYY(lastOnline);
  if (!lastOnlineDate) return "";
  return `<ul class="achv-list achv-list--divider"><li class="achv-list__item">Last logged in: ${lastOnlineDate}</li></ul>`;
}

// Quests — its own module, right after PvP. Same "plain current-value
// stat, always shown including 0" treatment as PvP/Equipped: no
// earned_at, not gated by the Sort toggle, undefined (not 0) is what
// means "hide this" (a stale characters.json from before this field
// existed), matching every other module's degrade-gracefully pattern.
function renderQuests(questsCompleted) {
  if (questsCompleted === undefined) return "";
  return `
    <h3 class="achv-section__name">Quests</h3>
    <ul class="achv-list">
      <li class="achv-list__item">Completed: ${formatNumber(questsCompleted)}</li>
    </ul>
  `;
}

// Exalted Factions — the last module, right after Quests. A live snapshot
// like Equipped/Avg Item Lvl, not a Collection: reputation standing keeps
// moving, so there's no "earned_at" moment to record and no place in the
// Sort by Type/Date toggle. `exalted_factions` (a plain array of faction
// ids) is computed server-side in the export scripts - not just a
// `standing >= 42000` check, since character_reputation.standing is a
// delta on top of a race/class-specific baseline (confirmed against
// AzerothCore's own ReputationMgr::GetReputation()), so getting this
// right needed real baseline data (scripts/extract-faction-baselines.py)
// the client doesn't have and doesn't need - only the already-computed
// id list, resolved to names here the same way Titles resolves an
// achievement id to a title string: from a bundled reference file
// (assets/data/faction_names.json), not a second DB round-trip.
function renderExaltedFactions(exaltedFactionIds, factionNames) {
  if (!exaltedFactionIds || exaltedFactionIds.length === 0) return "";
  const names = exaltedFactionIds
    .map((id) => factionNames[id])
    .filter(Boolean)
    .sort((a, b) => a.localeCompare(b));
  if (names.length === 0) return "";
  return `
    <h3 class="achv-section__name">Exalted Factions</h3>
    <ul class="achv-list">
      ${names.map((name) => `<li class="achv-list__item">${escapeHtml(name)}</li>`).join("")}
    </ul>
  `;
}

// Shared by renderAchievementGroups (Type view category cards) and
// renderDateView (Date view month cards) - the same collapse/expand caret
// the character card's own expand/collapse toggle already uses
// (.char-card__toggle), reused here rather than a new icon. Collapsing/
// expanding is wired up once, by delegation, in the factionsEl listener
// above - this only needs to mark which headings are collapsible
// (achv-category__name--collapsible), not attach anything itself.
function collapsibleCategoryHeading(innerHtml) {
  return `
    <h4 class="achv-category__name achv-category__name--collapsible" role="button" tabindex="0" aria-expanded="true">
      <span>${innerHtml}</span>
      <svg class="achv-category__chevron" viewBox="0 0 10 6" aria-hidden="true"><path d="M1 1l4 4 4-4" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>
    </h4>
  `;
}

// Returns achv-category blocks as siblings (not wrapped in a container), so
// they keep flowing into the same auto-fill grid as `.char-achievements`
// uses for every category — an optional full-width heading is inserted
// ahead of this group's own categories to label the section.
//
// A group with `total` set (only ever true for Achievements categories -
// see buildAchievementsPanel) also carries `allAchievements`, the earned
// list plus every unobtained one for that category, each tagged
// `unobtained: true`. Both the "(earned)" and "(earned/total)" count and
// every unobtained <li> render unconditionally, hidden by CSS
// (`.show-unobtained`, style.css) rather than re-rendered on toggle - same
// "precompute both states, let CSS pick" approach the Type/Date views
// already use. A category with zero earned achievements gets
// achv-category--all-unobtained so the whole card, not just its count,
// stays hidden until the checkbox reveals it.
//
// headingActionHtml (only ever passed for the "Achievements" call - see
// buildAchievementsPanel) sits right-aligned on the same row as
// sectionLabel itself, for a control that's specific to this section, not
// the module as a whole - Show all/Only mine only ever affects
// Achievements, never Collections, so it lives on the row it actually
// controls rather than a shared row that implies it touches both.
function renderAchievementGroups(groups, sectionLabel, showPoints, headingActionHtml) {
  if (groups.length === 0) return "";
  const headingClass = headingActionHtml ? "achv-section__name achv-section__name--with-action" : "achv-section__name";
  const heading = sectionLabel
    ? `<h3 class="${headingClass}">${escapeHtml(sectionLabel)}${headingActionHtml || ""}</h3>`
    : "";
  const categories = groups
    .map((group) => {
      const items = group.allAchievements || group.achievements;
      const countHtml = group.total !== undefined
        ? `<span class="achv-category__count achv-category__count--obtained">(${group.achievements.length})</span><span class="achv-category__count achv-category__count--total">(${group.achievements.length}/${group.total})</span>`
        : `<span class="achv-category__count">(${group.achievements.length})</span>`;
      const cardClass = group.achievements.length === 0 && group.total !== undefined
        ? "achv-category achv-category--all-unobtained"
        : "achv-category";
      return `
      <div class="${cardClass}">
        ${collapsibleCategoryHeading(`${escapeHtml(group.name)} ${countHtml}`)}
        <ul class="achv-list">
          ${items.map((a) => `
            <li class="achv-list__item${a.unobtained ? " achv-list__item--unobtained" : ""}">${a.iconHtml || ""}${escapeHtml(a.name)}${showPoints ? ` <span class="achv-list__points">${a.points} pts</span>` : ""}${formatEarnedDate(a.earned_at)}</li>
          `).join("")}
        </ul>
      </div>
    `;
    })
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
          ${collapsibleCategoryHeading(MONTH_NAMES[month])}
          <ul class="achv-list">
            ${monthItems.map((item) => `
              <li class="achv-list__item">${item.iconHtml || ""}${escapeHtml(item.name)}${formatEarnedDate(item.earned_at)}</li>
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
