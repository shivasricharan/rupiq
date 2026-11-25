import test from 'node:test';
import assert from 'node:assert/strict';
import { parseAmount, fmt, toInputString } from '../src/money.js';
import { todayIST, addMonths, daysInMonth, weekStart, isValidDate, dayLabel } from '../src/dates.js';
import { emptyState, normalize, demoState } from '../src/data.js';
import { inAppBrowser, isIOS } from '../src/env.js';
import { monthSummary, budgetFor, insights, filterTxns, toCSV } from '../src/calc.js';

const tx = (o) => ({ id: Math.random().toString(36).slice(2), type: 'expense', cat: 'groceries', note: '', pay: 'UPI', created: null, updated: null, ...o });
const st = (txns = [], budgets = {}) => { const s = emptyState(); s.txns = txns; s.budgets = budgets; return s; };

test('parseAmount', () => {
  assert.equal(parseAmount('1,250.50'), 125050);
  assert.equal(parseAmount('₹ 80'), 8000);
  assert.equal(parseAmount('0.1'), 10);
  assert.equal(parseAmount('0'), null);
  assert.equal(parseAmount('-5'), null);
  assert.equal(parseAmount('1.234'), null);
  assert.equal(parseAmount('abc'), null);
  assert.equal(parseAmount(''), null);
  assert.equal(parseAmount('19.99'), 1999); // float trap: 19.99*100 = 1998.99..
  assert.equal(toInputString(125050), '1250.5');
});

test('Indian number formatting', () => {
  assert.equal(fmt(125000_00), '₹1,25,000');
  assert.equal(fmt(1234567_50), '₹12,34,567.50');
  assert.equal(fmt(99_00), '₹99');
});

test('dates: IST boundary, month math, validity', () => {
  assert.equal(todayIST(new Date('2026-11-30T19:00:00Z')), '2026-12-01'); // 00:30 IST next day
  assert.equal(todayIST(new Date('2026-11-30T18:29:00Z')), '2026-11-30'); // 23:59 IST
  assert.equal(addMonths('2026-01', -1), '2025-12');
  assert.equal(addMonths('2026-12', 1), '2027-01');
  assert.equal(daysInMonth('2028-02'), 29);
  assert.equal(weekStart('2026-11-25'), '2026-11-23'); // Wed -> Mon
  assert.equal(weekStart('2026-11-29'), '2026-11-23'); // Sun -> previous Mon
  assert.ok(!isValidDate('2026-02-30'));
  assert.equal(dayLabel('2026-11-24', '2026-11-25'), 'Yesterday');
});

test('month summary keeps income, spend, budget separate; month boundaries', () => {
  const s = st([
    tx({ amount: 1000_00, date: '2026-11-30' }), tx({ amount: 500_00, date: '2026-12-01' }),
    tx({ type: 'income', cat: 'salary', amount: 50000_00, date: '2026-11-01' }),
    tx({ amount: 2000_00, cat: 'fuel', date: '2026-11-10' }),
  ], { '2026-11': { total: 10000_00, alloc: { groceries: 4000_00, fuel: 1500_00 } } });
  const n = monthSummary(s, '2026-11');
  assert.equal(n.expense, 3000_00);
  assert.equal(n.income, 50000_00);
  assert.equal(n.allocated, 5500_00);
  assert.equal(n.unallocated, 4500_00);
  assert.equal(n.remaining, 7000_00);
  assert.equal(n.rows.find(r => r.cat === 'fuel').left, -500_00);
  assert.equal(monthSummary(s, '2026-12').expense, 500_00);
  assert.equal(monthSummary(s, '2026-12').budget.inherited, true); // carried forward
  assert.equal(monthSummary(s, '2026-10').budget, null);
});

test('edit / delete change totals', () => {
  const s = st([tx({ id: 'a', amount: 100_00, date: '2026-11-02' }), tx({ id: 'b', amount: 200_00, date: '2026-11-03' })]);
  assert.equal(monthSummary(s, '2026-11').expense, 300_00);
  s.txns.find(t => t.id === 'a').amount = 150_00;
  assert.equal(monthSummary(s, '2026-11').expense, 350_00);
  s.txns = s.txns.filter(t => t.id !== 'b');
  assert.equal(monthSummary(s, '2026-11').expense, 150_00);
});

test('insights: only from real data', () => {
  assert.deepEqual(insights(st(), '2026-11', '2026-11-25'), []);
  const s = st([tx({ amount: 8200_00, date: '2026-11-10' })], { '2026-11': { total: 10000_00, alloc: { groceries: 8000_00 } } });
  const txt = insights(s, '2026-11', '2026-11-25').map(i => i.text).join('|');
  assert.match(txt, /82%/);
  assert.match(txt, /Groceries is ₹200 over its ₹8,000 limit/);
  const over = st([tx({ amount: 12000_00, date: '2026-11-10' })], { '2026-11': { total: 10000_00, alloc: {} } });
  assert.match(insights(over, '2026-11', '2026-11-25')[0].text, /₹2,000 over/);
});

