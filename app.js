import { initializeApp }      from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import { getFirestore, doc, collection, onSnapshot }
  from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

/* ──────────────────────────────────────────────
   FIREBASE CONFIG
   ────────────────────────────────────────────── */
const firebaseConfig = {
  apiKey:            "AIzaSyCWvHbZghVZu9aDUO-sHroxOiN0WXZ3AgI",
  authDomain:        "cricketauction-df77b.firebaseapp.com",
  databaseURL:       "https://cricketauction-df77b-default-rtdb.firebaseio.com",
  projectId:         "cricketauction-df77b",
  storageBucket:     "cricketauction-df77b.firebasestorage.app",
  messagingSenderId: "1052181366792",
  appId:             "1:1052181366792:web:c86af556248567e9f5e9bd",
  measurementId:     "G-BF00NXYJJ9"
};

const fbApp = initializeApp(firebaseConfig);
const db    = getFirestore(fbApp);

/* ──────────────────────────────────────────────
   DOM HELPERS
   ────────────────────────────────────────────── */
const $  = id => document.getElementById(id);
const el = (tag, cls, html) => {
  const e = document.createElement(tag);
  if (cls)  e.className   = cls;
  if (html) e.innerHTML   = html;
  return e;
};

/* ──────────────────────────────────────────────
   UTILITY
   ────────────────────────────────────────────── */
