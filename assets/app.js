import {
  loadState, saveState, exportState, importState, createProfile, removeProfile,
  getActiveProfile, getProfileData, uid, putMedia, getMedia, listMedia, deleteMedia
} from './storage.js';

const app = document.querySelector('#app');
const toastRoot = document.querySelector('#toast-root');
let state = loadState();
let backendOnline = false;
let timer = { running: false, startedAt: null, elapsed: 0, interval: null, gameId: '' };
let ui = { libraryTab: 'owned', mediaFilter: 'all', releaseMonth: new Date(), sidebarOpen: false };
let modalSubmit = null;

const NAV = [
  ['dashboard', '⌂', 'Dashboard'], ['library', '▦', 'Game Library'], ['backlog', '☷', 'Backlog'],
  ['timer', '◷', 'Session Timer'], ['goals', '◎', 'Achievement Goals'], ['notes', '✎', 'Notes & Strategies'],
  ['media', '▣', 'Clips & Screenshots'], ['ai', '✦', 'AI Strategy Chat'], ['batteries', '⚡', 'Controller Batteries'],
  ['releases', '◫', 'Release Calendar'], ['guides', '↗', 'Game Guides'], ['training', '◉', 'AI Game Lab'],
  ['profiles', '♙', 'Profiles'], ['settings', '⚙', 'Settings']
];

const PAGE_META = {
  dashboard: ['Main Dashboard', 'Everything important across the active gaming profile.'],
  library: ['Game Library', 'Owned games, played games, this month’s releases, and upcoming Switch 2 titles.'],
  backlog: ['Backlog & Completion', 'Move games from backlog to active play, completed, or paused.'],
  timer: ['Session Timer', 'Track focused gaming sessions and total play time.'],
  goals: ['Achievement Goals', 'Create measurable goals and record progress for every game.'],
  notes: ['Notes & Strategies', 'Keep builds, routes, boss notes, discoveries, and reminders.'],
  media: ['Clip & Screenshot Organizer', 'Store, tag, preview, and organize local gaming media.'],
  ai: ['AI Strategy Chat', 'Ask a game-aware coach that can use your local notes and learned knowledge.'],
  batteries: ['Controller Battery Reminders', 'Track both controllers and receive low-battery warnings.'],
  releases: ['Release Calendar', 'Maintain a profile-specific calendar of releases you care about.'],
  guides: ['Game Guide Links', 'Keep official pages, wikis, walkthroughs, maps, and build tools together.'],
  training: ['AI Game Intelligence Lab', 'Turn gameplay recordings into an accumulating knowledge base for each game.'],
  profiles: ['Player Profiles', 'Keep your library, history, goals, and coaching data separate from your son’s.'],
  settings: ['Settings & Data', 'Configure the local companion, export backups, and control privacy.']
};

const esc = (value = '') => String(value).replace(/[&<>'"]/g, char => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', "'":'&#39;', '"':'&quot;' }[char]));
const fmtDate = value => value ? new Intl.DateTimeFormat(undefined, { month:'short', day:'numeric', year:'numeric' }).format(new Date(value)) : '—';
const fmtTime = seconds => {
  const total = Math.max(0, Math.floor(seconds));
  const h = Math.floor(total / 3600).toString().padStart(2, '0');
  const m = Math.floor((total % 3600) / 60).toString().padStart(2, '0');
  const s = (total % 60).toString().padStart(2, '0');
  return `${h}:${m}:${s}`;
};
const profile = () => getActiveProfile(state);
const data = () => getProfileData(state);

