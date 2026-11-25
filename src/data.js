// Data model, defaults, validation and migration.
import { isValidDate } from './dates.js';

export const SCHEMA_VERSION = 1;
export const PAY_METHODS = ['UPI', 'Cash', 'Card', 'Net banking', 'Other'];

// d = discretionary (nice-to-have) spending; used only for the "highest discretionary" insight.
export const DEFAULT_CATEGORIES = [
  { id: 'groceries', name: 'Groceries', emoji: '🛒', kind: 'expense', d: false },
  { id: 'veg-milk', name: 'Vegetables & milk', emoji: '🥛', kind: 'expense', d: false },
  { id: 'rent', name: 'Rent / EMI', emoji: '🏠', kind: 'expense', d: false },
  { id: 'utilities', name: 'Electricity & utilities', emoji: '💡', kind: 'expense', d: false },
  { id: 'recharge', name: 'Mobile & internet', emoji: '📱', kind: 'expense', d: false },
  { id: 'fuel', name: 'Fuel', emoji: '⛽', kind: 'expense', d: false },
  { id: 'transport', name: 'Auto, cab & metro', emoji: '🛺', kind: 'expense', d: false },
  { id: 'food-delivery', name: 'Food delivery', emoji: '🍔', kind: 'expense', d: true },
  { id: 'eating-out', name: 'Eating out', emoji: '🍽️', kind: 'expense', d: true },
  { id: 'shopping', name: 'Shopping', emoji: '🛍️', kind: 'expense', d: true },
  { id: 'health', name: 'Medicines & health', emoji: '💊', kind: 'expense', d: false },
  { id: 'school', name: 'School & education', emoji: '🎒', kind: 'expense', d: false },
  { id: 'subscriptions', name: 'Subscriptions', emoji: '📺', kind: 'expense', d: true },
  { id: 'family', name: 'Family & occasions', emoji: '🎉', kind: 'expense', d: true },
  { id: 'travel', name: 'Travel & outings', emoji: '🧳', kind: 'expense', d: true },
  { id: 'other', name: 'Other', emoji: '🧾', kind: 'expense', d: false },
  { id: 'salary', name: 'Salary', emoji: '💼', kind: 'income', d: false },
  { id: 'freelance', name: 'Freelance', emoji: '💻', kind: 'income', d: false },
  { id: 'business', name: 'Business', emoji: '🏪', kind: 'income', d: false },
  { id: 'other-income', name: 'Other income', emoji: '✨', kind: 'income', d: false },
];

export const uid = () => (globalThis.crypto?.randomUUID?.() ?? `id-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`);

export function emptyState() {
  return {
    v: SCHEMA_VERSION,
    profile: { name: '', currency: 'INR' },
    categories: DEFAULT_CATEGORIES.map(c => ({ ...c })),
    budgets: {}, // { 'YYYY-MM': { total: paise, alloc: { catId: paise } } }
    txns: [],
    prefs: { theme: 'auto', onboarded: false, lastExport: null, lastPay: 'UPI', created: new Date().toISOString() },
  };
}

const isInt = n => Number.isSafeInteger(n) && n >= 0;

/**
 * Validate + normalise anything claiming to be Rupiq data (from storage or an imported file).
 * Returns { ok, state, problems, skipped }. Never throws. Invalid transactions are skipped, not guessed at.
 */
