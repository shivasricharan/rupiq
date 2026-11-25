// All numbers shown in the app come from these pure functions (unit-tested).
import { sum, fmt } from './money.js';
import { addMonths, daysInMonth, dayOf, ymOf, addDays, weekStart, clampDay } from './dates.js';

/** The budget that applies to a month: its own, else the most recent earlier one (marked inherited). */
export function budgetFor(state, ym) {
  const keys = Object.keys(state.budgets).filter(k => k <= ym).sort();
  if (!keys.length) return null;
  const from = keys[keys.length - 1];
  const b = state.budgets[from];
  return { total: b.total, alloc: b.alloc || {}, from, inherited: from !== ym };
}

export const monthTxns = (state, ym) => state.txns.filter(t => t.date.startsWith(ym));

export function expenseByCat(txns) {
  const m = {};
  for (const t of txns) if (t.type === 'expense') m[t.cat] = (m[t.cat] || 0) + t.amount;
  return m;
}

/**
 * Month summary. Definitions (kept deliberately separate — they are NOT interchangeable):
 *  income      = money recorded as received this month
 *  expense     = money recorded as spent this month
 *  budgetTotal = the spending limit you chose (a plan, not money in a bank)
 *  allocated   = part of the budget assigned to categories
 *  remaining   = budgetTotal - expense (can be negative = over plan)
 */
export function monthSummary(state, ym) {
  const tx = monthTxns(state, ym);
  const income = sum(tx.filter(t => t.type === 'income'), t => t.amount);
  const expense = sum(tx.filter(t => t.type === 'expense'), t => t.amount);
  const byCat = expenseByCat(tx);
  const b = budgetFor(state, ym);
  const allocated = b ? sum(Object.values(b.alloc)) : 0;
  const rows = [];
  const ids = new Set([...Object.keys(byCat), ...(b ? Object.keys(b.alloc) : [])]);
  for (const id of ids) {
    const spent = byCat[id] || 0;
    const alloc = b?.alloc[id] || 0;
    rows.push({ cat: id, spent, alloc, left: alloc ? alloc - spent : null });
  }
  rows.sort((a, c) => c.spent - a.spent || c.alloc - a.alloc);
  return {
    ym, income, expense, byCat, rows, count: tx.length,
    budget: b, budgetTotal: b ? b.total : null, allocated,
    unallocated: b ? b.total - allocated : null,
    remaining: b ? b.total - expense : null,
    usedPct: b && b.total > 0 ? (expense / b.total) * 100 : null,
    net: income - expense,
  };
}

const catName = (state, id) => state.categories.find(c => c.id === id)?.name || 'Other';

/** Spending for the same stretch of the previous month (fair comparison while this month is in progress). */
export function prevPeriodByCat(state, ym, today) {
  const prev = addMonths(ym, -1);
  const cutoff = ym === ymOf(today) ? clampDay(prev, dayOf(today)) : `${prev}-31`;
  return expenseByCat(state.txns.filter(t => t.date.startsWith(prev) && t.date <= cutoff));
}

/**
 * Rule-based insights. Each requires enough real data; otherwise it is simply not produced.
 * Returns [{ id, tone: 'good'|'info'|'warn', text }] ordered by importance.
 */
