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
const teamsCol = collection(db, "teams");
const playersCol = collection(db, "players");

const state = {
  settings: null,
  teams: [],
  players: [],
  feed: [],
  prevLiveId: "",
  prevStatusMap: new Map()
};

const $ = id => document.getElementById(id);

function placeholderImg(text = "?") {
  return `https://placehold.co/100x100/0f172a/ffffff?text=${encodeURIComponent(text || "?")}`;
}

function money(value) {
  return Number(value || 0).toLocaleString("en-IN");
}

function getTeamStats(team) {
  const s = state.settings || {};
  const bought = state.players.filter(p => p.status === "Sold" && p.soldToTeamId === team.id);
  const spent = bought.reduce((sum, p) => sum + Number(p.soldPrice || 0), 0);
  const teamPurse = Number(s.teamPurse || team.purse || 0);
  const playersPerTeam = Number(s.playersPerTeam || 0);
  const basePrice = Number(s.basePrice || 0);
  const slotsFilled = bought.length;
  const slotsLeft = Math.max(0, playersPerTeam - slotsFilled);
  const purseLeft = Math.max(0, teamPurse - spent);
  const reserveNeeded = Math.max(0, slotsLeft - 1) * basePrice;
  const maxBid = Math.max(0, purseLeft - reserveNeeded);

  return { bought, spent, purseLeft, slotsFilled, slotsLeft, maxBid };
}

function pushFeed(text) {
  state.feed.unshift({ text, time: new Date() });
  state.feed = state.feed.slice(0, 50);
  renderFeed();
}

function renderSummary() {
  const s = state.settings || {};
  const sold = state.players.filter(p => p.status === "Sold").length;
  const unsold = state.players.filter(p => p.status === "Unsold").length;
  const pending = state.players.filter(p => !p.status || p.status === "Pending").length;

  $("headerTournament").textContent = `Tournament: ${s.tournamentName || "Not set"}`;
  $("sTeams").textContent = s.numTeams || state.teams.length || 0;
  $("sPlayers").textContent = s.numPlayers || state.players.length || 0;
  $("sPerTeam").textContent = s.playersPerTeam || 0;
  $("sBase").textContent = money(s.basePrice);
  $("sPurse").textContent = money(s.teamPurse);
  $("sRound").textContent = s.currentRound || 1;
  $("sSold").textContent = sold;
  $("sUnsold").textContent = unsold;
  $("sPending").textContent = pending;

  if (s.auctionEnded) {
    $("liveBadge").textContent = "● COMPLETE";
    $("liveBadge").className = "live-badge complete";
  } else if (state.settings) {
    $("liveBadge").textContent = "● LIVE";
    $("liveBadge").className = "live-badge online";
  }

  document.title = `${s.tournamentName || "Auction"} - Live Viewer`;
}

function renderCurrentPlayer() {
  const liveId = state.settings?.livePlayerId || "";
  const player = state.players.find(p => p.id === liveId);
  const wrap = $("currentPlayerArea");

  if (!player) {
    wrap.innerHTML = `
      <div class="player-placeholder">👤</div>
      <h3>No Player Loaded</h3>
      <p>${state.settings?.auctionEnded ? "Auction complete." : "Waiting for admin to load next player."}</p>
    `;
    $("currentBadge").textContent = state.settings?.auctionEnded ? "Complete" : "Awaiting";
    return;
  }

  const image = player.imageUrl
    ? `<img class="player-big-img" src="${player.imageUrl}" alt="${player.name}">`
    : `<div class="player-placeholder">👤</div>`;

  wrap.innerHTML = `
    ${image}
    <div class="base-badge">Base Price: ${money(player.basePrice || state.settings?.basePrice)}</div>
    <h3>${player.name}</h3>
    <div class="tag-row">
      <span>${player.role || "Player"}</span>
      <span>${player.batting || "Batting -"}</span>
      <span>${player.bowling || "Bowling -"}</span>
      <span>Round ${player.auctionRound || state.settings?.currentRound || 1}</span>
    </div>
  `;

  $("currentBadge").textContent = Number(player.reauctionCount || 0) > 0 ? "Re-Auction" : "Live";
}

function renderTeams() {
  const wrap = $("teamsDashboard");
  $("teamCountBadge").textContent = state.teams.length;

  if (!state.teams.length) {
    wrap.innerHTML = `<p class="empty">No teams found.</p>`;
    return;
  }

  wrap.innerHTML = state.teams.map(team => {
    const stats = getTeamStats(team);
    const logo = team.logoUrl || placeholderImg(team.name?.[0] || "T");
    const roster = stats.bought.length
      ? stats.bought.map(p => `
          <div class="mini-player">
            <img src="${p.imageUrl || placeholderImg(p.name?.[0] || "P")}" alt="${p.name}">
            <span>${p.name}</span>
            <strong>${money(p.soldPrice)}</strong>
          </div>
        `).join("")
      : `<p class="empty small">No players yet</p>`;

    return `
      <article class="team-card">
        <div class="team-head">
          <img class="team-logo" src="${logo}" alt="${team.name}">
          <div>
            <h3>${team.name || "Team"}</h3>
            <p>${stats.slotsFilled}/${state.settings?.playersPerTeam || 0} players</p>
          </div>
        </div>
        <div class="team-metrics">
          <div><span>Purse Left</span><strong>${money(stats.purseLeft)}</strong></div>
          <div><span>Max Bid</span><strong>${money(stats.maxBid)}</strong></div>
          <div><span>Spent</span><strong>${money(stats.spent)}</strong></div>
          <div><span>Slots Left</span><strong>${stats.slotsLeft}</strong></div>
        </div>
        <div class="team-roster">${roster}</div>
      </article>
    `;
  }).join("");
}

