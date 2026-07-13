const STORAGE_KEY = 'nexusGamingHub.v1';
const DB_NAME = 'nexusGamingHubMedia';
const DB_VERSION = 1;
const MEDIA_STORE = 'media';

const uid = (prefix = 'id') => `${prefix}_${crypto.randomUUID?.() || Math.random().toString(36).slice(2)}_${Date.now()}`;

function profileData(seedGames = []) {
  return {
    games: seedGames,
    backlog: [],
    sessions: [],
    goals: [],
    notes: [],
    guides: [],
    batteries: [
      { id: uid('battery'), name: 'Switch 2 Controller 1', level: 100, reminderAt: 25, updatedAt: new Date().toISOString() },
      { id: uid('battery'), name: 'Switch 2 Controller 2', level: 100, reminderAt: 25, updatedAt: new Date().toISOString() }
    ],
    releases: [],
    chat: [
      { id: uid('msg'), role: 'assistant', text: 'Choose a game and ask me for a strategy. When the local AI companion is connected, I can use your notes, goals, and gameplay knowledge.' }
    ],
    mediaMeta: [],
    trainingProjects: []
  };
}

function defaultState() {
  const zachId = uid('profile');
  const loganId = uid('profile');
  const zachGames = [
    { id: uid('game'), title: 'Mario Kart World', platform: 'Nintendo Switch 2', status: 'playing', progress: 35, owned: true, played: true, hours: 8, cover: '', genre: 'Racing', addedAt: new Date().toISOString() },
    { id: uid('game'), title: 'Minecraft', platform: 'Nintendo Switch 2', status: 'playing', progress: 20, owned: true, played: true, hours: 14, cover: '', genre: 'Sandbox', addedAt: new Date().toISOString() },
    { id: uid('game'), title: 'Super Smash Bros. Ultimate', platform: 'Nintendo Switch', status: 'backlog', progress: 10, owned: true, played: true, hours: 5, cover: '', genre: 'Fighting', addedAt: new Date().toISOString() }
  ];
  const loganGames = [
    { id: uid('game'), title: 'Minecraft', platform: 'Nintendo Switch 2', status: 'playing', progress: 30, owned: true, played: true, hours: 12, cover: '', genre: 'Sandbox', addedAt: new Date().toISOString() },
    { id: uid('game'), title: 'Mario Kart World', platform: 'Nintendo Switch 2', status: 'backlog', progress: 15, owned: true, played: true, hours: 3, cover: '', genre: 'Racing', addedAt: new Date().toISOString() }
  ];
  return {
    version: 1,
    authenticated: false,
    nintendoAcknowledged: false,
    activeProfileId: zachId,
    profiles: [
      { id: zachId, name: 'Zachariah', role: 'Owner', emoji: '🎮', createdAt: new Date().toISOString() },
      { id: loganId, name: 'Logan', role: 'Child profile', emoji: '🕹️', createdAt: new Date().toISOString() }
    ],
    profileData: {
      [zachId]: profileData(zachGames),
      [loganId]: profileData(loganGames)
    },
    settings: {
      backendUrl: 'http://localhost:8787',
      theme: 'dark',
      releaseFeedUrl: '',
      controllerReminderEnabled: true,
      preferredPlatform: 'Nintendo Switch 2'
    }
  };
}

export function loadState() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      const state = defaultState();
      saveState(state);
      return state;
    }
    const parsed = JSON.parse(raw);
    return migrateState(parsed);
  } catch (error) {
    console.error('State load failed', error);
    const state = defaultState();
    saveState(state);
    return state;
  }
}

function migrateState(state) {
  const defaults = defaultState();
  const merged = { ...defaults, ...state, settings: { ...defaults.settings, ...(state.settings || {}) } };
  merged.profiles = Array.isArray(state.profiles) && state.profiles.length ? state.profiles : defaults.profiles;
  merged.activeProfileId = merged.profiles.some(p => p.id === state.activeProfileId) ? state.activeProfileId : merged.profiles[0].id;
  merged.profileData = state.profileData || {};
  for (const profile of merged.profiles) {
    merged.profileData[profile.id] = { ...profileData(), ...(merged.profileData[profile.id] || {}) };
  }
  return merged;
}

export function saveState(state) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  return state;
}

export function exportState(state) {
  const blob = new Blob([JSON.stringify(state, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = `nexus-gaming-hub-backup-${new Date().toISOString().slice(0, 10)}.json`;
  anchor.click();
  setTimeout(() => URL.revokeObjectURL(url), 500);
}

export async function importState(file) {
  const text = await file.text();
  const parsed = JSON.parse(text);
  if (!parsed || !Array.isArray(parsed.profiles) || !parsed.profileData) throw new Error('This is not a valid Nexus Gaming Hub backup.');
  const migrated = migrateState(parsed);
  saveState(migrated);
  return migrated;
}

export function createProfile(state, name, role = 'Player', emoji = '🎮') {
  const id = uid('profile');
  state.profiles.push({ id, name, role, emoji, createdAt: new Date().toISOString() });
  state.profileData[id] = profileData();
  saveState(state);
  return id;
}

export function removeProfile(state, profileId) {
  if (state.profiles.length <= 1) throw new Error('At least one profile is required.');
  state.profiles = state.profiles.filter(profile => profile.id !== profileId);
  delete state.profileData[profileId];
  if (state.activeProfileId === profileId) state.activeProfileId = state.profiles[0].id;
  saveState(state);
}

export function getActiveProfile(state) {
  return state.profiles.find(profile => profile.id === state.activeProfileId) || state.profiles[0];
}

export function getProfileData(state) {
  return state.profileData[state.activeProfileId];
}

export { uid };

function openMediaDb() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(MEDIA_STORE)) {
        const store = db.createObjectStore(MEDIA_STORE, { keyPath: 'id' });
        store.createIndex('profileId', 'profileId', { unique: false });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

export async function putMedia(record) {
  const db = await openMediaDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(MEDIA_STORE, 'readwrite');
    tx.objectStore(MEDIA_STORE).put(record);
    tx.oncomplete = () => resolve(record);
    tx.onerror = () => reject(tx.error);
  });
}

export async function getMedia(id) {
  const db = await openMediaDb();
  return new Promise((resolve, reject) => {
    const request = db.transaction(MEDIA_STORE).objectStore(MEDIA_STORE).get(id);
    request.onsuccess = () => resolve(request.result || null);
    request.onerror = () => reject(request.error);
  });
}

export async function listMedia(profileId) {
  const db = await openMediaDb();
  return new Promise((resolve, reject) => {
    const request = db.transaction(MEDIA_STORE).objectStore(MEDIA_STORE).index('profileId').getAll(profileId);
    request.onsuccess = () => resolve(request.result || []);
    request.onerror = () => reject(request.error);
  });
}

export async function deleteMedia(id) {
  const db = await openMediaDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(MEDIA_STORE, 'readwrite');
    tx.objectStore(MEDIA_STORE).delete(id);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}
