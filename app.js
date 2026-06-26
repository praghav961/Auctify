import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import { getFirestore, doc, collection, onSnapshot } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

// USE YOUR FIREBASE CONFIG HERE
// For Firebase JS SDK v7.20.0 and later, measurementId is optional
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

const $ = id => document.getElementById(id);

let state = { settings: null, teams: [], players: [] };

// REAL-TIME SYNC
function startSync() {
  // Sync Settings
  onSnapshot(doc(db, "auction_meta", "settings"), (snap) => {
    state.settings = snap.data();
    renderSummary();
    renderCurrentPlayer();
  });

  // Sync Teams
  onSnapshot(collection(db, "teams"), (snap) => {
    state.teams = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    renderTeams();
  });

  // Sync Players
  onSnapshot(collection(db, "players"), (snap) => {
    state.players = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    renderPlayersTable();
    renderCurrentPlayer();
  });
}

function renderSummary() {
  const s = state.settings;
  if (!s) return;
  $("headerTournament").textContent = `Tournament: ${s.tournamentName}`;
  $("sBase").textContent = s.basePrice;
  $("sPurse").textContent = s.teamPurse;
  $("sRound").textContent = s.currentRound || 1;
  $("sPlayers").textContent = state.players.length;
}

function renderTeams() {
  const container = $("teamsDashboard");
  $("teamCountBadge").textContent = state.teams.length;
  
  container.innerHTML = state.teams.map(team => {
    const bought = state.players.filter(p => p.soldToTeamId === team.id);
    const spent = bought.reduce((sum, p) => sum + Number(p.soldPrice || 0), 0);
    const purseLeft = Number(state.settings?.teamPurse || 0) - spent;

    return `
      <div class="team-card-viewer">
        <div style="display:flex; align-items:center; gap:10px;">
          <img src="${team.logoUrl || 'https://placehold.co/30'}" style="width:30px;height:30px;border-radius:50%">
          <strong style="font-size:14px;">${team.name}</strong>
        </div>
        <div class="tm-row">
          <div class="tm-stat">Purse Left<b>${purseLeft}</b></div>
          <div class="tm-stat">Players<b>${bought.length}</b></div>
        </div>
      </div>
    `;
  }).join("");
}

function renderCurrentPlayer() {
  const playerArea = $("currentPlayerArea");
  const liveId = state.settings?.livePlayerId;
  const player = state.players.find(p => p.id === liveId);

  if (!player) {
    playerArea.innerHTML = `<div class="player-placeholder">👤</div><h3>Awaiting Next Player...</h3>`;
    $("currentBadge").textContent = "Idle";
    return;
  }

  $("currentBadge").textContent = "BIDDING LIVE";
  playerArea.innerHTML = `
    <img src="${player.imageUrl || 'https://placehold.co/150'}" class="player-big-img">
    <h3 class="player-big-name">${player.name}</h3>
    <p style="color:#9ca3af; margin-bottom:10px;">${player.role} | ${player.batting} | ${player.bowling}</p>
    <div style="font-size:24px; color:#fbbf24; font-weight:bold;">Base Price: ${player.basePrice}</div>
  `;
}

function renderPlayersTable() {
  const tbody = $("playersTableBody");
  const sorted = [...state.players].sort((a,b) => (b.soldPrice || 0) - (a.soldPrice || 0));

  tbody.innerHTML = sorted.map(p => `
    <tr>
      <td><img src="${p.imageUrl || 'https://placehold.co/35'}" class="thumb-sm"></td>
      <td><b>${p.name}</b></td>
      <td>${p.role}</td>
      <td style="color:${p.status === 'Sold' ? '#4ade80' : p.status === 'Unsold' ? '#fca5a5' : '#60a5fa'}">
        ${p.status}
      </td>
      <td>${p.soldToTeamName || '-'}</td>
      <td style="font-weight:bold; color:#fbbf24;">${p.soldPrice || '-'}</td>
    </tr>
  `).join("");
}

startSync();