test('insight: increase vs same stretch of last month; thin data yields nothing', () => {
  const s = st([
    tx({ amount: 1000_00, date: '2026-10-05' }), tx({ amount: 5000_00, date: '2026-10-28' }), // 28th is after the cutoff (25th)
    tx({ amount: 2000_00, date: '2026-11-05' }),
  ]);
  const t = insights(s, '2026-11', '2026-11-25').map(i => i.text).join('|');
  assert.match(t, /Groceries is up 100%/);
  const tiny = st([tx({ amount: 50_00, date: '2026-10-05' }), tx({ amount: 400_00, date: '2026-11-05' })]);
  assert.equal(insights(tiny, '2026-11', '2026-11-25').length, 0);
});

test('weekly pattern insight needs 3 prior weeks of data', () => {
  const base = [];
  for (const d of ['2026-10-26', '2026-11-02', '2026-11-09', '2026-11-16']) base.push(tx({ amount: 1000_00, date: d }));
  const high = [...base, tx({ amount: 3000_00, date: '2026-11-24' })];
  assert.match(insights(st(high), '2026-11', '2026-11-25').map(i => i.text).join('|'), /This week/);
  const sparse = [tx({ amount: 1000_00, date: '2026-11-02' }), tx({ amount: 3000_00, date: '2026-11-24' })];
  assert.ok(!insights(st(sparse), '2026-11', '2026-11-25').some(i => i.id === 'week'));
});

test('filter/search', () => {
  const s = st([tx({ amount: 250_00, date: '2026-11-02', note: 'Dmart run' }), tx({ amount: 90_00, cat: 'fuel', date: '2026-11-03' })]);
  assert.equal(filterTxns(s, { q: 'dmart' }).length, 1);
  assert.equal(filterTxns(s, { cat: 'fuel' }).length, 1);
  assert.equal(filterTxns(s, { q: 'fuel' }).length, 1);
  assert.equal(filterTxns(s, { type: 'income' }).length, 0);
});

test('export -> import round trip; bad data rejected safely', () => {
  const s = demoState('2026-11-25', addMonths, (ym, d) => `${ym}-${String(d).padStart(2, '0')}`);
  const json = JSON.parse(JSON.stringify({ app: 'rupiq', ...s }));
  const r = normalize(json);
  assert.ok(r.ok);
  assert.deepEqual(r.state.txns, s.txns);
  assert.deepEqual(r.state.budgets, s.budgets);
  assert.equal(normalize(null).ok, false);
  assert.equal(normalize({ v: 99 }).ok, false);
  const bad = normalize({ v: 1, txns: [{ id: 'x', type: 'expense', amount: -5, cat: 'groceries', date: '2026-11-01' }, { id: 'y', type: 'expense', amount: 5, cat: 'nope', date: '2026-11-01' }], categories: [] });
  assert.equal(bad.state.txns.length, 0);
  assert.equal(bad.skipped, 2);
  const dup = normalize({ v: 1, txns: [tx({ id: 'd', amount: 1, date: '2026-11-01' }), tx({ id: 'd', amount: 1, date: '2026-11-01' })] });
  assert.equal(dup.state.txns.length, 1); // duplicate ids dropped
});

test('CSV neutralises spreadsheet formulas and quotes', () => {
  const s = st([tx({ amount: 100_00, date: '2026-11-02', note: '=HYPERLINK("x")' }), tx({ amount: 5_50, date: '2026-11-03', note: 'a,b' })]);
  const csv = toCSV(s);
  assert.ok(csv.includes("'=HYPERLINK"));
  assert.ok(csv.includes('"a,b"'));
  assert.ok(csv.includes('5.50'));
});

test('in-app browser / iOS detection', () => {
  assert.ok(inAppBrowser('Mozilla/5.0 (Linux; Android 13; wv) AppleWebKit/537 Chrome/120 Mobile Safari/537 ; wv)'));
  assert.ok(inAppBrowser('Mozilla/5.0 (iPhone) AppleWebKit Mobile/15E148 Instagram 300.0'));
  assert.ok(inAppBrowser('Mozilla/5.0 (Linux; Android 13) [FB_IAB/FB4A;FBAV/450.0]'));
  assert.ok(!inAppBrowser('Mozilla/5.0 (Linux; Android 13; Pixel 7) AppleWebKit/537.36 Chrome/120 Mobile Safari/537.36'));
  assert.ok(!inAppBrowser('Mozilla/5.0 (iPhone; CPU iPhone OS 17_0) AppleWebKit/605 Version/17.0 Mobile/15E148 Safari/604.1'));
  assert.ok(isIOS('Mozilla/5.0 (iPhone; CPU iPhone OS 17_0)')); assert.ok(!isIOS('Mozilla/5.0 (Linux; Android 13)'));
});
