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

function iconUrl(slug) {
  return `assets/icons/${slug}.png`;
}

function iconImg(slug, className) {
  if (!slug) return "";
  return `<img class="${className}" src="${iconUrl(slug)}" alt="" onerror="console.warn('icon failed to load:', this.src); this.remove();">`;
}

// A stat value with its icon in front instead of a text label (e.g. gold
// coin icon instead of the word "Gold"). Used for both the per-faction
// summary row and each character row, in the same Gold/Achievements/Played
// order, so the two stay visually consistent.
function statWithIcon(iconSrc, text, extraIconClass) {
  const cls = extraIconClass ? `stat-icon ${extraIconClass}` : "stat-icon";
  return `<span class="stat"><img class="${cls}" src="${iconSrc}" alt="" onerror="console.warn('icon failed to load:', this.src); this.remove();">${text}</span>`;
}

// Fetched once, eagerly, so it's usually already resolved by the time
// someone taps a character to expand their achievements/collections.
let achievementDataPromise = null;

function loadAchievementData() {
  if (!achievementDataPromise) {
    achievementDataPromise = Promise.all([
      fetch("assets/data/achievements.json").then((r) => r.json()),
      fetch("assets/data/achievement_categories.json").then((r) => r.json()),
      fetch("assets/data/collections/gear.json").then((r) => r.json()),
    ]).then(([achievements, categories, collectionGear]) => ({
      achievementsById: new Map(achievements.map((a) => [a.id, a])),
      categoriesById: new Map(categories.map((c) => [c.id, c])),
      collectionGearById: new Map(collectionGear.map((g) => [g.id, g])),
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

  return panel;
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

  loadAchievementData().then(({ achievementsById, categoriesById, collectionGearById }) => {
    placeholder.replaceWith(buildAchievementsPanel(c, achievementsById, categoriesById, collectionGearById));
  });
}

// Two separate, clearly-labeled systems in one expandable panel:
// - Collections: custom, companion-app-only tracking (currently just Gear —
//   equipping a full named gear set — with Mounts/Pets/Tabards etc. planned
//   as sibling categories later). Not real WoW achievements; never mixed
//   into the Achievements totals or grouping below.
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

function buildAchievementsPanel(c, achievementsById, categoriesById, collectionGearById) {
  const li = document.createElement("li");
  li.className = "char-achievements";

  const collectionGearEntries = (c.collections?.gear || []).map(normalizeEntry);
  const byGearTier = new Map();
  for (const entry of collectionGearEntries) {
    const item = collectionGearById.get(entry.id);
    if (!item) continue;
    const list = byGearTier.get(item.tier) || [];
    list.push({ ...item, earned_at: entry.earned_at });
    byGearTier.set(item.tier, list);
  }
  const collectionGroups = [...byGearTier.entries()]
    .map(([tier, items]) => ({
      name: `Gear — ${tier}`,
      achievements: items.sort((a, b) => a.name.localeCompare(b.name)),
    }))
    .sort((a, b) => a.name.localeCompare(b.name));

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

  if (collectionGroups.length === 0 && categoryGroups.length === 0) {
    li.innerHTML = `<p class="char-achievements__empty">No collections or achievements recorded.</p>`;
    return li;
  }

  li.innerHTML =
    renderAchievementGroups(collectionGroups, "Collections", true) +
    renderAchievementGroups(categoryGroups, "Achievements", false);

  return li;
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

// Blank when there's no date to show (e.g. the rare achievement whose
// completion date Blizzard never recorded) rather than a misleading blank
// or placeholder date.
function formatEarnedDate(earnedAt) {
  if (!earnedAt) return "";
  const date = new Date(earnedAt);
  if (Number.isNaN(date.getTime())) return "";
  const formatted = date.toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
  return ` <span class="achv-list__date">${escapeHtml(formatted)}</span>`;
}

function formatPlayedTime(totalSeconds) {
  totalSeconds = totalSeconds || 0;
  const hours = Math.floor(totalSeconds / 3600);
  return formatNumber(hours) + "h";
}

function formatAchievements(points, count) {
  return `${formatNumber(points)} (${formatNumber(count)})`;
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
