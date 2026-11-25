// Rupiq — UI. Vanilla ES modules, no framework, no network calls.
import { parseAmount, toInputString, fmt, CURRENCIES, sum } from './money.js';
import { todayIST, ymOf, addMonths, monthLabel, dayLabel, isValidDate, clampDay } from './dates.js';
import { emptyState, normalize, demoState, uid, PAY_METHODS } from './data.js';
import { monthSummary, insights, filterTxns, toCSV, budgetFor, monthTxns, dataSpanDays } from './calc.js';
import * as store from './store.js';

const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

let state = emptyState();
let mode = 'main';
let ui = { ym: todayIST().slice(0, 7), hist: { scope: 'month', type: 'all', cat: '', pay: '', q: '', limit: 150 }, saveError: false, loadError: null, installEvt: null };
let onboard = { step: 0, name: '', currency: 'INR', target: '', picked: null };

const m = n => fmt(n, state.profile.currency);
const key = () => (mode === 'demo' ? 'demo' : 'main');
const catOf = id => state.categories.find(c => c.id === id) || { id, name: 'Deleted category', emoji: '🧾', kind: 'expense' };
const activeCats = kind => state.categories.filter(c => c.kind === kind && !c.archived);

/* ---------- icons ---------- */
const ICONS = {
  home: '<path d="M3 11l9-8 9 8v9a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z"/>',
  list: '<path d="M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01"/>',
  pie: '<path d="M12 3v9h9a9 9 0 1 1-9-9z"/><path d="M15 3.5A9 9 0 0 1 20.5 9H15z"/>',
  gear: '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  info: '<circle cx="12" cy="12" r="9"/><path d="M12 11v5M12 8h.01"/>',
};
const ico = n => `<svg class="ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICONS[n]}</svg>`;
const LOGO = '<svg class="logo" viewBox="0 0 512 512" aria-hidden="true"><rect width="512" height="512" rx="112" fill="#0F6B5C"/><circle cx="256" cy="256" r="150" fill="#F2A33A"/><path d="M190 180h132M190 226h132M200 180c60 0 92 24 92 56s-32 56-92 56l82 82" fill="none" stroke="#0B3F37" stroke-width="30" stroke-linecap="round" stroke-linejoin="round"/></svg>';

/* ---------- persistence ---------- */
function persist() {
  return store.save(key(), state).then(() => { if (ui.saveError) { ui.saveError = false; renderBanners(); } })
    .catch(() => { ui.saveError = true; renderBanners(); });
}
function commit(fn) { fn(state); persist(); render(); }

/* ---------- toasts & sheets ---------- */
let toastTimer;
function toast(msg, action) {
  const root = $('#toast-root');
  root.innerHTML = `<div class="toast"><span>${esc(msg)}</span>${action ? `<button class="link" data-act="toast-action">${esc(action.label)}</button>` : ''}</div>`;
  const t = $('.toast', root);
  if (action) $('[data-act=toast-action]', root).onclick = () => { clearTimeout(toastTimer); root.innerHTML = ''; action.run(); };
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { if (t.isConnected) root.innerHTML = ''; }, action ? 7000 : 3200);
}

let sheetOpener = null;
function closeSheet() {
  $('#sheet-root').innerHTML = '';
  document.body.classList.remove('noscroll');
  if (sheetOpener?.isConnected) sheetOpener.focus();
  sheetOpener = null;
}
function openSheet(title, body, { wide = false } = {}) {
  if (!$('#sheet-root .sheet')) sheetOpener = document.activeElement;
  $('#sheet-root').innerHTML = `<div class="backdrop" data-act="close-sheet"></div>
    <section class="sheet ${wide ? 'wide' : ''}" role="dialog" aria-modal="true" aria-label="${esc(title)}">
      <header class="sheet-h"><h2>${esc(title)}</h2><button class="icon-btn" data-act="close-sheet" aria-label="Close">✕</button></header>
      <div class="sheet-b">${body}</div></section>`;
  document.body.classList.add('noscroll');
  applyWidths($('#sheet-root'));
  return $('#sheet-root .sheet-b');
}
function applyWidths(root) { $$('[data-w]', root).forEach(e => { e.style.width = e.dataset.w + '%'; }); $$('[data-l]', root).forEach(e => { e.style.left = e.dataset.l + '%'; }); }
document.addEventListener('keydown', e => {
  if (e.key === 'Escape' && $('#sheet-root .sheet')) closeSheet();
  if (e.key === 'Tab' && $('#sheet-root .sheet')) { // keep focus inside the open dialog
    const f = $$('#sheet-root button, #sheet-root input, #sheet-root select, #sheet-root textarea, #sheet-root a[href]').filter(x => !x.disabled && x.offsetParent !== null);
    if (!f.length) return;
    const first = f[0], last = f[f.length - 1];
    if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
    else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
    else if (!$('#sheet-root .sheet').contains(document.activeElement)) { e.preventDefault(); first.focus(); }
  }
});

/* ---------- small view helpers ---------- */
const pctClamp = (v, max = 100) => Math.max(0, Math.min(max, v));
const bar = (pct, tone = '') => `<div class="bar ${tone}" role="presentation"><i data-w="${pctClamp(pct).toFixed(1)}"></i></div>`;
function monthBar() {
  const cur = ymOf(todayIST());
  return `<div class="monthbar"><button class="icon-btn" data-act="month-prev" aria-label="Previous month">‹</button>
    <div class="month-label">${monthLabel(ui.ym)}</div>
    <button class="icon-btn" data-act="month-next" aria-label="Next month" ${ui.ym >= cur ? 'disabled' : ''}>›</button></div>`;
}
function txnRow(t, showDate, today) {
  const c = catOf(t.cat);
  const sub = [c.name, t.pay, showDate ? dayLabel(t.date, today) : ''].filter(Boolean).join(' · ');
  return `<button class="txn" data-act="edit" data-id="${esc(t.id)}">
    <span class="bubble" aria-hidden="true">${esc(c.emoji)}</span>
    <span class="txn-main"><span class="txn-title">${esc(t.note || c.name)}</span><span class="txn-sub">${esc(sub)}</span></span>
    <span class="amt ${t.type}">${t.type === 'income' ? '+' : '−'}${m(t.amount)}</span></button>`;
}
const empty = (emoji, title, text, btn = '') => `<div class="empty"><div class="empty-e" aria-hidden="true">${emoji}</div><h3>${esc(title)}</h3><p>${esc(text)}</p>${btn}</div>`;