function statusClass(status) {
  if (status === "Sold") return "sold";
  if (status === "Unsold") return "unsold";
  return "pending";
}

function renderPlayers() {
  const wrap = $("playersList");
  $("playerTableBadge").textContent = state.players.length;

  if (!state.players.length) {
    wrap.innerHTML = `<p class="empty">No players found.</p>`;
    return;
  }

  const sorted = [...state.players].sort((a, b) => Number(a.auctionOrder || 0) - Number(b.auctionOrder || 0));

  wrap.innerHTML = sorted.map((p, index) => `
    <article class="player-row">
      <span class="player-index">${index + 1}</span>
      <img src="${p.imageUrl || placeholderImg(p.name?.[0] || "P")}" alt="${p.name}">
      <div class="player-info">
        <h3>${p.name || "Player"}</h3>
        <p>${p.role || "-"} • ${p.batting || "-"} • ${p.bowling || "-"}</p>
      </div>
      <div class="player-result">
        <span class="status ${statusClass(p.status)}">${p.status || "Pending"}</span>
        <strong>${p.soldToTeamName || "—"}</strong>
        <small>${p.soldPrice ? money(p.soldPrice) : `Round ${p.auctionRound || 1}`}</small>
      </div>
    </article>
  `).join("");
}

function renderFeed() {
  const list = $("feedList");
  $("feedCountBadge").textContent = state.feed.length;

  if (!state.feed.length) {
    list.innerHTML = `<li class="empty">Waiting for updates...</li>`;
    return;
  }

  list.innerHTML = state.feed.map(item => `
    <li>
      <span>${item.text}</span>
      <small>${item.time.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</small>
    </li>
  `).join("");
}

function showResult(player) {
  if (!player || player.status !== "Sold") return;

  $("oBadge").textContent = "SOLD";
  $("oName").textContent = player.name || "Player";
  $("oMeta").textContent = `${player.soldToTeamName || "Team"} • ${money(player.soldPrice)}`;

  $("resultOverlay").classList.add("show");
  window.setTimeout(() => $("resultOverlay").classList.remove("show"), 2600);
}

function detectChanges(players) {
  players.forEach(player => {
    const oldStatus = state.prevStatusMap.get(player.id);
    const newStatus = player.status || "Pending";

    if (newStatus === "Sold" && oldStatus !== "Sold") {
      pushFeed(`✅ ${player.name} sold to ${player.soldToTeamName} for ${money(player.soldPrice)}`);
      showResult(player);
    }

    if (newStatus === "Unsold" && oldStatus !== "Unsold") {
      pushFeed(`❌ ${player.name} marked unsold`);
    }
  });

  state.prevStatusMap = new Map(players.map(p => [p.id, p.status || "Pending"]));
}

function renderAll() {
  renderSummary();
  renderCurrentPlayer();
  renderTeams();
  renderPlayers();
  renderFeed();
}

function setupTabs() {
  document.querySelectorAll(".tab-btn").forEach(btn => {
    btn.addEventListener("click", () => {
      const target = document.querySelector(`.${btn.dataset.target}`);
      if (!target) return;

      document.querySelectorAll(".tab-btn").forEach(b => b.classList.remove("active"));
      btn.classList.add("active");
      target.scrollIntoView({ behavior: "smooth", block: "start" });
    });
  });
}

onSnapshot(SETTINGS_REF, snap => {
  state.settings = snap.exists() ? snap.data() : null;

  const liveId = state.settings?.livePlayerId || "";
  if (liveId && liveId !== state.prevLiveId) {
    const player = state.players.find(p => p.id === liveId);
    if (player) pushFeed(`🎯 Now on the block: ${player.name}`);
  }

  state.prevLiveId = liveId;
  renderAll();
}, err => {
  console.error(err);
  $("liveBadge").textContent = "● ERROR";
  $("liveBadge").className = "live-badge";
});

onSnapshot(teamsCol, snap => {
  state.teams = snap.docs.map(d => ({ id: d.id, ...d.data() }));
  renderAll();
});

onSnapshot(playersCol, snap => {
  const players = snap.docs.map(d => ({ id: d.id, ...d.data() }));
  detectChanges(players);
  state.players = players;
  renderAll();
});

setupTabs();