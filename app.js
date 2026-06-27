import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import {
  getFirestore,
  doc,
  collection,
  onSnapshot
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

const firebaseConfig = {
  apiKey: "AIzaSyCWvHbZghVZu9aDUO-sHroxOiN0WXZ3AgI",
  authDomain: "cricketauction-df77b.firebaseapp.com",
  databaseURL: "https://cricketauction-df77b-default-rtdb.firebaseio.com",
  projectId: "cricketauction-df77b",
  storageBucket: "cricketauction-df77b.firebasestorage.app",
  messagingSenderId: "1052181366792",
  appId: "1:1052181366792:web:c86af556248567e9f5e9bd",
  measurementId: "G-BF00NXYJJ9"
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

const SETTINGS_REF = doc(db, "auction_meta", "settings");
const TEAMS_COL = collection(db, "teams");
const PLAYERS_COL = collection(db, "players");

const $ = (id) => document.getElementById(id);

const state = {
  settings: null,
  teams: [],
  players: [],
  feed: [],
  previousPlayers: new Map(),
  previousLivePlayerId: "",
  playersLoadedOnce: false,
  settingsLoadedOnce: false
};

let overlayTimer = null;

function placeholderImg(text = "?", size = 60) {
  return `https://placehold.co/${size}x${size}/0f172a/ffffff?text=${encodeURIComponent(text)}`;
}

function num(value) {
  return Number(value || 0);
}

function money(value) {
  return num(value).toLocaleString("en-IN");
}

function byAuctionOrder(a, b) {
  return num(a.auctionOrder) - num(b.auctionOrder);
}

function getTeamStats(team) {
  const settings = state.settings || {};
  const basePrice = num(settings.basePrice);
  const teamPurse = num(settings.teamPurse);
  const playersPerTeam = num(settings.playersPerTeam);

  const bought = state.players
    .filter((p) => p.status === "Sold" && p.soldToTeamId === team.id)
    .sort((a, b) => num(b.soldPrice) - num(a.soldPrice));

  const spent = bought.reduce((sum, p) => sum + num(p.soldPrice), 0);
  const purseLeft = Math.max(0, teamPurse - spent);
  const playersBought = bought.length;
  const remainingPlayers = Math.max(0, playersPerTeam - playersBought);
  const reserveNeeded = Math.max(0, remainingPlayers - 1) * basePrice;
  const maxBid = Math.max(0, purseLeft - reserveNeeded);

  return {
    bought,
    spent,
    purseLeft,
    playersBought,
    remainingPlayers,
    maxBid
  };
}

function pushFeed(text) {
  state.feed.unshift(text);
  state.feed = state.feed.slice(0, 30);
  renderFeed();
}

function renderFeed() {
  const list = $("feedList");
  $("feedCountBadge").textContent = String(state.feed.length);

  if (!state.feed.length) {
    list.innerHTML = `<li class="muted-li">Waiting for auction updates...</li>`;
    return;
  }

  list.innerHTML = state.feed.map((item) => `<li>${item}</li>`).join("");
}

function renderSummary() {
  const s = state.settings;

  if (!s) {
    $("headerTournament").textContent = "Tournament: Not set";
    $("liveBadge").textContent = "● OFFLINE";
    return;
  }

  const sold = state.players.filter((p) => p.status === "Sold").length;
  const unsold = state.players.filter((p) => p.status === "Unsold").length;
  const pending = state.players.filter((p) => p.status === "Pending").length;

  $("headerTournament").textContent = `Tournament: ${s.tournamentName || "My Tournament"}`;
  $("liveBadge").textContent = s.auctionEnded ? "● AUCTION ENDED" : "● LIVE";
  $("sTeams").textContent = num(s.numTeams);
  $("sPlayers").textContent = num(s.numPlayers) || state.players.length;
  $("sPerTeam").textContent = num(s.playersPerTeam);
  $("sBase").textContent = money(s.basePrice);
  $("sPurse").textContent = money(s.teamPurse);
  $("sRound").textContent = num(s.currentRound || 1);
  $("sSold").textContent = sold;
  $("sUnsold").textContent = unsold;
  $("sPending").textContent = pending;

  document.title = `${s.tournamentName || "Auction Viewer"} - Live Viewer`;
}

function renderTeamsDashboard() {
  const wrap = $("teamsDashboard");
  $("teamCountBadge").textContent = `${state.teams.length} teams`;

  if (!state.teams.length) {
    wrap.innerHTML = `<p class="empty-note">No teams found.</p>`;
    return;
  }

  wrap.innerHTML = state.teams.map((team) => {
    const stats = getTeamStats(team);

    const playersHtml = stats.bought.length
      ? stats.bought.map((player) => `
          <div class="mini-player">
            <img src="${player.imageUrl || placeholderImg(player.name?.[0] || "P", 50)}" alt="${escapeHtml(player.name || "Player")}">
            <div class="mini-player-main">
              <div class="mini-player-name">${escapeHtml(player.name || "Player")}</div>
              <div class="mini-player-role">${escapeHtml(player.role || "Player")}</div>
            </div>
            <div class="mini-player-price">₹ ${money(player.soldPrice)}</div>
          </div>
        `).join("")
      : `<div class="empty-team">No players bought yet.</div>`;

    return `
      <div class="team-card">
        <div class="team-head">
          <img class="team-logo" src="${team.logoUrl || placeholderImg(team.name?.[0] || "T", 80)}" alt="${escapeHtml(team.name || "Team")}">
          <div class="team-name-wrap">
            <div class="team-name">${escapeHtml(team.name || "Team")}</div>
            <div class="team-sub">Spent: ₹ ${money(stats.spent)}</div>
          </div>
        </div>

        <div class="team-metrics">
          <div class="metric-box green">
            <span class="v">₹ ${money(stats.purseLeft)}</span>
            <span class="l">Purse Left</span>
          </div>
          <div class="metric-box blue">
            <span class="v">${stats.playersBought}</span>
            <span class="l">Players Bought</span>
          </div>
          <div class="metric-box purple">
            <span class="v">${stats.remainingPlayers}</span>
            <span class="l">Remaining</span>
          </div>
          <div class="metric-box yellow">
            <span class="v">₹ ${money(stats.maxBid)}</span>
            <span class="l">Max Bid</span>
          </div>
        </div>

        <div class="roster-title">Squad</div>
        <div class="team-roster">${playersHtml}</div>
      </div>
    `;
  }).join("");
}

function renderCurrentPlayer() {
  const wrap = $("currentPlayerArea");
  const liveId = state.settings?.livePlayerId || "";
  const player = state.players.find((p) => p.id === liveId);

  if (!player) {
    const pending = state.players.filter((p) => p.status === "Pending").length;
    $("currentBadge").textContent = state.settings?.auctionEnded ? "Ended" : "Awaiting";
    wrap.innerHTML = `
      <div class="player-placeholder">👤</div>
      <h3 class="player-big-name">No Player Loaded</h3>
      <p class="desc">${pending ? `Pending players: ${pending}` : "Waiting for admin to load next player."}</p>
    `;
    return;
  }

  const badge = num(player.reauctionCount) > 0 ? "Re-Auction Live" : "Bidding Live";
  $("currentBadge").textContent = badge;

  wrap.innerHTML = `
    ${player.imageUrl
      ? `<img class="player-big-img" src="${player.imageUrl}" alt="${escapeHtml(player.name || "Player")}">`
      : `<div class="player-placeholder">👤</div>`
    }

    <h3 class="player-big-name">${escapeHtml(player.name || "Player")}</h3>

    <div class="player-tags">
      <span class="player-tag">🏏 ${escapeHtml(player.batting || "N/A")}</span>
      <span class="player-tag">🎯 ${escapeHtml(player.bowling || "N/A")}</span>
      <span class="player-tag">⭐ ${escapeHtml(player.role || "N/A")}</span>
      <span class="player-tag">Round ${num(player.auctionRound || 1)}</span>
    </div>

    <div class="player-price">Base Price: ₹ ${money(player.basePrice || state.settings?.basePrice)}</div>
  `;
}

function renderPlayersTable() {
  const tbody = $("playersTableBody");
  $("playerTableBadge").textContent = String(state.players.length);

  if (!state.players.length) {
    tbody.innerHTML = `<tr><td colspan="10" class="muted-li" style="text-align:center;">No players found.</td></tr>`;
    return;
  }

  const sorted = [...state.players].sort(byAuctionOrder);

  tbody.innerHTML = sorted.map((player, index) => {
    const status = player.status || "Pending";
    const statusClass =
      status === "Sold"
        ? "status-sold"
        : status === "Unsold"
        ? "status-unsold"
        : "status-pending";

    return `
      <tr>
        <td>${index + 1}</td>
        <td>
          <img class="thumb-sm" src="${player.imageUrl || placeholderImg(player.name?.[0] || "P", 50)}" alt="${escapeHtml(player.name || "Player")}">
        </td>
        <td><strong>${escapeHtml(player.name || "Player")}</strong></td>
        <td>${escapeHtml(player.batting || "-")}</td>
        <td>${escapeHtml(player.bowling || "-")}</td>
        <td>${escapeHtml(player.role || "-")}</td>
        <td>${escapeHtml(player.soldToTeamName || "-")}</td>
        <td>${status === "Sold" ? `₹ ${money(player.soldPrice)}` : "-"}</td>
        <td><span class="status-chip ${statusClass}">${escapeHtml(status)}</span></td>
        <td>${num(player.auctionRound || 1)}</td>
      </tr>
    `;
  }).join("");
}

function showResultAnimation(type, player) {
  const overlay = $("resultOverlay");
  const statusEl = $("overlayStatus");
  const playerEl = $("overlayPlayerName");
  const metaEl = $("overlayMeta");

  clearTimeout(overlayTimer);

  overlay.classList.remove("sold", "unsold", "show");

  if (type === "Sold") {
    overlay.classList.add("sold");
    statusEl.textContent = "SOLD";
    metaEl.textContent = `${player.soldToTeamName || "Team"} • ₹ ${money(player.soldPrice)}`;
  } else {
    overlay.classList.add("unsold");
    statusEl.textContent = "UNSOLD";
    metaEl.textContent = "No winning bid";
  }

  playerEl.textContent = player.name || "Player";

  void overlay.offsetWidth;
  overlay.classList.add("show");

  overlayTimer = setTimeout(() => {
    overlay.classList.remove("show");
  }, 2400);
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function handleSettingsChange(newSettings) {
  const prevLiveId = state.previousLivePlayerId;
  const nextLiveId = newSettings?.livePlayerId || "";

  state.settings = newSettings;
  renderSummary();
  renderCurrentPlayer();
  renderTeamsDashboard();

  if (state.settingsLoadedOnce && nextLiveId && nextLiveId !== prevLiveId) {
    const player = state.players.find((p) => p.id === nextLiveId);
    if (player) {
      pushFeed(`🎯 Live now: <strong>${escapeHtml(player.name)}</strong>`);
    }
  }

  state.previousLivePlayerId = nextLiveId;
  state.settingsLoadedOnce = true;
}

function handlePlayersChange(newPlayers) {
  const nextMap = new Map(newPlayers.map((p) => [p.id, p]));
  const prevMap = state.previousPlayers;

  if (state.playersLoadedOnce) {
    for (const player of newPlayers) {
      const prev = prevMap.get(player.id);
      if (!prev) continue;

      if (prev.status !== player.status) {
        if (player.status === "Sold") {
          pushFeed(`✅ <strong>${escapeHtml(player.name)}</strong> sold to <strong>${escapeHtml(player.soldToTeamName || "Team")}</strong> for <strong>₹ ${money(player.soldPrice)}</strong>`);
          showResultAnimation("Sold", player);
        } else if (player.status === "Unsold") {
          pushFeed(`❌ <strong>${escapeHtml(player.name)}</strong> went unsold`);
          showResultAnimation("Unsold", player);
        } else if (player.status === "Pending" && prev.status === "Unsold") {
          pushFeed(`♻️ <strong>${escapeHtml(player.name)}</strong> moved to re-auction`);
        }
      }

      if (
        prev.auctionRound !== player.auctionRound &&
        num(player.auctionRound) > num(prev.auctionRound)
      ) {
        pushFeed(`🔄 <strong>${escapeHtml(player.name)}</strong> moved to round ${num(player.auctionRound)}`);
      }
    }
  }

  state.players = newPlayers;
  state.previousPlayers = nextMap;
  state.playersLoadedOnce = true;

  renderSummary();
  renderTeamsDashboard();
  renderCurrentPlayer();
  renderPlayersTable();
}

function handleTeamsChange(newTeams) {
  state.teams = newTeams;
  renderTeamsDashboard();
}

function boot() {
  onSnapshot(SETTINGS_REF, (snap) => {
    const settings = snap.exists() ? snap.data() : null;
    handleSettingsChange(settings);
  });

  onSnapshot(TEAMS_COL, (snap) => {
    const teams = snap.docs.map((docSnap) => ({
      id: docSnap.id,
      ...docSnap.data()
    }));
    handleTeamsChange(teams);
  });

  onSnapshot(PLAYERS_COL, (snap) => {
    const players = snap.docs.map((docSnap) => ({
      id: docSnap.id,
      ...docSnap.data()
    }));
    handlePlayersChange(players);
  });
}

boot();