function num(v)   { return Number(v) || 0; }
function money(v) { return num(v).toLocaleString("en-IN"); }
function esc(v) {
  return String(v ?? "")
    .replace(/&/g,  "&amp;")
    .replace(/</g,  "&lt;")
    .replace(/>/g,  "&gt;")
    .replace(/"/g,  "&quot;")
    .replace(/'/g,  "&#039;");
}
function placeholder(text, size = 60) {
  return `https://placehold.co/${size}x${size}/0f172a/ffffff?text=${encodeURIComponent(String(text || "?").charAt(0).toUpperCase())}`;
}

/* ──────────────────────────────────────────────
   STATE
   ────────────────────────────────────────────── */
const state = {
  settings:       null,
  teams:          [],
  players:        [],
  feed:           [],
  prevPlayers:    new Map(),
  prevLiveId:     "",
  playersReady:   false,
  settingsReady:  false
};

let overlayTimer = null;

/* ──────────────────────────────────────────────
   TEAM STATS CALCULATOR
   ────────────────────────────────────────────── */
function calcStats(team) {
  const s          = state.settings || {};
  const basePrice  = num(s.basePrice);
  const teamPurse  = num(s.teamPurse);
  const maxSlots   = num(s.playersPerTeam);

  const bought = state.players
    .filter(p => p.status === "Sold" && p.soldToTeamId === team.id)
    .sort((a, b) => num(b.soldPrice) - num(a.soldPrice));

  const spent       = bought.reduce((t, p) => t + num(p.soldPrice), 0);
  const purseLeft   = Math.max(0, teamPurse - spent);
  const slotsFilled = bought.length;
  const slotsLeft   = Math.max(0, maxSlots - slotsFilled);
  const reserve     = Math.max(0, (slotsLeft - 1)) * basePrice;
  const maxBid      = Math.max(0, purseLeft - reserve);

  return { bought, spent, purseLeft, slotsFilled, slotsLeft, maxBid };
}

/* ──────────────────────────────────────────────
   FEED
   ────────────────────────────────────────────── */
function addFeed(html) {
  state.feed.unshift(html);
  if (state.feed.length > 40) state.feed.length = 40;
  renderFeed();
}

function renderFeed() {
  const ul = $("feedList");
  $("feedCountBadge").textContent = state.feed.length;

  if (!state.feed.length) {
    ul.innerHTML = `<li class="muted-li">Waiting for auction updates...</li>`;
    return;
  }
  ul.innerHTML = state.feed.map(item => `<li>${item}</li>`).join("");
}

/* ──────────────────────────────────────────────
   SUMMARY SCOREBOARD
   ────────────────────────────────────────────── */
function renderSummary() {
  const s = state.settings;

  if (!s) {
    $("headerTournament").textContent = "Tournament: Not set";
    $("liveBadge").textContent = "● OFFLINE";
    return;
  }

  const sold    = state.players.filter(p => p.status === "Sold").length;
  const unsold  = state.players.filter(p => p.status === "Unsold").length;
  const pending = state.players.filter(p => p.status === "Pending").length;

  $("headerTournament").textContent = `Tournament: ${s.tournamentName || "My Tournament"}`;
  $("liveBadge").textContent        = s.auctionEnded ? "● ENDED" : "● LIVE";
  $("sTeams").textContent           = num(s.numTeams);
  $("sPlayers").textContent         = num(s.numPlayers) || state.players.length;
  $("sPerTeam").textContent         = num(s.playersPerTeam);
  $("sBase").textContent            = money(s.basePrice);
  $("sPurse").textContent           = money(s.teamPurse);
  $("sRound").textContent           = num(s.currentRound || 1);
  $("sSold").textContent            = sold;
  $("sUnsold").textContent          = unsold;
  $("sPending").textContent         = pending;
  document.title                    = `${s.tournamentName || "Auction"} – Live`;
}

/* ──────────────────────────────────────────────
   TEAMS DASHBOARD
   ────────────────────────────────────────────── */
function renderTeams() {
  const wrap = $("teamsDashboard");
  $("teamCountBadge").textContent = state.teams.length;

  if (!state.teams.length) {
    wrap.innerHTML = `<div class="empty-note">No teams found.</div>`;
    return;
  }

  wrap.innerHTML = state.teams.map(team => {
    const st = calcStats(team);

    const logoSrc = team.logoUrl || placeholder(team.name, 80);

    const rosterHtml = st.bought.length
      ? st.bought.map(p => `
          <div class="mini-player">
            <img
              src="${esc(p.imageUrl || placeholder(p.name, 40))}"
              alt="${esc(p.name)}"
              onerror="this.src='${placeholder(p.name, 40)}'">
            <div>
              <div class="mini-player-name">${esc(p.name || "Player")}</div>
              <div class="mini-player-role">${esc(p.role || "")}</div>
            </div>
            <div class="mini-player-price">₹${money(p.soldPrice)}</div>
          </div>`).join("")
      : `<div class="empty-team">No players bought yet.</div>`;

    return `
      <div class="team-card">
        <div class="team-head">
          <img
            class="team-logo"
            src="${esc(logoSrc)}"
            alt="${esc(team.name)}"
            onerror="this.src='${placeholder(team.name, 80)}'">
          <div>
            <div class="team-name">${esc(team.name || "Team")}</div>
            <div class="team-sub">Spent: ₹${money(st.spent)}</div>
          </div>
        </div>

        <div class="team-metrics">
          <div class="metric green">
            <span class="v">₹${money(st.purseLeft)}</span>
            <span class="l">Purse Left</span>
          </div>
          <div class="metric blue">
            <span class="v">${st.slotsFilled}</span>
            <span class="l">Bought</span>
          </div>
          <div class="metric purple">
            <span class="v">${st.slotsLeft}</span>
            <span class="l">Remaining</span>
          </div>
          <div class="metric gold">
            <span class="v">₹${money(st.maxBid)}</span>
            <span class="l">Max Bid</span>
          </div>
        </div>

        <div class="roster-title">SQUAD (${st.slotsFilled})</div>
        <div class="team-roster">${rosterHtml}</div>
      </div>`;
  }).join("");
}

/* ──────────────────────────────────────────────
   CURRENT PLAYER
   ────────────────────────────────────────────── */
function renderCurrentPlayer() {
  const area   = $("currentPlayerArea");
  const badge  = $("currentBadge");
  const liveId = state.settings?.livePlayerId || "";
  const player = liveId ? state.players.find(p => p.id === liveId) : null;

  if (!player) {
    const pending = state.players.filter(p => p.status === "Pending").length;
    badge.textContent = state.settings?.auctionEnded ? "ENDED" : "AWAITING";
    area.innerHTML = `
      <div class="player-placeholder-big">👤</div>
      <h3 class="player-name-big">No Player Loaded</h3>
      <p class="player-desc">${pending ? `${pending} player(s) pending` : "Waiting for admin to load next player."}</p>`;
    return;
  }

  const reauction = num(player.reauctionCount) > 0;
  badge.textContent = reauction ? "RE-AUCTION" : "BIDDING LIVE";

  const imgSrc  = player.imageUrl || placeholder(player.name, 150);
  const base    = player.basePrice || state.settings?.basePrice || 0;

  area.innerHTML = `
    <img
      class="player-big-img"
      src="${esc(imgSrc)}"
      alt="${esc(player.name)}"
      onerror="this.src='${placeholder(player.name, 150)}'">
    <h3 class="player-name-big">${esc(player.name || "Player")}</h3>
    <div class="player-tags">
      <span class="player-tag">🏏 ${esc(player.batting  || "N/A")}</span>
      <span class="player-tag">🎯 ${esc(player.bowling  || "N/A")}</span>
      <span class="player-tag">⭐ ${esc(player.role     || "N/A")}</span>
      <span class="player-tag">Round ${num(player.auctionRound || 1)}</span>
      ${reauction ? `<span class="player-tag">♻️ Re-auction #${num(player.reauctionCount)}</span>` : ""}
    </div>
    <div class="player-price-badge">Base Price: ₹${money(base)}</div>`;
}

/* ──────────────────────────────────────────────
   PLAYERS TABLE
   ────────────────────────────────────────────── */
function renderPlayersTable() {
  const tbody = $("playersTableBody");
  $("playerTableBadge").textContent = state.players.length;

  if (!state.players.length) {
    tbody.innerHTML = `<tr><td colspan="10" class="muted-li" style="text-align:center;padding:18px;">No players found.</td></tr>`;
    return;
  }

  const sorted = [...state.players].sort((a, b) => num(a.auctionOrder) - num(b.auctionOrder));

  tbody.innerHTML = sorted.map((p, idx) => {
    const status     = p.status || "Pending";
    const chipClass  = status === "Sold" ? "chip-sold" : status === "Unsold" ? "chip-unsold" : "chip-pending";
    const imgSrc     = p.imageUrl || placeholder(p.name, 40);
    const priceText  = status === "Sold" ? `₹${money(p.soldPrice)}` : "–";
    const teamText   = p.soldToTeamName || "–";

    return `
      <tr>
        <td>${idx + 1}</td>
        <td><img class="thumb-sm" src="${esc(imgSrc)}" alt="${esc(p.name)}" onerror="this.src='${placeholder(p.name, 40)}'"></td>
        <td><strong>${esc(p.name || "Player")}</strong></td>
        <td>${esc(p.batting  || "–")}</td>
        <td>${esc(p.bowling  || "–")}</td>
        <td>${esc(p.role     || "–")}</td>
        <td>${esc(teamText)}</td>
        <td style="color:#fbbf24;font-weight:700;">${priceText}</td>
        <td><span class="chip ${chipClass}">${esc(status)}</span></td>
        <td>${num(p.auctionRound || 1)}</td>
      </tr>`;
  }).join("");
}

/* ──────────────────────────────────────────────
   CONFETTI (SOLD ONLY)
   ────────────────────────────────────────────── */
const CONFETTI_COLORS = [
  "#22c55e","#16a34a","#fbbf24","#f59e0b",
  "#86efac","#4ade80","#fde68a","#ffffff"
];

function launchConfetti() {
  const wrap = $("confettiWrap");
  wrap.innerHTML = "";

  for (let i = 0; i < 60; i++) {
    const piece = document.createElement("div");
    piece.className = "confetti-piece";
    piece.style.cssText = `
      left:${Math.random() * 100}%;
      background:${CONFETTI_COLORS[Math.floor(Math.random() * CONFETTI_COLORS.length)]};
      width:${6 + Math.random() * 6}px;
      height:${10 + Math.random() * 8}px;
      border-radius:${Math.random() > 0.5 ? "50%" : "2px"};
      animation-duration:${2.2 + Math.random() * 1.6}s;
      animation-delay:${Math.random() * 0.6}s;
      opacity:1;
    `;
    wrap.appendChild(piece);
  }

  setTimeout(() => { wrap.innerHTML = ""; }, 4000);
}

/* ──────────────────────────────────────────────
   SOLD / UNSOLD ANIMATION
   ────────────────────────────────────────────── */
function showOverlay(type, player) {
  clearTimeout(overlayTimer);

  const overlay  = $("resultOverlay");
  const badge    = $("overlayBadge");
  const nameEl   = $("overlayPlayer");
  const metaEl   = $("overlayMeta");

  overlay.classList.remove("show", "sold", "unsold");

  if (type === "Sold") {
    overlay.classList.add("sold");
    badge.textContent = "✅ SOLD";
    nameEl.textContent = player.name || "Player";
    metaEl.textContent = `${player.soldToTeamName || "Team"}  •  ₹ ${money(player.soldPrice)}`;
    launchConfetti();
  } else {
    overlay.classList.add("unsold");
    badge.textContent  = "❌ UNSOLD";
    nameEl.textContent = player.name || "Player";
    metaEl.textContent = "No winning bid";
    $("confettiWrap").innerHTML = "";
  }

  // Force reflow so CSS transition fires
  void overlay.offsetWidth;
  overlay.classList.add("show");

  overlayTimer = setTimeout(() => {
    overlay.classList.remove("show");
  }, 3000);
}

/* ──────────────────────────────────────────────
   SETTINGS CHANGE HANDLER
   ────────────────────────────────────────────── */
function onSettingsChange(newSettings) {
  const prevLiveId = state.prevLiveId;
  const nextLiveId = newSettings?.livePlayerId || "";

  state.settings = newSettings;

  renderSummary();
  renderCurrentPlayer();
  renderTeams();

  if (state.settingsReady && nextLiveId && nextLiveId !== prevLiveId) {
    const p = state.players.find(pl => pl.id === nextLiveId);
    if (p) addFeed(`🎯 Now on block: <strong>${esc(p.name)}</strong>`);
  }

  state.prevLiveId    = nextLiveId;
  state.settingsReady = true;
}

/* ──────────────────────────────────────────────
   PLAYERS CHANGE HANDLER
   ────────────────────────────────────────────── */
function onPlayersChange(newPlayers) {
  const prevMap = state.prevPlayers;

  if (state.playersReady) {
    for (const p of newPlayers) {
      const prev = prevMap.get(p.id);
      if (!prev) continue;

      // Status changed
      if (prev.status !== p.status) {
        if (p.status === "Sold") {
          addFeed(`✅ <strong>${esc(p.name)}</strong> → <strong>${esc(p.soldToTeamName || "Team")}</strong> for ₹${money(p.soldPrice)}`);
          showOverlay("Sold", p);
        } else if (p.status === "Unsold") {
          addFeed(`❌ <strong>${esc(p.name)}</strong> went unsold`);
          showOverlay("Unsold", p);
        } else if (p.status === "Pending" && prev.status === "Unsold") {
          addFeed(`♻️ <strong>${esc(p.name)}</strong> moved to re-auction`);
        }
      }

      // Round changed
      if (num(p.auctionRound) > num(prev.auctionRound)) {
        addFeed(`🔄 <strong>${esc(p.name)}</strong> → Round ${num(p.auctionRound)}`);
      }
    }
  }

  state.players     = newPlayers;
  state.prevPlayers = new Map(newPlayers.map(p => [p.id, { ...p }]));
  state.playersReady = true;

  renderSummary();
  renderTeams();
  renderCurrentPlayer();
  renderPlayersTable();
}

/* ──────────────────────────────────────────────
   TEAMS CHANGE HANDLER
   ────────────────────────────────────────────── */
function onTeamsChange(newTeams) {
  state.teams = newTeams;
  renderTeams();
}

/* ──────────────────────────────────────────────
   BOOT — START ALL LISTENERS
   ────────────────────────────────────────────── */
function boot() {
  // Settings listener
  onSnapshot(
    doc(db, "auction_meta", "settings"),
    snap => onSettingsChange(snap.exists() ? snap.data() : null),
    err  => console.error("Settings error:", err)
  );

  // Teams listener
  onSnapshot(
    collection(db, "teams"),
    snap => onTeamsChange(snap.docs.map(d => ({ id: d.id, ...d.data() }))),
    err  => console.error("Teams error:", err)
  );

  // Players listener
  onSnapshot(
    collection(db, "players"),
    snap => onPlayersChange(snap.docs.map(d => ({ id: d.id, ...d.data() }))),
    err  => console.error("Players error:", err)
  );
}

boot();