function route() {
  const value = location.hash.replace(/^#\/?/, '').split('?')[0] || 'dashboard';
  return PAGE_META[value] ? value : 'dashboard';
}

function go(page) {
  location.hash = `#/${page}`;
  ui.sidebarOpen = false;
}

function toast(message, type = '') {
  const node = document.createElement('div');
  node.className = `toast ${type}`;
  node.textContent = message;
  toastRoot.append(node);
  setTimeout(() => node.remove(), 3200);
}

function pageHeader(page, actions = '') {
  const [title, description] = PAGE_META[page];
  return `<div class="topbar">
    <div style="display:flex;gap:12px;align-items:flex-start">
      <button class="button ghost mobile-menu" data-action="toggle-sidebar">☰</button>
      <div class="page-title"><h2>${title}</h2><p>${description}</p></div>
    </div>
    <div class="top-actions">${actions}<span class="connection-label"><span class="connection-dot ${backendOnline ? 'online' : ''}"></span>${backendOnline ? 'Local AI connected' : 'Browser-only mode'}</span></div>
  </div>`;
}

function shell(content, current) {
  const p = profile();
  return `<div class="shell">
    <aside class="sidebar ${ui.sidebarOpen ? 'open' : ''}">
      <div class="brand"><div class="brand-mark">N</div><div><h1>Nexus Gaming Hub</h1><p>Switch 2 + Windows</p></div></div>
      <div class="nav-label">Gaming</div>
      <nav class="nav">${NAV.slice(0, 12).map(([id, icon, label]) => navButton(id, icon, label, current)).join('')}</nav>
      <div class="nav-label">System</div>
      <nav class="nav">${NAV.slice(12).map(([id, icon, label]) => navButton(id, icon, label, current)).join('')}</nav>
      <div class="profile-card">
        <div class="profile-row"><div class="avatar">${esc(p.emoji)}</div><div class="profile-meta"><strong>${esc(p.name)}</strong><span>${esc(p.role)}</span></div></div>
        <button class="button small" style="width:100%;margin-top:11px" data-route="profiles">Switch profile</button>
      </div>
    </aside>
    <main class="main">${content}</main>
  </div>`;
}

function navButton(id, icon, label, current) {
  return `<button class="nav-button ${id === current ? 'active' : ''}" data-route="${id}"><span class="nav-icon">${icon}</span><span>${label}</span></button>`;
}

function render() {
  state = loadState();
  if (!state.authenticated) {
    renderLogin();
    return;
  }
  const current = route();
  const renderer = {
    dashboard: renderDashboard, library: renderLibrary, backlog: renderBacklog, timer: renderTimer,
    goals: renderGoals, notes: renderNotes, media: renderMedia, ai: renderAI, batteries: renderBatteries,
    releases: renderReleases, guides: renderGuides, training: renderTraining, profiles: renderProfiles, settings: renderSettings
  }[current];
  app.innerHTML = shell(renderer(), current);
  if (current === 'media') hydrateMediaCards();
  if (current === 'training') hydrateTrainingMedia();
  if (current === 'ai') scrollChat();
  updateTimerDisplay();
}

function renderLogin() {
  const options = state.profiles.map(p => `<option value="${p.id}" ${p.id === state.activeProfileId ? 'selected' : ''}>${esc(p.name)} — ${esc(p.role)}</option>`).join('');
  app.innerHTML = `<section class="login-screen"><div class="login-wrap">
    <div class="login-hero">
      <div><div class="brand"><div class="brand-mark">N</div><div><h1 style="font-size:15px;margin:0">Nexus Gaming Hub</h1><p>Local gaming command center</p></div></div>
      <h1>Your games.<br>Your progress.<br>Your coach.</h1>
      <p>A professional dashboard for your Switch 2 and Windows laptop, with separate family profiles and private local storage.</p>
      <div class="login-feature-list"><div class="login-feature">✓ Game library & backlog</div><div class="login-feature">✓ Session tracking</div><div class="login-feature">✓ Clips & screenshots</div><div class="login-feature">✓ AI game intelligence</div></div></div>
      <div class="help">Nexus Gaming Hub is an independent personal project and is not affiliated with Nintendo.</div>
    </div>
    <div class="login-panel">
      <h2>Nintendo Account connection</h2>
      <p>Open Nintendo’s official sign-in page in a separate tab. This dashboard never asks for, receives, or stores your Nintendo password.</p>
      <a class="nintendo-button" href="https://accounts.nintendo.com/" target="_blank" rel="noopener noreferrer">◉ Open official Nintendo Account</a>
      <div class="security-note">Secure by design: GitHub Pages cannot verify your Nintendo session without an authorized Nintendo developer integration. The button above goes directly to Nintendo.</div>
      <div class="divider">Continue locally</div>
      <div class="field"><label>Choose local player profile</label><select id="login-profile" class="select">${options}</select></div>
      <label style="display:flex;gap:9px;align-items:flex-start;margin:16px 0;color:var(--muted);font-size:12px;line-height:1.5"><input id="nintendo-ack" type="checkbox" ${state.nintendoAcknowledged ? 'checked' : ''}> I understand this is a private local dashboard, not an official Nintendo login integration.</label>
      <button class="button primary" style="width:100%" data-action="login">Enter Nexus Gaming Hub</button>
    </div>
  </div></section>`;
}

function renderDashboard() {
  const d = data();
  const playedHours = d.sessions.reduce((sum, item) => sum + (item.duration || 0), 0) / 3600;
  const completed = d.games.filter(game => game.status === 'completed').length;
  const openGoals = d.goals.filter(goal => !goal.complete).length;
  const lowBatteries = d.batteries.filter(item => item.level <= item.reminderAt);
  const features = NAV.slice(1, 12).map(([id, icon, label]) => `<button class="feature-card" data-route="${id}"><div class="feature-icon">${icon}</div><h3>${label}</h3><p>${PAGE_META[id][1]}</p></button>`).join('');
  return `${pageHeader('dashboard', `<button class="button primary" data-action="quick-session">▶ Start session</button>`)}
    <div class="grid four">
      ${stat('Owned games', d.games.filter(g => g.owned).length, 'Across this profile', 'rgba(124,92,255,.2)')}
      ${stat('Tracked hours', playedHours.toFixed(1), `${d.sessions.length} completed sessions`, 'rgba(32,211,255,.17)')}
      ${stat('Completed', completed, `${d.games.length ? Math.round(completed / d.games.length * 100) : 0}% of library`, 'rgba(68,209,141,.18)')}
      ${stat('Open goals', openGoals, `${d.notes.length} strategy notes saved`, 'rgba(255,191,95,.18)')}
    </div>
    ${lowBatteries.length ? `<div class="card flat" style="margin-top:16px;border-color:rgba(255,191,95,.25)"><strong>⚡ Battery reminder:</strong> ${lowBatteries.map(item => `${esc(item.name)} is at ${item.level}%`).join(', ')}</div>` : ''}
    <div class="card" style="margin-top:16px"><div class="card-header"><div><h3>Open a dashboard</h3><p>Each feature has its own dedicated workspace.</p></div></div><div class="feature-grid">${features}</div></div>`;
}

function stat(label, value, sub, glow) {
  return `<div class="card stat-card" style="--glow:${glow}"><div class="stat-label">${label}</div><div class="stat-value">${value}</div><div class="stat-sub">${sub}</div></div>`;
}

function renderLibrary() {
  const d = data();
  const tabs = [['owned','Owned Games'],['played','Played Games'],['new','New This Month'],['upcoming','Upcoming Switch 2']];
  let items = [];
  if (ui.libraryTab === 'owned') items = d.games.filter(g => g.owned);
  if (ui.libraryTab === 'played') items = d.games.filter(g => g.played || g.hours > 0);
  const now = new Date();
  if (ui.libraryTab === 'new') items = d.releases.filter(r => { const dt = new Date(r.date); return dt.getMonth() === now.getMonth() && dt.getFullYear() === now.getFullYear(); });
  if (ui.libraryTab === 'upcoming') items = d.releases.filter(r => new Date(r.date) > now && /switch 2/i.test(r.platform || 'Nintendo Switch 2'));
  const releaseMode = ['new','upcoming'].includes(ui.libraryTab);
  const cards = items.length ? items.map(item => releaseMode ? releaseCard(item) : gameCard(item)).join('') : empty('Nothing here yet', releaseMode ? 'Add releases in the Release Calendar dashboard.' : 'Add a game to begin building this profile’s library.');
  return `${pageHeader('library', `<button class="button primary" data-action="add-game">＋ Add game</button>`)}
    <div class="card"><div class="tabs">${tabs.map(([id,label]) => `<button class="tab ${ui.libraryTab === id ? 'active' : ''}" data-library-tab="${id}">${label}</button>`).join('')}</div><div class="game-grid">${cards}</div></div>`;
}

function gameCard(game) {
  return `<article class="game-card"><div class="game-cover">${game.cover ? `<img src="${esc(game.cover)}" alt="">` : '🎮'}</div><h3>${esc(game.title)}</h3><div class="game-meta">${esc(game.platform)} · ${esc(game.genre || 'Uncategorized')} · ${Number(game.hours || 0).toFixed(1)}h</div><div class="progress"><span style="--progress:${Math.min(100, Number(game.progress || 0))}%"></span></div><div class="actions"><span class="badge accent">${esc(game.status || 'backlog')}</span><button class="button small" data-action="edit-game" data-id="${game.id}">Edit</button><button class="button small danger" data-action="delete-game" data-id="${game.id}">Delete</button></div></article>`;
}

function releaseCard(item) {
  return `<article class="game-card"><div class="game-cover">📅</div><h3>${esc(item.title)}</h3><div class="game-meta">${esc(item.platform || 'Nintendo Switch 2')} · ${fmtDate(item.date)}</div><div class="actions"><span class="badge ${new Date(item.date) < new Date() ? 'good' : 'accent'}">${new Date(item.date) < new Date() ? 'Released' : 'Upcoming'}</span>${item.url ? `<a class="button small" href="${esc(item.url)}" target="_blank" rel="noopener">Official page</a>` : ''}</div></article>`;
}

function renderBacklog() {
  const groups = [['backlog','Backlog'],['playing','Playing'],['paused','Paused'],['completed','Completed']];
  const d = data();
  return `${pageHeader('backlog', `<button class="button primary" data-action="add-game">＋ Add game</button>`)}<div class="kanban">${groups.map(([status,label]) => {
    const games = d.games.filter(g => (g.status || 'backlog') === status);
    return `<section class="kanban-column"><div class="kanban-title"><strong>${label}</strong><span class="badge">${games.length}</span></div>${games.map(game => `<div class="task-card" data-action="edit-game" data-id="${game.id}"><h4>${esc(game.title)}</h4><p>${esc(game.platform)} · ${game.progress || 0}% complete</p><div class="progress" style="margin-top:10px"><span style="--progress:${game.progress || 0}%"></span></div></div>`).join('') || `<div class="empty" style="padding:20px 10px">No games</div>`}</section>`;
  }).join('')}</div>`;
}

function renderTimer() {
  const d = data();
  const gameOptions = d.games.map(game => `<option value="${game.id}" ${timer.gameId === game.id ? 'selected' : ''}>${esc(game.title)}</option>`).join('');
  return `${pageHeader('timer')}<div class="dashboard-grid"><section class="card span-7"><div class="field"><label>Game</label><select id="timer-game" class="select"><option value="">General gaming</option>${gameOptions}</select></div><div id="timer-display" class="timer-display">${fmtTime(currentTimerSeconds())}</div><div class="timer-controls"><button class="button primary" data-action="timer-toggle">${timer.running ? '❚❚ Pause' : '▶ Start'}</button><button class="button" data-action="timer-save" ${currentTimerSeconds() < 1 ? 'disabled' : ''}>Save session</button><button class="button danger" data-action="timer-reset">Reset</button></div></section>
    <section class="card span-5"><div class="card-header"><div><h3>Recent sessions</h3><p>Saved automatically per profile.</p></div></div>${d.sessions.slice().sort((a,b) => new Date(b.date)-new Date(a.date)).slice(0,8).map(s => `<div class="goal-item"><div class="item-row"><div><div class="item-title">${esc(s.gameTitle || 'General gaming')}</div><div class="item-sub">${fmtDate(s.date)} · ${fmtTime(s.duration)}</div></div><button class="button small danger" data-action="delete-session" data-id="${s.id}">Delete</button></div></div>`).join('') || empty('No sessions yet','Start the timer and save your first session.')}</section></div>`;
}

function currentTimerSeconds() { return timer.elapsed + (timer.running && timer.startedAt ? (Date.now() - timer.startedAt) / 1000 : 0); }
function updateTimerDisplay() { const el = document.querySelector('#timer-display'); if (el) el.textContent = fmtTime(currentTimerSeconds()); }
function startTimerTick() { clearInterval(timer.interval); timer.interval = setInterval(updateTimerDisplay, 250); }

function renderGoals() {
  const d = data();
  return `${pageHeader('goals', `<button class="button primary" data-action="add-goal">＋ New goal</button>`)}<div class="grid two"><section class="card"><div class="card-header"><div><h3>Active goals</h3><p>Measurable targets you are currently pursuing.</p></div></div>${d.goals.filter(g=>!g.complete).map(goalItem).join('') || empty('No active goals','Add a goal for a game, rank, collectible, challenge, or completion milestone.')}</section><section class="card"><div class="card-header"><div><h3>Completed goals</h3><p>Your finished milestones.</p></div></div>${d.goals.filter(g=>g.complete).map(goalItem).join('') || empty('Nothing completed yet','Finished goals will remain here as a record.')}</section></div>`;
}
function goalItem(goal) {
  const pct = goal.target ? Math.min(100, Math.round((goal.current || 0) / goal.target * 100)) : (goal.complete ? 100 : 0);
  return `<div class="goal-item"><div class="item-row"><div style="flex:1"><div class="item-title">${esc(goal.title)}</div><div class="item-sub">${esc(goal.gameTitle || 'General')} · ${goal.current || 0}/${goal.target || 1}</div><div class="progress" style="margin-top:10px"><span style="--progress:${pct}%"></span></div></div><div class="item-actions"><button class="button small" data-action="edit-goal" data-id="${goal.id}">Edit</button><button class="button small danger" data-action="delete-goal" data-id="${goal.id}">Delete</button></div></div></div>`;
}

function renderNotes() {
  const d = data();
  const notes = d.notes.slice().sort((a,b)=>new Date(b.updatedAt)-new Date(a.updatedAt));
  return `${pageHeader('notes', `<button class="button primary" data-action="add-note">＋ New note</button>`)}<div class="card">${notes.map(note => `<article class="note-item"><div class="item-row"><div style="min-width:0"><div class="item-title">${esc(note.title)}</div><div class="item-sub">${esc(note.gameTitle || 'General')} · ${esc(note.category || 'Strategy')} · Updated ${fmtDate(note.updatedAt)}</div><p style="white-space:pre-wrap;line-height:1.6;color:#d6def0;font-size:13px">${esc(note.body)}</p>${(note.tags||[]).map(tag=>`<span class="badge">#${esc(tag)}</span>`).join(' ')}</div><div class="item-actions"><button class="button small" data-action="edit-note" data-id="${note.id}">Edit</button><button class="button small danger" data-action="delete-note" data-id="${note.id}">Delete</button></div></div></article>`).join('') || empty('No notes saved','Create a strategy note, route, build, boss plan, or discovery.')}</div>`;
}

function renderMedia() {
  const d = data();
  const categories = [['all','All'],['clip','Clips'],['screenshot','Screenshots'],['training','Training recordings']];
  const metas = d.mediaMeta.filter(item => ui.mediaFilter === 'all' || item.category === ui.mediaFilter);
  return `${pageHeader('media', `<button class="button primary" data-action="upload-media">⇧ Add media</button>`)}<div class="card"><div class="tabs">${categories.map(([id,label])=>`<button class="tab ${ui.mediaFilter===id?'active':''}" data-media-filter="${id}">${label}</button>`).join('')}</div><div id="media-grid" class="media-grid">${metas.map(mediaCard).join('') || empty('No media in this category','Add screenshots, short clips, or gameplay recordings. Browser-only files remain on this device.')}</div></div>`;
}
function mediaCard(meta) {
  return `<article class="media-card" data-media-card="${meta.id}"><div class="media-preview"><span>Loading preview…</span></div><div class="media-body"><h4>${esc(meta.name)}</h4><p>${esc(meta.gameTitle || 'General')} · ${esc(meta.category)} · ${formatBytes(meta.size || 0)}</p><div style="display:flex;gap:7px;margin-top:10px"><button class="button small" data-action="download-media" data-id="${meta.id}">Open</button><button class="button small danger" data-action="delete-media" data-id="${meta.id}">Delete</button></div></div></article>`;
}
async function hydrateMediaCards() {
  for (const card of document.querySelectorAll('[data-media-card]')) {
    const id = card.dataset.mediaCard;
    const meta = data().mediaMeta.find(m=>m.id===id);
    if (!meta) continue;
    const preview = card.querySelector('.media-preview');
    if (meta.storage === 'server' && meta.url) {
      preview.innerHTML = meta.type?.startsWith('image/') ? `<img src="${esc(meta.url)}" alt="">` : `<video src="${esc(meta.url)}" controls preload="metadata"></video>`;
      continue;
    }
    const record = await getMedia(id).catch(()=>null);
    if (!record?.blob) { preview.textContent = 'File unavailable'; continue; }
    const url = URL.createObjectURL(record.blob);
    preview.innerHTML = meta.type?.startsWith('image/') ? `<img src="${url}" alt="">` : `<video src="${url}" controls preload="metadata"></video>`;
  }
}

function renderAI() {
  const d = data();
  const gameOptions = d.games.map(g=>`<option value="${g.id}">${esc(g.title)}</option>`).join('');
  return `${pageHeader('ai')}<div class="chat-layout"><section class="card chat-panel"><div id="chat-messages" class="chat-messages">${d.chat.map(msg=>`<div class="message ${msg.role}">${esc(msg.text)}</div>`).join('')}</div><form id="chat-form" class="chat-input"><input id="chat-message" class="input" required autocomplete="off" placeholder="Ask for a strategy, build, route, or review…"><button class="button primary">Send</button></form></section><aside class="card"><div class="card-header"><div><h3>Coach context</h3><p>Choose the game being discussed.</p></div></div><div class="field"><label>Active game</label><select id="ai-game" class="select"><option value="">General gaming</option>${gameOptions}</select></div><div class="security-note" style="margin-top:15px">${backendOnline ? 'The local AI companion is online. Your API key stays on the Windows server, not in this webpage.' : 'Offline coach mode is active. Connect the local companion in Settings for real AI responses.'}</div><div class="item-sub">Available context: ${d.notes.length} notes, ${d.goals.length} goals, ${d.trainingProjects.reduce((sum,p)=>sum+(p.knowledge?.length||0),0)} learned knowledge entries.</div><button class="button small danger" style="margin-top:16px" data-action="clear-chat">Clear conversation</button></aside></div>`;
}
function scrollChat(){ requestAnimationFrame(()=>{ const el=document.querySelector('#chat-messages'); if(el) el.scrollTop=el.scrollHeight; }); }

function renderBatteries() {
  const d = data();
  return `${pageHeader('batteries', `<button class="button primary" data-action="add-battery">＋ Add controller</button>`)}<div class="grid two">${d.batteries.map(item=>`<section class="card"><div class="item-row"><div><div class="stat-label">Controller</div><div class="stat-value">${item.level}%</div><div class="item-title">${esc(item.name)}</div><div class="item-sub">Reminder at ${item.reminderAt}% · Updated ${fmtDate(item.updatedAt)}</div></div><span class="badge ${item.level<=item.reminderAt?'danger':'good'}">${item.level<=item.reminderAt?'Charge now':'Ready'}</span></div><div class="progress" style="margin:18px 0"><span style="--progress:${item.level}%"></span></div><div class="item-actions"><button class="button small" data-action="edit-battery" data-id="${item.id}">Update</button><button class="button small danger" data-action="delete-battery" data-id="${item.id}">Delete</button></div></section>`).join('') || empty('No controllers','Add your Switch 2 controllers and update their levels after playing.')}</div><div class="card flat" style="margin-top:16px"><strong>Current limitation:</strong> Web browsers cannot read Switch 2 controller battery levels through the dock. This page provides manual reminders until Nintendo exposes supported access.</div>`;
}

function renderReleases() {
  const d = data();
  const month = ui.releaseMonth;
  const label = new Intl.DateTimeFormat(undefined,{month:'long',year:'numeric'}).format(month);
  return `${pageHeader('releases', `<button class="button" data-action="import-release-feed">⇩ Import feed</button><button class="button primary" data-action="add-release">＋ Add release</button>`)}<div class="card"><div class="card-header"><button class="button small" data-action="prev-month">←</button><div style="text-align:center"><h3>${label}</h3><p>${d.releases.length} tracked releases</p></div><button class="button small" data-action="next-month">→</button></div>${calendarMarkup(month,d.releases)}</div><div class="card" style="margin-top:16px"><div class="card-header"><div><h3>Tracked releases</h3><p>Use official store or publisher links when possible.</p></div></div>${d.releases.slice().sort((a,b)=>new Date(a.date)-new Date(b.date)).map(item=>`<div class="release-item"><div class="item-row"><div><div class="item-title">${esc(item.title)}</div><div class="item-sub">${fmtDate(item.date)} · ${esc(item.platform || 'Nintendo Switch 2')}</div></div><div class="item-actions">${item.url?`<a class="button small" href="${esc(item.url)}" target="_blank" rel="noopener">Open</a>`:''}<button class="button small" data-action="edit-release" data-id="${item.id}">Edit</button><button class="button small danger" data-action="delete-release" data-id="${item.id}">Delete</button></div></div></div>`).join('') || empty('No releases tracked','Add a release or import a JSON feed. The app will automatically sort it into new-this-month and upcoming library views.')}</div>`;
}
function calendarMarkup(month,releases){
  const year=month.getFullYear(), m=month.getMonth(); const first=new Date(year,m,1); const start=new Date(year,m,1-first.getDay());
  const heads=['Sun','Mon','Tue','Wed','Thu','Fri','Sat'].map(x=>`<div class="calendar-head">${x}</div>`).join('');
  const days=[]; for(let i=0;i<42;i++){ const dt=new Date(start); dt.setDate(start.getDate()+i); const key=dt.toISOString().slice(0,10); const events=releases.filter(r=>String(r.date).slice(0,10)===key); days.push(`<div class="calendar-day ${dt.getMonth()!==m?'muted':''}"><div class="day-number">${dt.getDate()}</div>${events.map(e=>`<div class="calendar-event">${esc(e.title)}</div>`).join('')}</div>`); }
  return `<div class="calendar">${heads}${days.join('')}</div>`;
}

function renderGuides() {
  const d=data();
  return `${pageHeader('guides', `<button class="button primary" data-action="add-guide">＋ Add guide</button>`)}<div class="card">${d.guides.map(item=>`<div class="guide-item"><div class="item-row"><div><div class="item-title">${esc(item.title)}</div><div class="item-sub">${esc(item.gameTitle||'General')} · ${esc(item.type||'Guide')}</div><div class="help" style="margin-top:6px">${esc(item.url)}</div></div><div class="item-actions"><a class="button small primary" href="${esc(item.url)}" target="_blank" rel="noopener">Open</a><button class="button small" data-action="edit-guide" data-id="${item.id}">Edit</button><button class="button small danger" data-action="delete-guide" data-id="${item.id}">Delete</button></div></div></div>`).join('') || empty('No guide links','Save official pages, maps, wikis, walkthroughs, build planners, and video guides.')}</div>`;
}

function renderTraining() {
  const d=data();
  const projects=d.trainingProjects;
  return `${pageHeader('training', `<button class="button primary" data-action="add-training-project">＋ New game project</button>`)}<div class="card flat" style="margin-bottom:16px"><strong>How learning works:</strong> recordings are sampled into frames by the optional Windows companion. AI analysis becomes a growing knowledge base used by Strategy Chat. This is retrieval-based learning, not hidden model-weight training.</div>${projects.length ? projects.map(project=>trainingProjectCard(project)).join('') : `<div class="card">${empty('No game intelligence projects','Create a project for one game, upload gameplay, and accumulate analyzed strategies over time.')}</div>`}`;
}
function trainingProjectCard(project){
  const d=data(); const recordings=d.mediaMeta.filter(m=>m.projectId===project.id);
  return `<section class="card" style="margin-bottom:16px"><div class="card-header"><div><h3>${esc(project.gameTitle)}</h3><p>${recordings.length} recordings · ${(project.knowledge||[]).length} knowledge entries</p></div><div class="item-actions"><button class="button small primary" data-action="upload-training" data-id="${project.id}">Upload recording</button><button class="button small danger" data-action="delete-training-project" data-id="${project.id}">Delete project</button></div></div><div class="dashboard-grid"><div class="span-5"><h4>Recordings</h4><div data-training-media="${project.id}">${recordings.map(m=>`<div class="goal-item"><div class="item-title">${esc(m.name)}</div><div class="item-sub">${formatBytes(m.size)} · ${m.analysisStatus||'Not analyzed'}</div><div class="item-actions" style="margin-top:8px"><button class="button small" data-action="analyze-training" data-id="${m.id}" ${backendOnline&&m.storage==='server'?'':'disabled'}>Analyze frames</button></div></div>`).join('')||`<div class="empty">No recordings</div>`}</div></div><div class="span-7"><h4>Learned knowledge</h4>${(project.knowledge||[]).slice().reverse().map(k=>`<div class="note-item"><div class="item-title">Analysis · ${fmtDate(k.createdAt)}</div><div class="item-sub" style="white-space:pre-wrap">${esc(k.text)}</div></div>`).join('')||`<div class="empty">No analysis yet</div>`}</div></div></section>`;
}
async function hydrateTrainingMedia() {}

function renderProfiles() {
  return `${pageHeader('profiles', `<button class="button primary" data-action="add-profile">＋ Add profile</button>`)}<div class="grid two">${state.profiles.map(p=>{ const pd=state.profileData[p.id]; return `<section class="card"><div class="item-row"><div class="profile-row"><div class="avatar" style="width:54px;height:54px;font-size:23px">${esc(p.emoji)}</div><div><div class="item-title" style="font-size:18px">${esc(p.name)}</div><div class="item-sub">${esc(p.role)} · ${pd.games.length} games · ${pd.sessions.length} sessions</div></div></div>${p.id===state.activeProfileId?'<span class="badge good">Active</span>':''}</div><div class="item-actions" style="margin-top:18px"><button class="button small primary" data-action="switch-profile" data-id="${p.id}">Use profile</button><button class="button small" data-action="edit-profile" data-id="${p.id}">Edit</button><button class="button small danger" data-action="delete-profile" data-id="${p.id}">Delete</button></div></section>`}).join('')}</div>`;
}

function renderSettings() {
  return `${pageHeader('settings')}<div class="dashboard-grid"><section class="card span-7"><div class="card-header"><div><h3>Windows AI companion</h3><p>Required for private API access and gameplay frame analysis.</p></div></div><form id="settings-form" class="form-grid"><div class="field full"><label>Local companion URL</label><input class="input" name="backendUrl" value="${esc(state.settings.backendUrl)}" placeholder="http://localhost:8787"><div class="help">Never paste an OpenAI API key into this webpage. Store it only in the local server’s .env file.</div></div><div class="field full"><button class="button primary">Save and test connection</button></div></form><div class="security-note">Status: ${backendOnline?'Connected. AI chat and server uploads are available.':'Not connected. Browser-only dashboards still work.'}</div></section><section class="card span-5"><div class="card-header"><div><h3>Backup & privacy</h3><p>Your browser data is not automatically synced.</p></div></div><button class="button" style="width:100%;margin-bottom:9px" data-action="export-data">Export JSON backup</button><button class="button" style="width:100%;margin-bottom:9px" data-action="import-data">Import JSON backup</button><button class="button danger" style="width:100%;margin-bottom:9px" data-action="logout">Lock dashboard</button><button class="button danger" style="width:100%" data-action="reset-data">Reset all browser data</button><div class="help" style="margin-top:14px">Browser media is stored in IndexedDB on this device. Large gameplay recordings are better stored by the Windows companion.</div></section></div>`;
}

function empty(title, text){ return `<div class="empty"><strong>${title}</strong>${text}</div>`; }
function formatBytes(bytes){ if(!bytes) return '0 B'; const units=['B','KB','MB','GB']; const i=Math.min(Math.floor(Math.log(bytes)/Math.log(1024)),3); return `${(bytes/1024**i).toFixed(i?1:0)} ${units[i]}`; }

function showModal(title, body, onSubmit, submitText='Save') {
  modalSubmit=onSubmit;
  const backdrop=document.createElement('div'); backdrop.className='modal-backdrop'; backdrop.innerHTML=`<div class="modal"><div class="modal-header"><h3>${title}</h3><button class="button ghost" data-action="close-modal">✕</button></div><form id="modal-form">${body}<div style="display:flex;justify-content:flex-end;gap:9px;margin-top:18px"><button type="button" class="button" data-action="close-modal">Cancel</button><button class="button primary">${submitText}</button></div></form></div>`; document.body.append(backdrop);
}
function closeModal(){ document.querySelector('.modal-backdrop')?.remove(); modalSubmit=null; }
function gameOptions(selected=''){ return `<option value="">General / no game</option>${data().games.map(g=>`<option value="${g.id}" ${g.id===selected?'selected':''}>${esc(g.title)}</option>`).join('')}`; }

function openGameModal(existing=null){
  showModal(existing?'Edit game':'Add game', `<div class="form-grid"><div class="field full"><label>Game title</label><input class="input" name="title" required value="${esc(existing?.title||'')}"></div><div class="field"><label>Platform</label><input class="input" name="platform" value="${esc(existing?.platform||'Nintendo Switch 2')}"></div><div class="field"><label>Genre</label><input class="input" name="genre" value="${esc(existing?.genre||'')}"></div><div class="field"><label>Status</label><select class="select" name="status">${['backlog','playing','paused','completed'].map(x=>`<option ${existing?.status===x?'selected':''}>${x}</option>`).join('')}</select></div><div class="field"><label>Completion %</label><input class="input" name="progress" type="number" min="0" max="100" value="${existing?.progress||0}"></div><div class="field"><label>Hours played</label><input class="input" name="hours" type="number" min="0" step="0.1" value="${existing?.hours||0}"></div><div class="field"><label>Cover image URL (optional)</label><input class="input" name="cover" value="${esc(existing?.cover||'')}"></div><div class="field"><label><input type="checkbox" name="owned" ${existing?.owned!==false?'checked':''}> Owned</label></div><div class="field"><label><input type="checkbox" name="played" ${existing?.played?'checked':''}> Played</label></div></div>`, form=>{
    const fd=new FormData(form); const item=existing||{id:uid('game'),addedAt:new Date().toISOString()}; Object.assign(item,{title:fd.get('title').trim(),platform:fd.get('platform').trim(),genre:fd.get('genre').trim(),status:fd.get('status'),progress:Number(fd.get('progress')||0),hours:Number(fd.get('hours')||0),cover:fd.get('cover').trim(),owned:fd.has('owned'),played:fd.has('played')}); if(!existing)data().games.push(item); saveState(state); closeModal(); render(); toast('Game saved','good');
  });
}
function openGoalModal(existing=null){ showModal(existing?'Edit goal':'New achievement goal',`<div class="form-grid"><div class="field full"><label>Goal</label><input class="input" name="title" required value="${esc(existing?.title||'')}"></div><div class="field"><label>Game</label><select class="select" name="gameId">${gameOptions(existing?.gameId)}</select></div><div class="field"><label>Current</label><input class="input" type="number" name="current" min="0" value="${existing?.current||0}"></div><div class="field"><label>Target</label><input class="input" type="number" name="target" min="1" value="${existing?.target||1}"></div><div class="field"><label><input type="checkbox" name="complete" ${existing?.complete?'checked':''}> Mark complete</label></div></div>`,form=>{const fd=new FormData(form),game=data().games.find(g=>g.id===fd.get('gameId'));const item=existing||{id:uid('goal'),createdAt:new Date().toISOString()};Object.assign(item,{title:fd.get('title').trim(),gameId:fd.get('gameId'),gameTitle:game?.title||'General',current:Number(fd.get('current')),target:Number(fd.get('target')),complete:fd.has('complete')});if(!existing)data().goals.push(item);saveState(state);closeModal();render();toast('Goal saved','good');}); }
function openNoteModal(existing=null){ showModal(existing?'Edit note':'New note',`<div class="form-grid"><div class="field full"><label>Title</label><input class="input" name="title" required value="${esc(existing?.title||'')}"></div><div class="field"><label>Game</label><select class="select" name="gameId">${gameOptions(existing?.gameId)}</select></div><div class="field"><label>Category</label><select class="select" name="category">${['Strategy','Build','Boss','Route','Discovery','Reminder'].map(x=>`<option ${existing?.category===x?'selected':''}>${x}</option>`).join('')}</select></div><div class="field full"><label>Note</label><textarea class="textarea" name="body" required>${esc(existing?.body||'')}</textarea></div><div class="field full"><label>Tags (comma separated)</label><input class="input" name="tags" value="${esc((existing?.tags||[]).join(', '))}"></div></div>`,form=>{const fd=new FormData(form),game=data().games.find(g=>g.id===fd.get('gameId'));const item=existing||{id:uid('note'),createdAt:new Date().toISOString()};Object.assign(item,{title:fd.get('title').trim(),gameId:fd.get('gameId'),gameTitle:game?.title||'General',category:fd.get('category'),body:fd.get('body').trim(),tags:fd.get('tags').split(',').map(x=>x.trim()).filter(Boolean),updatedAt:new Date().toISOString()});if(!existing)data().notes.push(item);saveState(state);closeModal();render();toast('Note saved','good');}); }
function openBatteryModal(existing=null){ showModal(existing?'Update controller':'Add controller',`<div class="form-grid"><div class="field full"><label>Name</label><input class="input" name="name" required value="${esc(existing?.name||'Switch 2 Controller')}"></div><div class="field"><label>Battery %</label><input class="input" type="number" min="0" max="100" name="level" value="${existing?.level??100}"></div><div class="field"><label>Remind at %</label><input class="input" type="number" min="1" max="100" name="reminderAt" value="${existing?.reminderAt??25}"></div></div>`,form=>{const fd=new FormData(form);const item=existing||{id:uid('battery')};Object.assign(item,{name:fd.get('name').trim(),level:Number(fd.get('level')),reminderAt:Number(fd.get('reminderAt')),updatedAt:new Date().toISOString()});if(!existing)data().batteries.push(item);saveState(state);closeModal();render();toast('Controller updated','good');}); }
function openReleaseModal(existing=null){ showModal(existing?'Edit release':'Add release',`<div class="form-grid"><div class="field full"><label>Game title</label><input class="input" name="title" required value="${esc(existing?.title||'')}"></div><div class="field"><label>Release date</label><input class="input" type="date" name="date" required value="${esc(existing?.date?.slice(0,10)||'')}"></div><div class="field"><label>Platform</label><input class="input" name="platform" value="${esc(existing?.platform||'Nintendo Switch 2')}"></div><div class="field full"><label>Official/store URL</label><input class="input" type="url" name="url" value="${esc(existing?.url||'')}"></div></div>`,form=>{const fd=new FormData(form);const item=existing||{id:uid('release')};Object.assign(item,{title:fd.get('title').trim(),date:fd.get('date'),platform:fd.get('platform').trim(),url:fd.get('url').trim()});if(!existing)data().releases.push(item);saveState(state);closeModal();render();toast('Release saved','good');}); }
function openGuideModal(existing=null){ showModal(existing?'Edit guide':'Add guide',`<div class="form-grid"><div class="field full"><label>Title</label><input class="input" name="title" required value="${esc(existing?.title||'')}"></div><div class="field"><label>Game</label><select class="select" name="gameId">${gameOptions(existing?.gameId)}</select></div><div class="field"><label>Type</label><select class="select" name="type">${['Official','Guide','Wiki','Walkthrough','Map','Build tool','Video'].map(x=>`<option ${existing?.type===x?'selected':''}>${x}</option>`).join('')}</select></div><div class="field full"><label>URL</label><input class="input" type="url" name="url" required value="${esc(existing?.url||'')}"></div></div>`,form=>{const fd=new FormData(form),game=data().games.find(g=>g.id===fd.get('gameId'));const item=existing||{id:uid('guide')};Object.assign(item,{title:fd.get('title').trim(),gameId:fd.get('gameId'),gameTitle:game?.title||'General',type:fd.get('type'),url:fd.get('url').trim()});if(!existing)data().guides.push(item);saveState(state);closeModal();render();toast('Guide saved','good');}); }
function openProfileModal(existing=null){ showModal(existing?'Edit profile':'Add profile',`<div class="form-grid"><div class="field full"><label>Name</label><input class="input" name="name" required value="${esc(existing?.name||'')}"></div><div class="field"><label>Role</label><input class="input" name="role" value="${esc(existing?.role||'Player')}"></div><div class="field"><label>Emoji</label><input class="input" name="emoji" maxlength="4" value="${esc(existing?.emoji||'🎮')}"></div></div>`,form=>{const fd=new FormData(form);if(existing){existing.name=fd.get('name').trim();existing.role=fd.get('role').trim();existing.emoji=fd.get('emoji').trim()||'🎮';}else{createProfile(state,fd.get('name').trim(),fd.get('role').trim(),fd.get('emoji').trim()||'🎮');}saveState(state);closeModal();render();toast('Profile saved','good');}); }
function openMediaModal(category='clip', projectId=''){ showModal('Add local media',`<div class="form-grid"><div class="field full"><label>Files</label><input class="input" type="file" name="files" multiple required accept="image/*,video/*"></div><div class="field"><label>Game</label><select class="select" name="gameId">${gameOptions(projectId?data().trainingProjects.find(p=>p.id===projectId)?.gameId:'')}</select></div><div class="field"><label>Category</label><select class="select" name="category">${['clip','screenshot','training'].map(x=>`<option ${category===x?'selected':''}>${x}</option>`).join('')}</select></div><div class="field full"><label>Tags</label><input class="input" name="tags" placeholder="boss, win, route"></div><div class="field full"><div class="help">When the Windows companion is connected, training recordings upload there for analysis. Otherwise files stay only in this browser.</div></div></div>`,async form=>{const fd=new FormData(form),files=[...form.elements.files.files],game=data().games.find(g=>g.id===fd.get('gameId')),cat=fd.get('category');for(const file of files){const id=uid('media');let meta={id,name:file.name,size:file.size,type:file.type,category:cat,gameId:fd.get('gameId'),gameTitle:game?.title||'General',tags:fd.get('tags').split(',').map(x=>x.trim()).filter(Boolean),projectId,createdAt:new Date().toISOString(),storage:'browser'};if(backendOnline&&cat==='training'){try{const upload=new FormData();upload.append('file',file);upload.append('profileId',state.activeProfileId);upload.append('gameTitle',game?.title||'General');upload.append('projectId',projectId);const res=await fetch(`${state.settings.backendUrl}/api/uploads`,{method:'POST',body:upload});if(!res.ok)throw new Error(await res.text());const result=await res.json();meta={...meta,...result,id:result.id,storage:'server'};}catch(err){await putMedia({id,profileId:state.activeProfileId,blob:file});toast(`Server upload failed; ${file.name} was saved in the browser.`,'error');}}else await putMedia({id,profileId:state.activeProfileId,blob:file});data().mediaMeta.push(meta);}saveState(state);closeModal();render();toast(`${files.length} file(s) added`,'good');}); }
function openTrainingProjectModal(){ showModal('New game intelligence project',`<div class="field"><label>Game</label><select class="select" name="gameId" required><option value="">Choose a game</option>${data().games.map(g=>`<option value="${g.id}">${esc(g.title)}</option>`).join('')}</select></div>`,form=>{const game=data().games.find(g=>g.id===new FormData(form).get('gameId'));if(!game)return;data().trainingProjects.push({id:uid('project'),gameId:game.id,gameTitle:game.title,knowledge:[],createdAt:new Date().toISOString()});saveState(state);closeModal();render();toast('Game intelligence project created','good');}); }

async function checkBackend(show=false){ try{const controller=new AbortController();setTimeout(()=>controller.abort(),1800);const res=await fetch(`${state.settings.backendUrl}/api/health`,{signal:controller.signal});backendOnline=res.ok;if(show)toast(backendOnline?'Local AI companion connected':'Companion did not respond',backendOnline?'good':'error');}catch{backendOnline=false;if(show)toast('Local AI companion is offline','error');} }
function deleteBy(collection,id,label){const d=data();d[collection]=d[collection].filter(x=>x.id!==id);saveState(state);render();toast(`${label} deleted`);}

app.addEventListener('click', async event => {
  const routeButton=event.target.closest('[data-route]'); if(routeButton){go(routeButton.dataset.route);return;}
  const tab=event.target.closest('[data-library-tab]'); if(tab){ui.libraryTab=tab.dataset.libraryTab;render();return;}
  const mf=event.target.closest('[data-media-filter]'); if(mf){ui.mediaFilter=mf.dataset.mediaFilter;render();return;}
  const button=event.target.closest('[data-action]'); if(!button)return; const action=button.dataset.action,id=button.dataset.id;
  if(action==='toggle-sidebar'){ui.sidebarOpen=!ui.sidebarOpen;render();}
  if(action==='close-modal')closeModal();
  if(action==='login'){const ack=document.querySelector('#nintendo-ack');if(!ack.checked){toast('Confirm the local-dashboard notice first.','error');return;}state.activeProfileId=document.querySelector('#login-profile').value;state.nintendoAcknowledged=true;state.authenticated=true;saveState(state);go('dashboard');render();}
  if(action==='logout'){state.authenticated=false;saveState(state);render();}
  if(action==='quick-session'){go('timer');setTimeout(()=>document.querySelector('[data-action="timer-toggle"]')?.click(),0);}
  if(action==='add-game')openGameModal(); if(action==='edit-game')openGameModal(data().games.find(x=>x.id===id)); if(action==='delete-game'&&confirm('Delete this game?'))deleteBy('games',id,'Game');
  if(action==='add-goal')openGoalModal(); if(action==='edit-goal')openGoalModal(data().goals.find(x=>x.id===id)); if(action==='delete-goal'&&confirm('Delete this goal?'))deleteBy('goals',id,'Goal');
  if(action==='add-note')openNoteModal(); if(action==='edit-note')openNoteModal(data().notes.find(x=>x.id===id)); if(action==='delete-note'&&confirm('Delete this note?'))deleteBy('notes',id,'Note');
  if(action==='add-battery')openBatteryModal(); if(action==='edit-battery')openBatteryModal(data().batteries.find(x=>x.id===id)); if(action==='delete-battery'&&confirm('Delete this controller?'))deleteBy('batteries',id,'Controller');
  if(action==='add-release')openReleaseModal(); if(action==='edit-release')openReleaseModal(data().releases.find(x=>x.id===id)); if(action==='delete-release'&&confirm('Delete this release?'))deleteBy('releases',id,'Release');
  if(action==='prev-month'){ui.releaseMonth=new Date(ui.releaseMonth.getFullYear(),ui.releaseMonth.getMonth()-1,1);render();} if(action==='next-month'){ui.releaseMonth=new Date(ui.releaseMonth.getFullYear(),ui.releaseMonth.getMonth()+1,1);render();}
  if(action==='add-guide')openGuideModal(); if(action==='edit-guide')openGuideModal(data().guides.find(x=>x.id===id)); if(action==='delete-guide'&&confirm('Delete this guide?'))deleteBy('guides',id,'Guide');
  if(action==='add-profile')openProfileModal(); if(action==='edit-profile')openProfileModal(state.profiles.find(x=>x.id===id));
  if(action==='switch-profile'){state.activeProfileId=id;saveState(state);render();toast(`Switched to ${profile().name}`,'good');}
  if(action==='delete-profile'&&confirm('Delete this profile and all of its dashboard data?')){try{removeProfile(state,id);render();toast('Profile deleted');}catch(err){toast(err.message,'error');}}
  if(action==='upload-media')openMediaModal(); if(action==='upload-training')openMediaModal('training',id);
  if(action==='delete-media'&&confirm('Delete this media item?')){const meta=data().mediaMeta.find(x=>x.id===id);if(meta?.storage==='browser')await deleteMedia(id);data().mediaMeta=data().mediaMeta.filter(x=>x.id!==id);saveState(state);render();toast('Media deleted');}
  if(action==='download-media'){const meta=data().mediaMeta.find(x=>x.id===id);if(meta?.storage==='server'&&meta.url){window.open(meta.url,'_blank');}else{const record=await getMedia(id);if(record?.blob){const url=URL.createObjectURL(record.blob);window.open(url,'_blank');setTimeout(()=>URL.revokeObjectURL(url),10000);}}}
  if(action==='add-training-project')openTrainingProjectModal();
  if(action==='delete-training-project'&&confirm('Delete this intelligence project? Recordings remain in the media organizer.')){data().trainingProjects=data().trainingProjects.filter(x=>x.id!==id);saveState(state);render();}
  if(action==='analyze-training')await analyzeTraining(id);
  if(action==='timer-toggle'){timer.gameId=document.querySelector('#timer-game')?.value||timer.gameId;if(timer.running){timer.elapsed=currentTimerSeconds();timer.running=false;timer.startedAt=null;clearInterval(timer.interval);}else{timer.running=true;timer.startedAt=Date.now();startTimerTick();}render();}
  if(action==='timer-reset'){clearInterval(timer.interval);timer={running:false,startedAt:null,elapsed:0,interval:null,gameId:''};render();}
  if(action==='timer-save'){const duration=Math.floor(currentTimerSeconds()),game=data().games.find(g=>g.id===(document.querySelector('#timer-game')?.value||timer.gameId));if(duration>0){data().sessions.push({id:uid('session'),gameId:game?.id||'',gameTitle:game?.title||'General gaming',duration,date:new Date().toISOString()});if(game){game.hours=Number(game.hours||0)+duration/3600;game.played=true;}saveState(state);clearInterval(timer.interval);timer={running:false,startedAt:null,elapsed:0,interval:null,gameId:''};render();toast('Session saved','good');}}
  if(action==='delete-session'&&confirm('Delete this session?'))deleteBy('sessions',id,'Session');
  if(action==='clear-chat'&&confirm('Clear this profile’s AI conversation?')){data().chat=[];saveState(state);render();}
  if(action==='export-data')exportState(state);
  if(action==='import-data'){const input=document.createElement('input');input.type='file';input.accept='application/json';input.onchange=async()=>{try{state=await importState(input.files[0]);render();toast('Backup imported','good');}catch(err){toast(err.message,'error');}};input.click();}
  if(action==='reset-data'&&confirm('Reset all browser dashboard data? This cannot be undone without a backup.')){localStorage.clear();location.reload();}
  if(action==='import-release-feed'){const input=document.createElement('input');input.type='file';input.accept='application/json';input.onchange=async()=>{try{const feed=JSON.parse(await input.files[0].text());const entries=Array.isArray(feed)?feed:feed.releases;if(!Array.isArray(entries))throw new Error('Expected an array or { releases: [] }.');for(const r of entries){if(!r.title||!r.date)continue;data().releases.push({id:uid('release'),title:r.title,date:r.date,platform:r.platform||'Nintendo Switch 2',url:r.url||''});}saveState(state);render();toast(`${entries.length} release entries imported`,'good');}catch(err){toast(err.message,'error');}};input.click();}
});

app.addEventListener('submit', async event => {
  if(event.target.id==='modal-form'){event.preventDefault();if(modalSubmit)await modalSubmit(event.target);return;}
  if(event.target.id==='settings-form'){event.preventDefault();state.settings.backendUrl=new FormData(event.target).get('backendUrl').replace(/\/$/,'');saveState(state);await checkBackend(true);render();return;}
  if(event.target.id==='chat-form'){event.preventDefault();await sendChat();}
});

async function sendChat(){
  const input=document.querySelector('#chat-message'),text=input.value.trim();if(!text)return;const d=data(),gameId=document.querySelector('#ai-game')?.value||'',game=d.games.find(g=>g.id===gameId);d.chat.push({id:uid('msg'),role:'user',text});input.value='';saveState(state);render();
  let answer='';
  if(backendOnline){try{const project=d.trainingProjects.find(p=>p.gameId===gameId);const context={notes:d.notes.filter(n=>!gameId||n.gameId===gameId).slice(-20),goals:d.goals.filter(g=>!gameId||g.gameId===gameId),knowledge:project?.knowledge||[]};const res=await fetch(`${state.settings.backendUrl}/api/chat`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({message:text,gameTitle:game?.title||'General gaming',profileName:profile().name,context,history:d.chat.slice(-12)})});if(!res.ok)throw new Error(await res.text());answer=(await res.json()).text;}catch(err){answer=`The local AI companion returned an error: ${err.message}`;backendOnline=false;}}
  else answer=offlineCoach(text,game);
  d.chat.push({id:uid('msg'),role:'assistant',text:answer});saveState(state);render();
}
function offlineCoach(text,game){const notes=data().notes.filter(n=>!game||n.gameId===game.id);const relevant=notes.find(n=>text.toLowerCase().split(/\W+/).some(w=>w.length>4&&(`${n.title} ${n.body}`).toLowerCase().includes(w)));return relevant?`Offline coach found this in your saved note “${relevant.title}”:\n\n${relevant.body}\n\nConnect the Windows AI companion for deeper analysis.`:`Offline coach mode cannot generate a professional strategy yet. Add notes for ${game?.title||'this game'}, or connect the Windows AI companion in Settings for real AI coaching.`;}

async function analyzeTraining(mediaId){
  const meta=data().mediaMeta.find(m=>m.id===mediaId);if(!meta)return;meta.analysisStatus='Analyzing';saveState(state);render();toast('Analyzing sampled gameplay frames…');
  try{const res=await fetch(`${state.settings.backendUrl}/api/analyze/${encodeURIComponent(mediaId)}`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({gameTitle:meta.gameTitle,profileId:state.activeProfileId,projectId:meta.projectId})});if(!res.ok)throw new Error(await res.text());const result=await res.json();const project=data().trainingProjects.find(p=>p.id===meta.projectId);project.knowledge=project.knowledge||[];project.knowledge.push({id:uid('knowledge'),text:result.text,createdAt:new Date().toISOString(),mediaId});meta.analysisStatus='Analyzed';saveState(state);render();toast('Gameplay knowledge added','good');}catch(err){meta.analysisStatus='Analysis failed';saveState(state);render();toast(err.message,'error');}
}

window.addEventListener('hashchange',render);
window.addEventListener('beforeunload',()=>clearInterval(timer.interval));
if('serviceWorker' in navigator)navigator.serviceWorker.register('./service-worker.js').catch(console.error);
await checkBackend(false);
render();
