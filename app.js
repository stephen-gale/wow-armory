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
  return li;
}

function formatPlayedTime(totalSeconds) {
  totalSeconds = totalSeconds || 0;
  const hours = Math.floor(totalSeconds / 3600);
  return formatNumber(hours) + "h";
}

function formatAchievements(points, count) {
  return `${formatNumber(points)}pts (${formatNumber(count)})`;
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