/* ---------- shell / banners ---------- */
function renderBanners() {
  const el = $('#banners');
  if (!el) return;
  let h = '';
  if (mode === 'demo') h += `<div class="banner demo"><span><b>Sample data.</b> You're exploring a demo — none of this is yours.</span><button class="btn small" data-act="exit-demo">Exit demo</button></div>`;
  if (ui.saveError) h += `<div class="banner err" role="alert"><span><b>Couldn't save your last change.</b> Storage may be full or blocked in this browser. Export a backup now so nothing is lost.</span><button class="btn small" data-act="export-json">Export</button></div>`;
  if (store.backendName() === 'localstorage') h += `<div class="banner warn"><span>Your browser is limiting storage, so Rupiq is using a smaller fallback. Back up often.</span></div>`;
  el.innerHTML = h;
}
const NAV = [['home', 'Home', 'home'], ['history', 'History', 'list'], ['budget', 'Budget', 'pie'], ['more', 'More', 'gear']];
function route() { const r = (location.hash.replace(/^#\/?/, '') || 'home').split('?')[0]; return NAV.some(n => n[0] === r) ? r : 'home'; }
function shell(r, inner) {
  const link = ([id, label, icon]) => `<a class="nav-item ${r === id ? 'on' : ''}" href="#/${id}" ${r === id ? 'aria-current="page"' : ''}>${ico(icon)}<span>${label}</span></a>`;
  return `<div class="layout">
    <aside class="side"><div class="brand">${LOGO}<span>Rupiq</span></div><nav aria-label="Main">${NAV.map(link).join('')}</nav>
      <button class="btn primary block" data-act="add">${ico('plus')} Add transaction</button></aside>
    <div class="content"><div id="banners"></div><main id="view" tabindex="-1">${inner}</main></div>
    <nav class="tabbar" aria-label="Main">${link(NAV[0])}${link(NAV[1])}
      <button class="fab" data-act="add" aria-label="Add transaction">${ico('plus')}</button>${link(NAV[2])}${link(NAV[3])}</nav></div>`;
}

/* ---------- Home ---------- */
function viewHome() {
  const today = todayIST();
  const s = monthSummary(state, ui.ym);
  const ins = insights(state, ui.ym, today);
  const cur = ui.ym === ymOf(today);
  const name = state.profile.name ? esc(state.profile.name) : '';
  const hour = Number(new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Kolkata', hour: '2-digit', hour12: false }).format(new Date()));
  const greet = hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening';
  let h = `<header class="page-h"><div><p class="eyebrow">${greet}${name ? ', ' + name : ''}</p><h1>Where your money is going</h1></div></header>${monthBar()}`;

  if (!s.count) {
    h += empty('🌱', cur ? 'A fresh month' : 'Nothing recorded', cur ? 'Add your first expense — it takes about five seconds. Rupiq does the sums.' : 'No transactions were recorded in this month.', `<button class="btn primary" data-act="add">Add an expense</button>`);
    return h + (!s.budget ? budgetNudge() : '');
  }

  // Hero: spent vs budget
  let hero = `<section class="card hero"><div class="hero-top"><div><p class="label">Spent in ${monthLabel(ui.ym).split(' ')[0]}</p><p class="big">${m(s.expense)}</p></div><button class="icon-btn" data-act="explain" aria-label="What do these numbers mean?">${ico('info')}</button></div>`;
  if (s.budgetTotal) {
    const over = s.expense > s.budgetTotal;
    const day = cur ? Number(today.slice(8)) : null;
    const dim = new Date(Date.UTC(+ui.ym.slice(0, 4), +ui.ym.slice(5), 0)).getUTCDate();
    hero += `<div class="meter ${over ? 'over' : s.usedPct >= 85 ? 'near' : ''}">${bar(s.usedPct, over ? 'over' : s.usedPct >= 85 ? 'near' : '')}${cur && s.budgetTotal ? `<span class="pace" data-l="${((day / dim) * 100).toFixed(1)}" title="Where an even pace would be today"></span>` : ''}</div>
      <p class="hero-line">${over ? `<b>${m(s.expense - s.budgetTotal)}</b> over your ${m(s.budgetTotal)} budget` : `<b>${m(s.remaining)}</b> left of your ${m(s.budgetTotal)} budget`}</p>
      <p class="hint">Budget left is your spending plan — not your bank balance.${s.budget.inherited ? ` Using your plan from ${monthLabel(s.budget.from)}.` : ''}</p>`;
  } else {
    hero += `<p class="hint">No budget set for this month.</p><button class="btn small" data-act="edit-budget">Set a monthly budget</button>`;
  }
  h += hero + '</section>';

  h += `<section class="stats" aria-label="Month at a glance">
    <div class="stat"><p class="label">Money in</p><p class="num in">${m(s.income)}</p></div>
    <div class="stat"><p class="label">Money out</p><p class="num">${m(s.expense)}</p></div>
    <div class="stat"><p class="label">${s.budgetTotal ? (s.remaining < 0 ? 'Over budget' : 'Budget left') : 'Income − spent'}</p><p class="num ${(s.budgetTotal ? s.remaining : s.net) < 0 ? 'neg' : ''}">${s.budgetTotal ? m(Math.abs(s.remaining)) : (s.net < 0 ? '−' : '') + m(Math.abs(s.net))}</p></div></section>`;

  if (mode === 'main' && exportDue()) h += `<section class="card nudge"><p><b>Back up your data.</b> Everything lives only on this device. A quick export keeps it safe if you ever switch phones or clear your browser.</p><div class="row"><button class="btn small primary" data-act="export-json">Export backup</button><button class="btn small" data-act="snooze-export">Later</button></div></section>`;

  // Insights
  h += `<section class="card"><h2 class="sec">Worth a look</h2>`;
  if (ins.length) h += `<ul class="insights">${ins.slice(0, 4).map(i => `<li class="${i.tone}"><span class="dot" aria-hidden="true"></span><span>${esc(i.text)}</span></li>`).join('')}</ul>`;
  else if (!s.budget || dataSpanDays(state) < 7) h += `<p class="muted">Insights appear as you add more. With a budget set and about a week of entries, Rupiq will point out what's worth attention.</p>`;
  else h += `<p class="muted">Nothing needs your attention right now.</p>`;
  h += '</section>';

  // Where it's going
  const top = s.rows.filter(r => r.spent > 0).slice(0, 5);
  if (top.length) {
    h += `<section class="card"><div class="sec-row"><h2 class="sec">Where it's going</h2><a class="link" href="#/budget">All categories</a></div><ul class="cats">${top.map(r => {
      const c = catOf(r.cat); const pct = s.expense ? (r.spent / s.expense) * 100 : 0;
      return `<li><span class="bubble sm" aria-hidden="true">${esc(c.emoji)}</span><div class="grow"><div class="between"><span>${esc(c.name)}</span><b>${m(r.spent)}</b></div>${bar(pct)}<p class="tiny muted">${Math.round(pct)}% of spending</p></div></li>`;
    }).join('')}</ul></section>`;
  }

  const recent = filterTxns(state, { ym: ui.ym }).slice(0, 5);
  h += `<section class="card"><div class="sec-row"><h2 class="sec">Recent</h2><a class="link" href="#/history">See all</a></div><div class="txns">${recent.map(t => txnRow(t, true, today)).join('')}</div></section>`;
  return h;
}
function budgetNudge() {
  return `<section class="card nudge"><p><b>Set a monthly budget</b> to see how much of your plan is left as you spend.</p><button class="btn small primary" data-act="edit-budget">Set budget</button></section>`;
}
function exportDue() {
  if (state.txns.length < 15) return false;
  const now = Date.now();
  if (state.prefs.snoozeUntil && now < state.prefs.snoozeUntil) return false;
  return !state.prefs.lastExport || now - Date.parse(state.prefs.lastExport) > 30 * 86400000;
}

/* ---------- History ---------- */
function histFiltered() {
  const f = ui.hist;
  return filterTxns(state, { ym: f.scope === 'month' ? ui.ym : null, type: f.type, cat: f.cat, pay: f.pay, q: f.q });
}
function histListHtml() {
  const today = todayIST();
  const list = histFiltered();
  const f = ui.hist;
  const inc = sum(list.filter(t => t.type === 'income'), t => t.amount);
  const out = sum(list.filter(t => t.type === 'expense'), t => t.amount);
  const filtered = f.type !== 'all' || f.cat || f.pay || f.q.trim();
  let h = `<p class="sumline"><span>${list.length} transaction${list.length === 1 ? '' : 's'}</span><span>In <b class="in">${m(inc)}</b></span><span>Out <b>${m(out)}</b></span></p>`;
  if (!list.length) {
    return h + (filtered ? empty('🔍', 'No matches', 'Try a different search or clear the filters.', `<button class="btn" data-act="clear-filters">Clear filters</button>`)
      : empty('🧾', 'No transactions yet', f.scope === 'month' ? 'Nothing recorded in this month.' : 'Add your first transaction to start your history.', `<button class="btn primary" data-act="add">Add transaction</button>`));
  }
  const shown = list.slice(0, f.limit);
  let day = '';
  for (const t of shown) {
    if (t.date !== day) {
      if (day) h += '</div>';
      day = t.date;
      const dayOut = sum(list.filter(x => x.date === day && x.type === 'expense'), x => x.amount);
      h += `<div class="day"><h3>${dayLabel(day, today)}</h3>${dayOut ? `<span class="muted">−${m(dayOut)}</span>` : ''}</div><div class="txns">`;
    }
    h += txnRow(t, false, today);
  }
  h += '</div>';
  if (list.length > shown.length) h += `<button class="btn block" data-act="more-rows">Show more (${list.length - shown.length} older)</button>`;
  return h;
}
function viewHistory() {
  const f = ui.hist;
  const catOpts = state.categories.map(c => `<option value="${esc(c.id)}" ${f.cat === c.id ? 'selected' : ''}>${esc(c.emoji)} ${esc(c.name)}${c.archived ? ' (hidden)' : ''}</option>`).join('');
  return `<header class="page-h"><div><h1>History</h1></div></header>
    <div class="seg" role="group" aria-label="Time range"><button class="${f.scope === 'month' ? 'on' : ''}" data-act="scope" data-v="month" aria-pressed="${f.scope === 'month'}">By month</button><button class="${f.scope === 'all' ? 'on' : ''}" data-act="scope" data-v="all" aria-pressed="${f.scope === 'all'}">All time</button></div>
    ${f.scope === 'month' ? monthBar() : ''}
    <div class="filters"><input id="q" type="search" class="input" placeholder="Search notes, categories, amounts" value="${esc(f.q)}" aria-label="Search transactions" autocomplete="off">
      <div class="seg small" role="group" aria-label="Type">${['all', 'expense', 'income'].map(v => `<button class="${f.type === v ? 'on' : ''}" data-act="ftype" data-v="${v}" aria-pressed="${f.type === v}">${v === 'all' ? 'All' : v === 'expense' ? 'Spent' : 'Received'}</button>`).join('')}</div>
      <div class="two"><select id="fcat" class="input" aria-label="Category"><option value="">All categories</option>${catOpts}</select>
      <select id="fpay" class="input" aria-label="Payment method"><option value="">Any payment</option>${PAY_METHODS.map(p => `<option ${f.pay === p ? 'selected' : ''}>${p}</option>`).join('')}</select></div></div>
    <div id="hist-list">${histListHtml()}</div>`;
}

/* ---------- Budget ---------- */
function viewBudget() {
  const today = todayIST();
  const s = monthSummary(state, ui.ym);
  let h = `<header class="page-h"><div><h1>Budget</h1><p class="muted">Your plan for the month — separate from what's in your bank.</p></div></header>${monthBar()}`;
  if (!s.budget) {
    const prev = monthSummary(state, addMonths(ui.ym, -1));
    h += empty('🎯', 'No budget for this month', prev.expense ? `Last month you spent ${m(prev.expense)}. A budget helps you see how much room is left as the month goes on.` : 'Pick a monthly spending limit. You can change it any time.', `<button class="btn primary" data-act="edit-budget">Set monthly budget</button>`);
  } else {
    const over = s.expense > s.budgetTotal;
    h += `<section class="card"><div class="between"><div><p class="label">Monthly budget</p><p class="big">${m(s.budgetTotal)}</p></div><button class="btn small" data-act="edit-budget">Change</button></div>
      <div class="grid4">
        <div><p class="label">Planned in categories</p><b>${m(s.allocated)}</b></div>
        <div><p class="label">${s.unallocated < 0 ? 'Planned beyond budget' : 'Not yet planned'}</p><b>${m(Math.abs(s.unallocated))}</b></div>
        <div><p class="label">Spent so far</p><b>${m(s.expense)}</b></div>
        <div><p class="label">${over ? 'Over budget by' : 'Budget left'}</p><b class="${over ? 'neg' : ''}">${m(Math.abs(s.remaining))}</b></div></div>
      ${s.unallocated < 0 ? `<p class="hint">Your category plans add up to ${m(-s.unallocated)} more than the total budget. That's allowed — you may want to lower a category or raise the total.</p>` : ''}
      ${over ? `<p class="hint">You've gone past the plan this month — that happens. Raise the budget or trim categories below whenever you like.</p>` : ''}
      ${s.budget.inherited ? `<p class="hint">This is your ${monthLabel(s.budget.from)} plan carried forward. Changing anything here saves a plan for ${monthLabel(ui.ym)} only.</p>` : ''}</section>`;
  }
  const ids = new Set(s.rows.map(r => r.cat));
  const list = activeCats('expense').map(c => c.id);
  for (const id of ids) if (!list.includes(id)) list.push(id);
  const rowFor = id => s.rows.find(r => r.cat === id) || { cat: id, spent: 0, alloc: 0, left: null };
  const rows = list.map(rowFor).sort((a, b) => (b.alloc > 0) - (a.alloc > 0) || b.spent - a.spent);
  h += `<section class="card"><h2 class="sec">Categories</h2><p class="tiny muted">Tap a category to set how much you'd like to spend on it.</p><ul class="cats tap">${rows.map(r => {
    const c = catOf(r.cat); const pct = r.alloc ? (r.spent / r.alloc) * 100 : 0; const o = r.alloc && r.spent > r.alloc;
    return `<li><button data-act="edit-alloc" data-id="${esc(r.cat)}"><span class="bubble sm" aria-hidden="true">${esc(c.emoji)}</span><div class="grow"><div class="between"><span>${esc(c.name)}</span><span><b>${m(r.spent)}</b>${r.alloc ? ` <span class="muted">of ${m(r.alloc)}</span>` : ''}</span></div>
      ${r.alloc ? bar(pct, o ? 'over' : pct >= 85 ? 'near' : '') + `<p class="tiny ${o ? 'neg' : 'muted'}">${o ? `${m(r.spent - r.alloc)} over` : `${m(r.left)} left`}</p>` : `<p class="tiny muted">${r.spent ? 'No limit set' : 'Tap to set a limit'}</p>`}</div></button></li>`;
  }).join('')}</ul></section>`;
  return h;
}

/* ---------- More / Settings ---------- */
function viewMore() {
  const last = state.prefs.lastExport ? new Date(state.prefs.lastExport).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'Asia/Kolkata' }) : 'never';
  const demo = mode === 'demo';
  let h = `<header class="page-h"><div><h1>More</h1></div></header>`;
  h += `<section class="card"><h2 class="sec">Profile</h2>
    <label class="field"><span>What should we call you?</span><input id="pname" class="input" maxlength="40" value="${esc(state.profile.name)}" placeholder="Your name" autocomplete="given-name"></label>
    <label class="field"><span>Currency</span><select id="pcur" class="input">${CURRENCIES.map(c => `<option ${state.profile.currency === c ? 'selected' : ''}>${c}</option>`).join('')}</select></label>
    <label class="field"><span>Appearance</span><select id="ptheme" class="input">${[['auto', 'Match my device'], ['light', 'Light'], ['dark', 'Dark']].map(([v, l]) => `<option value="${v}" ${state.prefs.theme === v ? 'selected' : ''}>${l}</option>`).join('')}</select></label></section>`;
  h += `<section class="card"><h2 class="sec">Categories</h2><p class="muted">Add, rename or hide the categories you use.</p><button class="btn" data-act="cats">Manage categories</button></section>`;
  h += `<section class="card callout"><h2 class="sec">Where your data lives</h2>
    <p>Rupiq keeps everything <b>only on this device, in this browser</b>. It is <b>not</b> backed up and does <b>not</b> sync to other devices.</p>
    <p>Clearing browser data, uninstalling the app, or switching phones will erase it unless you've exported a backup.</p>
    <dl class="kv"><dt>Saved here</dt><dd>${state.txns.length} transaction${state.txns.length === 1 ? '' : 's'}</dd><dt>Last backup</dt><dd>${last}</dd><dt>Storage</dt><dd id="store-info">checking…</dd></dl></section>`;
  if (!demo) {
    h += `<section class="card"><h2 class="sec">Your data</h2><div class="stack">
      <button class="btn primary" data-act="export-json">Export backup (JSON)</button>
      <button class="btn" data-act="export-csv">Export for Excel / Sheets (CSV)</button>
      <button class="btn" data-act="import">Restore or import a backup</button><input id="file" type="file" accept=".json,application/json" hidden>
      <button class="btn" data-act="restore-safety" id="safety-btn" hidden>Undo last import / change</button></div></section>`;
  }
  h += `<section class="card"><h2 class="sec">Privacy</h2><ul class="plain"><li>No account, no sign-up, no servers: your records are never uploaded.</li><li>No analytics, trackers or ads. Rupiq makes no network requests with your data.</li><li>You own your data: export it any time, or erase it below.</li></ul></section>`;
  h += `<section class="card"><h2 class="sec">${demo ? 'Demo mode' : 'Try it out'}</h2>${demo ? `<p class="muted">You're looking at sample data. Your real data is untouched.</p><button class="btn primary" data-act="exit-demo">Exit demo</button>` : `<p class="muted">Want to see Rupiq with some numbers in it? Sample data opens separately and never mixes with yours.</p><button class="btn" data-act="start-demo">Explore with sample data</button>`}</section>`;
  if (ui.installEvt) h += `<section class="card"><h2 class="sec">Install</h2><p class="muted">Add Rupiq to your home screen for one-tap access, even offline.</p><button class="btn" data-act="install">Install Rupiq</button></section>`;
  else h += `<section class="card"><h2 class="sec">Install</h2><p class="muted">On iPhone: Share → Add to Home Screen. On Android: browser menu → Install app.</p></section>`;
  if (!demo) h += `<section class="card danger"><h2 class="sec">Delete all my data</h2><p class="muted">Erases every transaction, budget and setting from this device. This can't be undone.</p><button class="btn danger" data-act="wipe">Delete everything…</button></section>`;
  h += `<p class="tiny muted center">Rupiq v1.0 · Made in India · Your data stays with you</p>`;
  return h;
}
async function afterMore() {
  const info = $('#store-info');
  if (!info) return;
  const p = await store.persistence();
  const parts = [store.backendName() === 'indexeddb' ? 'IndexedDB' : 'Basic browser storage'];
  parts.push(p.persisted === true ? 'protected from auto-cleanup' : p.persisted === false ? 'may be cleared by the browser if space runs low' : 'protection unknown');
  if (p.usage != null) parts.push(`${(p.usage / 1048576).toFixed(p.usage < 1048576 ? 2 : 1)} MB used`);
  info.textContent = parts.join(' · ');
  if (mode === 'main') { const sc = await store.getSafetyCopy(); const b = $('#safety-btn'); if (b && sc) b.hidden = false; }
}

/* ---------- render ---------- */
function render() {
  const app = $('#app');
  if (ui.loadError) return renderLoadError(app);
  if (!state.prefs.onboarded && mode !== 'demo') return renderOnboarding(app);
  const r = route();
  const body = { home: viewHome, history: viewHistory, budget: viewBudget, more: viewMore }[r]();
  const keepScroll = app.dataset.route === r ? window.scrollY : 0;
  app.dataset.route = r;
  app.innerHTML = shell(r, body);
  applyWidths(app);
  renderBanners();
  window.scrollTo(0, keepScroll);
  if (r === 'more') afterMore();
}
window.addEventListener('hashchange', () => { closeSheet(); render(); window.scrollTo(0, 0); });

function renderLoadError(app) {
  app.innerHTML = `<div class="onb"><div class="onb-card">${LOGO}<h1>We couldn't open your saved data</h1><p class="muted">${esc(ui.loadError)}</p>
    <p>Your data has not been deleted. Try reloading first. If this keeps happening, you can export a copy from the previous screen or start fresh.</p>
    <div class="stack"><button class="btn primary" data-act="reload">Reload</button></div></div></div>`;
}

/* ---------- onboarding ---------- */
function renderOnboarding(app) {
  const o = onboard;
  const exp = state.categories.filter(c => c.kind === 'expense');
  if (!o.picked) o.picked = new Set(exp.map(c => c.id));
  let inner = '';
  if (o.step === 0) {
    inner = `${LOGO}<h1>Know where your money goes.<br><span class="accent">Before it's gone.</span></h1>
      <ul class="points"><li><b>Add spending in seconds</b> — amount, category, done.</li><li><b>See what's left in your budget</b> without spreadsheets.</li><li><b>Private by design</b> — your data stays on your phone. No sign-up.</li></ul>
      <div class="stack"><button class="btn primary big" data-act="ob-next">Get started</button><button class="btn" data-act="start-demo">Look around with sample data</button></div>`;
  } else if (o.step === 1) {
    inner = `<p class="eyebrow">Step 1 of 3</p><h1>A little about you</h1><p class="muted">Everything here is optional and can be changed later.</p>
      <label class="field"><span>What should we call you?</span><input id="ob-name" class="input" maxlength="40" value="${esc(o.name)}" placeholder="Your first name" autocomplete="given-name"></label>
      <label class="field"><span>Currency</span><select id="ob-cur" class="input">${CURRENCIES.map(c => `<option ${o.currency === c ? 'selected' : ''}>${c}</option>`).join('')}</select></label>
      <label class="field"><span>Monthly spending target <em>(optional)</em></span><input id="ob-target" class="input" inputmode="decimal" placeholder="e.g. 50,000" value="${esc(o.target)}"><small id="ob-target-p" class="muted"></small></label>
      <div class="row"><button class="btn" data-act="ob-back">Back</button><button class="btn primary grow" data-act="ob-next">Continue</button></div>`;
  } else if (o.step === 2) {
    inner = `<p class="eyebrow">Step 2 of 3</p><h1>What do you spend on?</h1><p class="muted">Untick anything you don't need. You can add or restore categories later.</p>
      <div class="chips" id="ob-cats">${exp.map(c => `<button class="chip ${o.picked.has(c.id) ? 'on' : ''}" data-act="ob-cat" data-id="${esc(c.id)}" aria-pressed="${o.picked.has(c.id)}">${esc(c.emoji)} ${esc(c.name)}</button>`).join('')}</div>
      <div class="row"><button class="btn" data-act="ob-back">Back</button><button class="btn primary grow" data-act="ob-next">Continue</button></div>`;
  } else {
    inner = `<p class="eyebrow">Step 3 of 3</p><h1>Your data, your device</h1>
      <div class="callout"><p>Rupiq saves everything <b>on this phone or computer only</b>. There's no account and no cloud copy.</p>
      <p>That means <b>no one else can see your money</b> — but also that <b>clearing your browser data or changing phones erases it</b>. Rupiq will remind you to export a backup now and then.</p></div>
      <div class="row"><button class="btn" data-act="ob-back">Back</button><button class="btn primary grow" data-act="ob-finish">I understand — add my first expense</button></div>`;
  }
  app.innerHTML = `<div class="onb"><div class="onb-card">${inner}</div></div>`;
  const t = $('#ob-target');
  if (t) { const upd = () => { const p = parseAmount(t.value); $('#ob-target-p').textContent = p ? fmt(p, $('#ob-cur').value) : ''; }; t.oninput = upd; $('#ob-cur').onchange = upd; upd(); }
  const first = $('#ob-name'); if (first) first.focus({ preventScroll: true });
}
function obCapture() {
  if ($('#ob-name')) { onboard.name = $('#ob-name').value.trim(); onboard.currency = $('#ob-cur').value; onboard.target = $('#ob-target').value; }
}

/* ---------- transaction sheet ---------- */
function rankedCats(kind) {
  const cutoff = (() => { const d = new Date(Date.now() - 90 * 86400000); return todayIST(d); })();
  const counts = {};
  for (const t of state.txns) if (t.type === kind && t.date >= cutoff) counts[t.cat] = (counts[t.cat] || 0) + 1;
  const cats = activeCats(kind);
  return cats.map((c, i) => ({ c, i, n: counts[c.id] || 0 })).sort((a, b) => b.n - a.n || a.i - b.i).map(x => x.c);
}
function openTxnSheet(id) {
  const ed = id ? state.txns.find(t => t.id === id) : null;
  if (id && !ed) return;
  const today = todayIST();
  const d = ed ? { type: ed.type, amount: toInputString(ed.amount), cat: ed.cat, date: ed.date, pay: ed.pay, note: ed.note }
    : { type: 'expense', amount: '', cat: rankedCats('expense')[0]?.id || '', date: today, pay: state.prefs.lastPay || 'UPI', note: '' };
  const body = openSheet(ed ? 'Edit transaction' : 'Add transaction', '');
  const chipsHtml = () => {
    let list = rankedCats(d.type);
    if (ed && ed.type === d.type && !list.some(c => c.id === d.cat)) list = [catOf(d.cat), ...list]; // edited txn may use a hidden category
    return list.map(c => `<button type="button" class="chip ${d.cat === c.id ? 'on' : ''}" data-cat="${esc(c.id)}" aria-pressed="${d.cat === c.id}">${esc(c.emoji)} ${esc(c.name)}</button>`).join('');
  };
  body.innerHTML = `<form id="txn-form" novalidate>
    <div class="seg" role="group" aria-label="Type"><button type="button" data-type="expense" class="${d.type === 'expense' ? 'on' : ''}" aria-pressed="${d.type === 'expense'}">Spent</button><button type="button" data-type="income" class="${d.type === 'income' ? 'on' : ''}" aria-pressed="${d.type === 'income'}">Received</button></div>
    <label class="amount-field"><span class="sr">Amount</span><span class="cur" aria-hidden="true">${state.profile.currency === 'INR' ? '₹' : state.profile.currency}</span><input id="t-amount" inputmode="decimal" autocomplete="off" placeholder="0" value="${esc(d.amount)}" aria-describedby="t-err"></label>
    <p class="tiny muted" id="t-preview">&nbsp;</p>
    <p class="label">Category</p><div class="chips" id="t-cats">${chipsHtml()}</div>
    <div class="two"><label class="field"><span>Date</span><input id="t-date" type="date" class="input" max="${today}" value="${d.date}"></label>
      <label class="field"><span>${d.type === 'income' ? 'Received via' : 'Paid with'}</span><select id="t-pay" class="input">${PAY_METHODS.map(p => `<option ${d.pay === p ? 'selected' : ''}>${p}</option>`).join('')}</select></label></div>
    <label class="field"><span>Note <em>(optional)</em></span><input id="t-note" class="input" maxlength="200" value="${esc(d.note)}" placeholder="e.g. Dmart, auto to office"></label>
    <p class="error" id="t-err" role="alert"></p>
    <div class="row"><button class="btn primary grow big" type="submit" id="t-save">${ed ? 'Save changes' : 'Save'}</button>${ed ? '<button class="btn danger" type="button" id="t-del">Delete</button>' : '<button class="btn" type="button" id="t-more">Save &amp; add another</button>'}</div></form>`;
  const q = s => $(s, body);
  const preview = () => { const p = parseAmount(q('#t-amount').value); q('#t-preview').innerHTML = p ? fmt(p, state.profile.currency) : '&nbsp;'; };
  q('#t-amount').addEventListener('input', preview); preview();
  q('#t-amount').focus();
  body.addEventListener('click', e => {
    const ty = e.target.closest('[data-type]');
    if (ty) {
      d.type = ty.dataset.type; d.cat = rankedCats(d.type)[0]?.id || '';
      $$('[data-type]', body).forEach(b => { b.classList.toggle('on', b.dataset.type === d.type); b.setAttribute('aria-pressed', b.dataset.type === d.type); });
      q('#t-cats').innerHTML = chipsHtml(); q('#t-pay').previousElementSibling.textContent = d.type === 'income' ? 'Received via' : 'Paid with';
      return;
    }
    const ch = e.target.closest('[data-cat]');
    if (ch) { d.cat = ch.dataset.cat; $$('[data-cat]', body).forEach(b => { const on = b.dataset.cat === d.cat; b.classList.toggle('on', on); b.setAttribute('aria-pressed', on); }); }
  });
  const submit = again => {
    const amount = parseAmount(q('#t-amount').value);
    const date = q('#t-date').value;
    const err = q('#t-err');
    if (!amount) { err.textContent = 'Enter an amount greater than zero, like 250 or 99.50.'; q('#t-amount').focus(); return; }
    if (!d.cat || !state.categories.some(c => c.id === d.cat)) { err.textContent = 'Pick a category.'; return; }
    if (!isValidDate(date)) { err.textContent = 'Choose a valid date.'; return; }
    if (date > todayIST()) { err.textContent = "That date is in the future. Pick today or earlier."; return; }
    const rec = { type: d.type, amount, cat: d.cat, date, note: q('#t-note').value.trim(), pay: q('#t-pay').value };
    const now = new Date().toISOString();
    commit(s => {
      if (ed) Object.assign(s.txns.find(t => t.id === ed.id), rec, { updated: now });
      else s.txns.push({ id: uid(), ...rec, created: now, updated: null });
      s.prefs.lastPay = rec.pay;
    });
    ui.ym = ymOf(date) > ui.ym && !ed ? ymOf(date) : ui.ym;
    if (!ed && ymOf(date) !== ui.ym) { ui.ym = ymOf(date); render(); }
    const name = catOf(rec.cat).name;
    if (again) {
      d.amount = ''; d.note = ''; q('#t-amount').value = ''; q('#t-note').value = ''; q('#t-err').textContent = ''; preview();
      q('#t-amount').focus(); toast(`Added ${fmt(amount, state.profile.currency)} · ${name}`);
    } else { closeSheet(); toast(ed ? 'Changes saved' : `Added ${fmt(amount, state.profile.currency)} · ${name}`); }
  };
  q('#txn-form').addEventListener('submit', e => { e.preventDefault(); submit(false); });
  if (q('#t-more')) q('#t-more').onclick = () => submit(true);
  if (q('#t-del')) q('#t-del').onclick = () => { closeSheet(); deleteTxn(ed.id); };
}
function deleteTxn(id) {
  const idx = state.txns.findIndex(t => t.id === id);
  if (idx < 0) return;
  const rec = state.txns[idx];
  commit(s => { s.txns = s.txns.filter(t => t.id !== id); });
  toast(`Deleted ${m(rec.amount)}`, { label: 'Undo', run: () => commit(s => { if (!s.txns.some(t => t.id === rec.id)) s.txns.push(rec); }) });
}

/* ---------- budget sheets ---------- */
function ensureBudgetCopy(s, ym) {
  if (!s.budgets[ym]) { const b = budgetFor(s, ym); s.budgets[ym] = { total: b ? b.total : 0, alloc: b ? { ...b.alloc } : {} }; }
  return s.budgets[ym];
}
function openBudgetSheet() {
  const b = budgetFor(state, ui.ym);
  const prev = monthSummary(state, addMonths(ui.ym, -1));
  const sug = prev.expense > 0 ? Math.ceil(prev.expense / 100_000) * 100_000 : 0; // round up to next ₹1,000
  const body = openSheet('Monthly budget', `<form id="b-form" novalidate><p class="muted">The most you'd like to spend in ${monthLabel(ui.ym)}. This is a plan, not your bank balance.</p>
    <label class="amount-field"><span class="sr">Budget</span><span class="cur" aria-hidden="true">${state.profile.currency === 'INR' ? '₹' : state.profile.currency}</span><input id="b-amount" inputmode="decimal" autocomplete="off" placeholder="0" value="${b ? esc(toInputString(b.total)) : ''}"></label>
    <p class="tiny muted" id="b-preview">&nbsp;</p>
    ${sug ? `<div class="chips"><button type="button" class="chip" id="b-sug">Last month's spending, rounded up: ${m(sug)}</button></div>` : ''}
    <p class="error" id="b-err" role="alert"></p><button class="btn primary big block" type="submit">Save budget</button></form>`);
  const inp = $('#b-amount', body);
  const pv = () => { const p = parseAmount(inp.value); $('#b-preview', body).innerHTML = p ? fmt(p, state.profile.currency) : '&nbsp;'; };
  inp.oninput = pv; pv(); inp.focus();
  if (sug) $('#b-sug', body).onclick = () => { inp.value = toInputString(sug); pv(); };
  $('#b-form', body).onsubmit = e => {
    e.preventDefault();
    const p = parseAmount(inp.value);
    if (!p) { $('#b-err', body).textContent = 'Enter a budget amount greater than zero.'; return; }
    commit(s => { ensureBudgetCopy(s, ui.ym).total = p; });
    closeSheet(); toast('Budget saved');
  };
}
function openAllocSheet(catId) {
  const b = budgetFor(state, ui.ym);
  if (!b) { toast('Set a monthly budget first, then plan categories.'); return openBudgetSheet(); }
  const c = catOf(catId); const cur = b.alloc[catId] || 0;
  const spent = monthSummary(state, ui.ym).byCat[catId] || 0;
  const body = openSheet(`${c.name} limit`, `<form id="a-form" novalidate><p class="muted">How much would you like to spend on ${esc(c.name)} in ${monthLabel(ui.ym)}? You've spent ${m(spent)} so far.</p>
    <label class="amount-field"><span class="sr">Limit</span><span class="cur" aria-hidden="true">${state.profile.currency === 'INR' ? '₹' : state.profile.currency}</span><input id="a-amount" inputmode="decimal" autocomplete="off" placeholder="0" value="${cur ? esc(toInputString(cur)) : ''}"></label>
    <p class="tiny muted" id="a-preview">&nbsp;</p><p class="error" id="a-err" role="alert"></p>
    <div class="row"><button class="btn primary grow big" type="submit">Save</button>${cur ? '<button class="btn" type="button" id="a-clear">Remove limit</button>' : ''}</div></form>`);
  const inp = $('#a-amount', body);
  const pv = () => { const p = parseAmount(inp.value); $('#a-preview', body).innerHTML = p ? fmt(p, state.profile.currency) : '&nbsp;'; };
  inp.oninput = pv; pv(); inp.focus();
  $('#a-form', body).onsubmit = e => {
    e.preventDefault();
    const raw = inp.value.trim();
    if (!raw) { commit(s => { delete ensureBudgetCopy(s, ui.ym).alloc[catId]; }); closeSheet(); return; }
    const p = parseAmount(raw);
    if (!p) { $('#a-err', body).textContent = 'Enter an amount like 5000, or use "Remove limit".'; return; }
    commit(s => { ensureBudgetCopy(s, ui.ym).alloc[catId] = p; });
    closeSheet(); toast('Limit saved');
  };
  if ($('#a-clear', body)) $('#a-clear', body).onclick = () => { commit(s => { delete ensureBudgetCopy(s, ui.ym).alloc[catId]; }); closeSheet(); toast('Limit removed'); };
}

/* ---------- categories ---------- */
function openCatsSheet() {
  const row = c => `<li><span class="bubble sm" aria-hidden="true">${esc(c.emoji)}</span><span class="grow ${c.archived ? 'muted' : ''}">${esc(c.name)}${c.archived ? ' (hidden)' : ''}</span><button class="btn small" data-cedit="${esc(c.id)}">Edit</button></li>`;
  openSheet('Categories', `<h3 class="sec">Spending</h3><ul class="cats list">${state.categories.filter(c => c.kind === 'expense').map(row).join('')}</ul>
    <h3 class="sec">Income</h3><ul class="cats list">${state.categories.filter(c => c.kind === 'income').map(row).join('')}</ul>
    <div class="row"><button class="btn" data-cnew="expense">+ Spending category</button><button class="btn" data-cnew="income">+ Income category</button></div>`, { wide: true });
}
function openCatEdit(id, kind) {
  const c = id ? state.categories.find(x => x.id === id) : null;
  const used = c ? state.txns.filter(t => t.cat === c.id).length : 0;
  const body = openSheet(c ? 'Edit category' : 'New category', `<form id="c-form" novalidate>
    <div class="two"><label class="field"><span>Icon</span><input id="c-emoji" class="input" maxlength="4" value="${esc(c?.emoji || '🏷️')}" aria-label="Emoji icon"></label>
    <label class="field grow"><span>Name</span><input id="c-name" class="input" maxlength="40" value="${esc(c?.name || '')}" placeholder="e.g. Pet care"></label></div>
    ${(c ? c.kind : kind) === 'expense' ? `<label class="check"><input id="c-d" type="checkbox" ${c?.d ? 'checked' : ''}> <span>It's a "nice-to-have" (used for the highest-discretionary insight)</span></label>` : ''}
    <p class="error" id="c-err" role="alert"></p>
    <div class="row"><button class="btn primary grow" type="submit">Save</button>${c ? `<button class="btn" type="button" id="c-arch">${c.archived ? 'Restore' : used ? 'Hide' : 'Delete'}</button>` : ''}</div>
    ${c && used ? `<p class="tiny muted">${used} transaction${used > 1 ? 's use' : ' uses'} this category, so it can be hidden but not deleted.</p>` : ''}</form>`);
  $('#c-form', body).onsubmit = e => {
    e.preventDefault();
    const name = $('#c-name', body).value.trim();
    if (!name) { $('#c-err', body).textContent = 'Give the category a name.'; return; }
    if (state.categories.some(x => x.kind === (c ? c.kind : kind) && x.id !== c?.id && x.name.toLowerCase() === name.toLowerCase())) { $('#c-err', body).textContent = 'You already have a category with that name.'; return; }
    const emoji = $('#c-emoji', body).value.trim() || '🏷️';
    const dflag = $('#c-d', body)?.checked || false;
    commit(s => {
      if (c) Object.assign(s.categories.find(x => x.id === c.id), { name, emoji, d: dflag });
      else s.categories.push({ id: 'c-' + uid().slice(0, 8), name, emoji, kind, d: dflag, archived: false });
    });
    openCatsSheet();
  };
  if (c) $('#c-arch', body).onclick = () => {
    commit(s => {
      const cat = s.categories.find(x => x.id === c.id);
      if (cat.archived) cat.archived = false;
      else if (used) cat.archived = true;
      else { s.categories = s.categories.filter(x => x.id !== c.id); for (const b of Object.values(s.budgets)) delete b.alloc[c.id]; }
    });
    openCatsSheet();
  };
}

/* ---------- export / import ---------- */
function download(name, text, type) {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const a = document.createElement('a'); a.href = url; a.download = name; document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}
function exportJSON() {
  const out = { app: 'rupiq', exportedAt: new Date().toISOString(), ...JSON.parse(JSON.stringify(state)) };
  out.prefs = { ...out.prefs }; delete out.prefs.snoozeUntil;
  download(`rupiq-backup-${todayIST()}.json`, JSON.stringify(out, null, 2), 'application/json');
  if (mode === 'main') { commit(s => { s.prefs.lastExport = new Date().toISOString(); }); }
  toast('Backup downloaded. Keep it somewhere safe — Drive, email to yourself, or a computer.');
}
function exportCSV() { download(`rupiq-transactions-${todayIST()}.csv`, toCSV(state), 'text/csv;charset=utf-8'); toast('CSV downloaded'); }
function handleImport(file) {
  const rd = new FileReader();
  rd.onerror = () => toast("Couldn't read that file.");
  rd.onload = () => {
    let raw; try { raw = JSON.parse(String(rd.result)); } catch { return toast("That file isn't a valid Rupiq backup."); }
    if (raw?.app && raw.app !== 'rupiq') return toast("That file isn't a Rupiq backup.");
    const n = normalize(raw);
    if (!n.ok) return toast(n.problems[0]);
    const inc = n.state;
    const known = new Set(state.txns.map(t => t.id));
    const fresh = inc.txns.filter(t => !known.has(t.id)).length;
    const dates = inc.txns.map(t => t.date).sort();
    const body = openSheet('Restore from backup', `<p>This backup has <b>${inc.txns.length}</b> transaction${inc.txns.length === 1 ? '' : 's'}${dates.length ? ` from ${dates[0]} to ${dates[dates.length - 1]}` : ''} and <b>${Object.keys(inc.budgets).length}</b> monthly budget${Object.keys(inc.budgets).length === 1 ? '' : 's'}.</p>
      ${n.problems.length ? `<p class="hint">${n.problems.map(esc).join(' ')}</p>` : ''}
      <div class="stack"><button class="btn primary" id="imp-merge">Add what's missing (${fresh} new)</button><button class="btn danger" id="imp-replace">Replace everything on this device</button><button class="btn" data-act="close-sheet">Cancel</button></div>
      <p class="tiny muted">Before anything changes, Rupiq keeps a copy of your current data so you can undo.</p>`);
    $('#imp-merge', body).onclick = async () => {
      await store.saveSafetyCopy(state, 'before merge');
      commit(s => {
        const ids = new Set(s.txns.map(t => t.id)); const cids = new Set(s.categories.map(c => c.id));
        for (const t of inc.txns) if (!ids.has(t.id)) s.txns.push(t);
        for (const c of inc.categories) if (!cids.has(c.id)) s.categories.push(c);
        for (const [k, v] of Object.entries(inc.budgets)) if (!s.budgets[k]) s.budgets[k] = v;
        if (!s.profile.name) s.profile.name = inc.profile.name;
      });
      closeSheet(); toast(`Added ${fresh} transaction${fresh === 1 ? '' : 's'}`);
    };
    $('#imp-replace', body).onclick = async () => {
      await store.saveSafetyCopy(state, 'before restore');
      inc.prefs.onboarded = true;
      state = inc; persist(); closeSheet(); render(); toast('Backup restored');
    };
  };
  rd.readAsText(file);
}
async function restoreSafety() {
  const sc = await store.getSafetyCopy();
  if (!sc) return toast('Nothing to undo.');
  const when = new Date(sc.at).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata', dateStyle: 'medium', timeStyle: 'short' });
  const body = openSheet('Undo last change', `<p>Go back to the copy saved ${esc(when)} (${esc(sc.reason)}). It has ${sc.state.txns.length} transaction${sc.state.txns.length === 1 ? '' : 's'}.</p><p class="muted">What's on the device now will be replaced.</p>
    <div class="stack"><button class="btn primary" id="sf-go">Restore that copy</button><button class="btn" data-act="close-sheet">Cancel</button></div>`);
  $('#sf-go', body).onclick = () => { const cur = state; state = sc.state; state.prefs.onboarded = true; persist(); store.saveSafetyCopy(cur, 'before undo'); closeSheet(); render(); toast('Restored'); };
}
function openWipe() {
  const body = openSheet('Delete all my data', `<p>This permanently erases everything Rupiq has stored on this device: ${state.txns.length} transaction${state.txns.length === 1 ? '' : 's'}, budgets, categories and settings. <b>It can't be undone</b>, and no backup copy is kept.</p>
    <p class="muted">Not sure? Export a backup first.</p><button class="btn" data-act="export-json">Export backup first</button>
    <label class="field"><span>Type <b>DELETE</b> to confirm</span><input id="w-in" class="input" autocomplete="off"></label>
    <button class="btn danger block" id="w-go" disabled>Erase everything</button>`);
  const inp = $('#w-in', body), go = $('#w-go', body);
  inp.oninput = () => { go.disabled = inp.value.trim() !== 'DELETE'; };
  go.onclick = async () => {
    try { await store.wipeAll(); } catch { return toast("Couldn't erase everything. Try again."); }
    try { localStorage.removeItem('rupiq:theme'); localStorage.removeItem('rupiq:mode'); } catch { /* ignore */ }
    closeSheet(); mode = 'main'; state = emptyState(); onboard = { step: 0, name: '', currency: 'INR', target: '', picked: null };
    document.documentElement.dataset.theme = 'auto'; location.hash = '#/home'; render(); toast('All data deleted from this device.');
  };
}
function openExplain() {
  openSheet('What these numbers mean', `<dl class="defs">
    <dt>Money in</dt><dd>Income you've recorded this month — salary, freelance, anything received.</dd>
    <dt>Money out</dt><dd>Everything you've recorded as spent this month.</dd>
    <dt>Budget</dt><dd>The spending limit you chose for the month. It's a plan.</dd>
    <dt>Planned in categories</dt><dd>The part of your budget you've split across categories like groceries or transport.</dd>
    <dt>Budget left</dt><dd>Budget minus what you've spent. It does <b>not</b> include income and is not your bank balance.</dd>
    <dt>Actual money available</dt><dd>What's really in your accounts. Rupiq doesn't connect to your bank, so it doesn't know this — check your bank app for it.</dd></dl>`);
}

/* ---------- demo ---------- */
async function enterDemo() {
  store.setMode('demo'); mode = 'demo';
  const today = todayIST();
  state = demoState(today, addMonths, clampDay); ui.ym = ymOf(today);
  await persist(); location.hash = '#/home'; render(); window.scrollTo(0, 0);
}
async function exitDemo() {
  store.setMode('main'); mode = 'main';
  try { const r = await store.load('main'); state = r.state; } catch (e) { ui.loadError = e.message; }
  ui.ym = ymOf(todayIST()); applyTheme(); location.hash = '#/home'; render();
}
function applyTheme() {
  const t = state.prefs.theme || 'auto';
  document.documentElement.dataset.theme = t;
  try { if (t === 'auto') localStorage.removeItem('rupiq:theme'); else localStorage.setItem('rupiq:theme', t); } catch { /* ignore */ }
  const meta = document.querySelector('meta[name=theme-color]');
  if (meta) meta.content = (t === 'dark' || (t === 'auto' && matchMedia('(prefers-color-scheme: dark)').matches)) ? '#121715' : '#0F6B5C';
}

/* ---------- events ---------- */
const actions = {
  add: () => openTxnSheet(), edit: el => openTxnSheet(el.dataset.id),
  'close-sheet': closeSheet, explain: openExplain, reload: () => location.reload(),
  'month-prev': () => { ui.ym = addMonths(ui.ym, -1); render(); },
  'month-next': () => { if (ui.ym < ymOf(todayIST())) { ui.ym = addMonths(ui.ym, 1); render(); } },
  'edit-budget': openBudgetSheet, 'edit-alloc': el => openAllocSheet(el.dataset.id),
  scope: el => { ui.hist.scope = el.dataset.v; ui.hist.limit = 150; render(); },
  ftype: el => { ui.hist.type = el.dataset.v; ui.hist.limit = 150; render(); },
  'more-rows': () => { ui.hist.limit += 200; render(); },
  'clear-filters': () => { Object.assign(ui.hist, { type: 'all', cat: '', pay: '', q: '', limit: 150 }); render(); },
  cats: openCatsSheet,
  'export-json': exportJSON, 'export-csv': exportCSV, import: () => $('#file').click(), 'restore-safety': restoreSafety, wipe: openWipe,
  'snooze-export': () => commit(s => { s.prefs.snoozeUntil = Date.now() + 7 * 86400000; }),
  'start-demo': enterDemo, 'exit-demo': exitDemo,
  install: async () => { const e = ui.installEvt; if (!e) return; e.prompt(); await e.userChoice; ui.installEvt = null; render(); },
  'ob-next': () => { obCapture(); onboard.step++; render(); },
  'ob-back': () => { obCapture(); onboard.step--; render(); },
  'ob-cat': el => { const id = el.dataset.id; if (onboard.picked.has(id)) onboard.picked.delete(id); else onboard.picked.add(id); el.classList.toggle('on', onboard.picked.has(id)); el.setAttribute('aria-pressed', onboard.picked.has(id)); },
  'ob-finish': async () => {
    const o = onboard; const tgt = parseAmount(o.target);
    state.profile.name = o.name; state.profile.currency = o.currency; state.prefs.onboarded = true;
    for (const c of state.categories) if (c.kind === 'expense' && c.id !== 'other' && !o.picked.has(c.id)) c.archived = true;
    if (tgt) state.budgets[ymOf(todayIST())] = { total: tgt, alloc: {} };
    await persist(); store.requestPersistence();
    ui.ym = ymOf(todayIST()); location.hash = '#/home'; render(); setTimeout(() => openTxnSheet(), 60); // after the hashchange handler has run
  },
};
document.addEventListener('click', e => {
  const el = e.target.closest('[data-act]');
  if (el && actions[el.dataset.act]) { e.preventDefault(); actions[el.dataset.act](el, e); return; }
  const ce = e.target.closest('[data-cedit]'); if (ce) return openCatEdit(ce.dataset.cedit);
  const cn = e.target.closest('[data-cnew]'); if (cn) return openCatEdit(null, cn.dataset.cnew);
});
document.addEventListener('change', e => {
  const t = e.target;
  if (t.id === 'fcat') { ui.hist.cat = t.value; $('#hist-list').innerHTML = histListHtml(); }
  else if (t.id === 'fpay') { ui.hist.pay = t.value; $('#hist-list').innerHTML = histListHtml(); }
  else if (t.id === 'file' && t.files[0]) { handleImport(t.files[0]); t.value = ''; }
  else if (t.id === 'pcur') { commit(s => { s.profile.currency = t.value; }); }
  else if (t.id === 'ptheme') { state.prefs.theme = t.value; applyTheme(); persist(); }
});
document.addEventListener('input', e => {
  const t = e.target;
  if (t.id === 'q') { ui.hist.q = t.value; ui.hist.limit = 150; $('#hist-list').innerHTML = histListHtml(); }
  else if (t.id === 'pname') { state.profile.name = t.value.trim(); persist(); }
});
window.addEventListener('beforeinstallprompt', e => { e.preventDefault(); ui.installEvt = e; if (route() === 'more') render(); });
window.addEventListener('appinstalled', () => { ui.installEvt = null; });

/* ---------- boot ---------- */
async function boot() {
  mode = store.getMode();
  try {
    const r = await store.load(key());
    state = r.state;
    if (mode === 'demo' && r.fresh) state = demoState(todayIST(), addMonths, clampDay);
  } catch (e) { ui.loadError = e.message || 'Unknown error'; }
  applyTheme();
  render();
  if (!ui.loadError && state.prefs.onboarded && mode === 'main') store.requestPersistence();
  if ('serviceWorker' in navigator && (location.protocol === 'https:' || location.hostname === 'localhost')) {
    navigator.serviceWorker.register('sw.js').catch(() => { /* offline support is optional */ });
  }
  // The app can stay open across midnight: refresh the "today" views when the tab regains focus.
  let lastDay = todayIST();
  document.addEventListener('visibilitychange', () => { if (!document.hidden && todayIST() !== lastDay) { lastDay = todayIST(); if (!$('#sheet-root .sheet')) render(); } });
}
boot();
globalThis.__rupiq = { get state() { return state; } }; // read-only handle for automated tests
