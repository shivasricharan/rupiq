// Persistence: IndexedDB (preferred) with a localStorage fallback. Nothing leaves the device.
import { emptyState, normalize } from './data.js';

const DB_NAME = 'rupiq';
const STORE = 'kv';
let dbp = null;
let backend = 'indexeddb';

function openDB() {
  if (dbp) return dbp;
  dbp = new Promise((resolve, reject) => {
    if (!globalThis.indexedDB) return reject(new Error('IndexedDB unavailable'));
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => { if (!req.result.objectStoreNames.contains(STORE)) req.result.createObjectStore(STORE); };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error || new Error('IndexedDB open failed'));
    req.onblocked = () => reject(new Error('IndexedDB blocked'));
  });
  return dbp;
}

async function idbGet(key) {
  const db = await openDB();
  return new Promise((res, rej) => { const r = db.transaction(STORE).objectStore(STORE).get(key); r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); });
}
async function idbSet(key, val) {
  const db = await openDB();
  return new Promise((res, rej) => {
    const tx = db.transaction(STORE, 'readwrite');
    tx.objectStore(STORE).put(val, key);
    tx.oncomplete = () => res();
    tx.onerror = () => rej(tx.error);
    tx.onabort = () => rej(tx.error || new Error('Write aborted'));
  });
}
async function idbDel(key) {
  const db = await openDB();
  return new Promise((res, rej) => { const tx = db.transaction(STORE, 'readwrite'); tx.objectStore(STORE).delete(key); tx.oncomplete = () => res(); tx.onerror = () => rej(tx.error); });
}

async function get(key) {
  if (backend === 'indexeddb') {
    try { return await idbGet(key); } catch { backend = 'localstorage'; }
  }
  const s = localStorage.getItem('rupiq:' + key);
  return s ? JSON.parse(s) : undefined;
}
async function set(key, val) {
  if (backend === 'indexeddb') {
    try { return await idbSet(key, val); } catch (e) { if (e?.name === 'QuotaExceededError') throw e; backend = 'localstorage'; }
  }
  localStorage.setItem('rupiq:' + key, JSON.stringify(val));
}
async function del(key) {
  if (backend === 'indexeddb') { try { return await idbDel(key); } catch { backend = 'localstorage'; } }
  localStorage.removeItem('rupiq:' + key);
}

export const backendName = () => backend;

/** Which dataset is active: 'main' (real) or 'demo' (sample data). Kept in localStorage so it is readable synchronously. */
export const getMode = () => { try { return localStorage.getItem('rupiq:mode') === 'demo' ? 'demo' : 'main'; } catch { return 'main'; } };
export const setMode = m => { try { localStorage.setItem('rupiq:mode', m); } catch { /* ignore */ } };

export async function load(key = 'main') {
  const raw = await get(key);
  if (raw === undefined) return { state: emptyState(), fresh: true, problems: [] };
  const n = normalize(raw);
  if (!n.ok) throw new Error('Saved data could not be read: ' + n.problems.join(' '));
  return { state: n.state, fresh: false, problems: n.problems };
}

// Saves are serialised so rapid edits can never land out of order.
let chain = Promise.resolve();
export function save(key, state) {
  const snapshot = JSON.parse(JSON.stringify(state));
  const run = () => set(key, snapshot);
  const p = chain.then(run, run);
  chain = p.catch(() => {});
  return p;
}

/** One-step safety copy taken before imports / wipes so a mistake can be undone. */
export async function saveSafetyCopy(state, reason) {
  await set('safety', { at: new Date().toISOString(), reason, state: JSON.parse(JSON.stringify(state)) });
}
export async function getSafetyCopy() {
  const s = await get('safety');
  if (!s) return null;
  const n = normalize(s.state);
  return n.ok ? { at: s.at, reason: s.reason, state: n.state } : null;
}
export async function wipeAll() {
  await del('main'); await del('demo'); await del('safety');
}

export async function persistence() {
  const out = { persisted: null, usage: null, quota: null };
  try { if (navigator.storage?.persisted) out.persisted = await navigator.storage.persisted(); } catch { /* ignore */ }
  try { const e = await navigator.storage?.estimate?.(); if (e) { out.usage = e.usage; out.quota = e.quota; } } catch { /* ignore */ }
  return out;
}
export async function requestPersistence() {
  try { return (await navigator.storage?.persist?.()) ?? false; } catch { return false; }
}