export function insights(state, ym, today) {
  const out = [];
  const cur = ym === ymOf(today);
  const cc = state.profile.currency;
  const f = n => fmt(n, cc);
  const s = monthSummary(state, ym);
  if (!s.count) return out;
  const day = cur ? dayOf(today) : daysInMonth(ym);
  const dim = daysInMonth(ym);

  // 1. Budget usage + pace
  if (s.budgetTotal) {
    const pct = Math.round(s.usedPct);
    if (s.expense > s.budgetTotal) {
      out.push({ id: 'over', tone: 'warn', text: `You're ${f(s.expense - s.budgetTotal)} over this month's budget (${f(s.expense)} spent of ${f(s.budgetTotal)}). You can raise the budget or ease off a few categories.` });
    } else if (pct >= 70) {
      out.push({ id: 'used', tone: pct >= 90 ? 'warn' : 'info', text: `You've used ${pct}% of your monthly budget. ${f(s.remaining)} of the plan is left${cur ? ` for the ${dim - day} days to go` : ''}.` });
    }
    if (cur && day >= 7 && s.expense <= s.budgetTotal) {
      const projected = Math.round((s.expense / day) * dim);
      if (projected > s.budgetTotal * 1.05) {
        out.push({ id: 'pace', tone: 'warn', text: `At the current pace you'd spend about ${f(projected)} by month-end, around ${f(projected - s.budgetTotal)} above your budget.` });
      } else if (day >= 14 && s.expense < s.budgetTotal * (day / dim) * 0.8) {
        out.push({ id: 'under', tone: 'good', text: `You're spending slower than planned — ${f(s.expense)} so far, with ${Math.round((day / dim) * 100)}% of the month gone.` });
      }
    }
  }

  // 2. Category limits
  for (const r of s.rows) {
    if (!r.alloc) continue;
    const name = catName(state, r.cat);
    if (r.spent > r.alloc) out.push({ id: 'catover-' + r.cat, tone: 'warn', text: `${name} is ${f(r.spent - r.alloc)} over its ${f(r.alloc)} limit.` });
    else if (r.spent === r.alloc) out.push({ id: 'catfull-' + r.cat, tone: 'info', text: `${name} has reached its ${f(r.alloc)} limit.` });
    else if (r.spent >= r.alloc * 0.8) out.push({ id: 'catnear-' + r.cat, tone: 'info', text: `${name} is approaching its limit: ${f(r.spent)} of ${f(r.alloc)} used.` });
  }

  // 3. Change vs last month (same stretch of days)
  const prev = prevPeriodByCat(state, ym, today);
  const comps = [];
  for (const [id, v] of Object.entries(s.byCat)) {
    const p = prev[id] || 0;
    if (p >= 500_00 && v >= p * 1.2 && v - p >= 300_00) comps.push({ id, v, p });
  }
  comps.sort((a, b) => (b.v - b.p) - (a.v - a.p));
  for (const c of comps.slice(0, 2)) {
    out.push({ id: 'up-' + c.id, tone: 'info', text: `${catName(state, c.id)} is up ${Math.round(((c.v - c.p) / c.p) * 100)}% compared with the same stretch of last month (${f(c.v)} vs ${f(c.p)}).` });
  }

  // 4. Highest discretionary category (needs at least two discretionary categories with spending)
  const disc = state.categories.filter(c => c.d && s.byCat[c.id]).map(c => ({ c, v: s.byCat[c.id] })).sort((a, b) => b.v - a.v);
  if (disc.length >= 2 && s.expense > 0) {
    out.push({ id: 'disc', tone: 'info', text: `${disc[0].c.name} is your highest "nice-to-have" category at ${f(disc[0].v)} (${Math.round((disc[0].v / s.expense) * 100)}% of this month's spending).` });
  }

  // 5. This week vs usual weekly pattern (needs 3 of the previous 4 weeks to have spending)
  if (cur) {
    const ws = weekStart(today);
    const span = (start, end) => sum(state.txns.filter(t => t.type === 'expense' && t.date >= start && t.date <= end), t => t.amount);
    const offset = Math.round((Date.parse(today) - Date.parse(ws)) / 86400000);
    const thisWeek = span(ws, today);
    const prior = [1, 2, 3, 4].map(k => span(addDays(ws, -7 * k), addDays(ws, -7 * k + offset)));
    const nonZero = prior.filter(x => x > 0).length;
    if (nonZero >= 3) {
      const avg = Math.round(sum(prior) / 4);
      if (thisWeek > avg * 1.25 && thisWeek - avg >= 500_00) {
        out.push({ id: 'week', tone: 'info', text: `This week's spending (${f(thisWeek)}) is higher than your usual for this point in the week (about ${f(avg)}).` });
      }
    }
  }

  const rank = { warn: 0, info: 1, good: 2 };
  return out.sort((a, b) => rank[a.tone] - rank[b.tone]);
}

/** How many days of data exist — used to explain why insights are sparse. */
export function dataSpanDays(state) {
  if (!state.txns.length) return 0;
  const ds = state.txns.map(t => t.date).sort();
  return Math.round((Date.parse(ds[ds.length - 1]) - Date.parse(ds[0])) / 86400000) + 1;
}

/** Filter + search used by the history screen. */
export function filterTxns(state, { ym = null, type = 'all', cat = '', pay = '', q = '' } = {}) {
  const needle = q.trim().toLowerCase();
  const names = new Map(state.categories.map(c => [c.id, c.name.toLowerCase()]));
  return state.txns
    .filter(t => (!ym || t.date.startsWith(ym)) && (type === 'all' || t.type === type) && (!cat || t.cat === cat) && (!pay || t.pay === pay)
      && (!needle || t.note.toLowerCase().includes(needle) || (names.get(t.cat) || '').includes(needle) || String(t.amount / 100).includes(needle)))
    .sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : (b.created || '').localeCompare(a.created || '') || (a.id < b.id ? 1 : -1)));
}

export function toCSV(state) {
  const esc = v => { let s = String(v ?? ''); if (/^[=+\-@\t\r]/.test(s)) s = "'" + s; return /[",\n\r]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s; };
  const names = new Map(state.categories.map(c => [c.id, c.name]));
  const rows = [['Date', 'Type', 'Category', 'Amount', 'Payment method', 'Note']];
  for (const t of [...state.txns].sort((a, b) => (a.date < b.date ? -1 : 1))) {
    rows.push([t.date, t.type, names.get(t.cat) || t.cat, (t.amount / 100).toFixed(2), t.pay, t.note]);
  }
  return '﻿' + rows.map(r => r.map(esc).join(',')).join('\r\n');
}