export function normalize(raw) {
  const problems = [];
  let skipped = 0;
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return { ok: false, problems: ['This is not a Rupiq backup file.'] };
  if (typeof raw.v !== 'number' || raw.v > SCHEMA_VERSION) {
    return { ok: false, problems: ['This backup was made by a newer version of Rupiq. Please update the app first.'] };
  }
  const base = emptyState();
  const s = {
    v: SCHEMA_VERSION,
    profile: {
      name: typeof raw.profile?.name === 'string' ? raw.profile.name.slice(0, 40) : '',
      currency: ['INR', 'USD', 'EUR', 'GBP', 'AED', 'SGD'].includes(raw.profile?.currency) ? raw.profile.currency : 'INR',
    },
    categories: [],
    budgets: {},
    txns: [],
    prefs: { ...base.prefs, ...(raw.prefs && typeof raw.prefs === 'object' ? raw.prefs : {}) },
  };
  const seenCat = new Set();
  for (const c of Array.isArray(raw.categories) ? raw.categories : []) {
    if (!c || typeof c.id !== 'string' || typeof c.name !== 'string' || !['expense', 'income'].includes(c.kind) || seenCat.has(c.id)) { continue; }
    seenCat.add(c.id);
    s.categories.push({ id: c.id, name: c.name.slice(0, 40), emoji: String(c.emoji || '🧾').slice(0, 8), kind: c.kind, d: !!c.d, archived: !!c.archived });
  }
  if (!s.categories.length) s.categories = base.categories;
  for (const [ym, b] of Object.entries(raw.budgets && typeof raw.budgets === 'object' ? raw.budgets : {})) {
    if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(ym) || !b || !isInt(b.total)) { problems.push(`Skipped an invalid budget (${ym}).`); continue; }
    const alloc = {};
    for (const [k, v] of Object.entries(b.alloc || {})) if (isInt(v) && v > 0) alloc[k] = v;
    s.budgets[ym] = { total: b.total, alloc };
  }
  const seen = new Set();
  const catIds = new Set(s.categories.map(c => c.id));
  for (const t of Array.isArray(raw.txns) ? raw.txns : []) {
    const good = t && typeof t.id === 'string' && ['expense', 'income'].includes(t.type) && Number.isSafeInteger(t.amount) && t.amount > 0
      && isValidDate(t.date) && catIds.has(t.cat) && !seen.has(t.id);
    if (!good) { skipped++; continue; }
    seen.add(t.id);
    s.txns.push({
      id: t.id, type: t.type, amount: t.amount, cat: t.cat, date: t.date,
      note: typeof t.note === 'string' ? t.note.slice(0, 200) : '',
      pay: PAY_METHODS.includes(t.pay) ? t.pay : 'Other',
      created: t.created || null, updated: t.updated || null,
    });
  }
  if (skipped) problems.push(`${skipped} record${skipped > 1 ? 's' : ''} could not be read and ${skipped > 1 ? 'were' : 'was'} skipped.`);
  return { ok: true, state: s, problems, skipped };
}

/** Sample data for the clearly-labelled demo mode only. Dates are relative to `today`. */
export function demoState(today, addMonthsFn, clampFn) {
  const s = emptyState();
  s.profile.name = 'Demo';
  s.prefs.onboarded = true;
  const ym = today.slice(0, 7);
  const prev = addMonthsFn(ym, -1);
  const T = [];
  const add = (m, day, cat, rupees, note, pay = 'UPI', type = 'expense') => {
    const date = clampFn(m, day);
    if (date > today) return;
    T.push({ id: uid(), type, amount: rupees * 100, cat, date, note, pay, created: null, updated: null });
  };
  for (const m of [prev, ym]) {
    add(m, 1, 'salary', 85000, 'Monthly salary', 'Net banking', 'income');
    add(m, 2, 'rent', 18000, 'House rent', 'Net banking');
    add(m, 3, 'utilities', m === ym ? 2400 : 1900, 'Electricity bill');
    add(m, 4, 'recharge', 799, 'Mobile recharge');
    add(m, 5, 'groceries', 3200, 'Monthly kirana', 'UPI');
    add(m, 8, 'groceries', m === ym ? 3800 : 2100, 'Supermarket', 'Card');
    add(m, 6, 'food-delivery', 540, 'Dinner order');
    add(m, 12, 'food-delivery', m === ym ? 1250 : 480, 'Weekend order');
    add(m, 9, 'fuel', 1500, 'Petrol', 'Cash');
    add(m, 11, 'transport', 620, 'Cabs');
    add(m, 14, 'shopping', m === ym ? 3500 : 1200, 'Clothes', 'Card');
    add(m, 7, 'veg-milk', 650, 'Milk & vegetables', 'Cash');
    add(m, 15, 'veg-milk', 700, 'Vegetables', 'Cash');
    add(m, 16, 'subscriptions', 649, 'OTT plan', 'Card');
  }
  s.txns = T;
  s.budgets[ym] = { total: 50000_00, alloc: { groceries: 8000_00, 'veg-milk': 3000_00, rent: 18000_00, utilities: 3000_00, fuel: 2000_00, 'food-delivery': 1500_00, shopping: 3000_00, transport: 1500_00 } };
  return s;
}
