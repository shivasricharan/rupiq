// End-to-end tests in real Chrome (puppeteer-core). Run: npm run test:e2e  (needs Chrome; set CHROME=/path if not /usr/bin/google-chrome)
import puppeteer from 'puppeteer-core';
import assert from 'node:assert/strict';
import { serve } from '../scripts/serve.js';
const srv = await serve(8321); const URL_ = 'http://localhost:8321/';
const b = await puppeteer.launch({ executablePath: process.env.CHROME || '/usr/bin/google-chrome', args: ['--no-sandbox'] });
const ctx = b.defaultBrowserContext();
const p = await b.newPage(); await p.setViewport({ width: 360, height: 740, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
const errs = []; p.on('pageerror', e => errs.push(e.message)); p.on('console', m => { if (m.type() === 'error') errs.push(m.text()); });
const sleep = ms => new Promise(r => setTimeout(r, ms));
const text = s => p.$eval(s, e => e.textContent);
const state = () => p.evaluate(() => JSON.parse(JSON.stringify(window.__rupiq.state)));
let n = 0; const ok = m => console.log(`  ✓ ${++n}. ${m}`);
const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata' }).format(new Date());
const ym = today.slice(0, 7);

await p.goto(URL_, { waitUntil: 'networkidle0' });
// 1 Onboarding
assert.ok(await p.$('[data-act=ob-next]')); ok('fresh install shows welcome, no fake data');
assert.equal((await state()).txns.length, 0);
await p.click('[data-act=ob-next]'); await p.type('#ob-name', 'Asha'); await p.type('#ob-target', '50000');
assert.match(await text('#ob-target-p'), /₹50,000/); ok('target preview uses Indian formatting');
await p.click('[data-act=ob-next]'); await p.click('[data-act=ob-next]'); await p.click('[data-act=ob-finish]'); await sleep(300);
assert.ok(await p.$('#txn-form')); ok('onboarding completes and opens add sheet');
// 2 Add expense with validation
await p.click('#t-save'); assert.match(await text('#t-err'), /amount/i); ok('empty amount rejected');
await p.type('#t-amount', '1,250.50'); await p.type('#t-note', 'Dmart <b>run</b>'); await p.click('#t-save'); await sleep(300);
let s = await state(); assert.equal(s.txns.length, 1); assert.equal(s.txns[0].amount, 125050); assert.equal(s.txns[0].date, today); ok('expense saved as 125050 paise on IST today');
assert.ok(!(await p.$('.txn-title *')) && (await text('.txn-title')).includes('<b>run</b>'), 'note HTML must be escaped'); ok('user text is escaped (no HTML injection)');
assert.match(await text('.hero .big'), /₹1,250\.50/); assert.match(await text('.hero-line'), /₹48,749\.50 left of your ₹50,000/); ok('dashboard: spent and budget-left correct');
// 3 Income doesn't affect budget-left
await p.click('.tabbar .fab'); await p.click('[data-type=income]'); await p.type('#t-amount', '85000'); await p.click('#t-save'); await sleep(300);
assert.match(await text('.hero-line'), /₹48,749\.50 left/); ok('income recorded without changing budget left');
// 4 Edit then delete + undo
await p.evaluate(() => { location.hash = '#/history'; }); await sleep(300);
await p.click('.txn'); await sleep(200); // first row is the newest (income)
await p.click('#t-del'); await sleep(200);
s = await state(); assert.equal(s.txns.length, 1); ok('delete works');
await p.click('[data-act=toast-action]'); await sleep(200); assert.equal((await state()).txns.length, 2); ok('undo restores deleted transaction');
const rows = await p.$$('.txn'); await rows[1].click(); await sleep(200);
await p.$eval('#t-amount', e => { e.value = ''; }); await p.type('#t-amount', '1000'); await p.click('#t-save'); await sleep(300);
s = await state(); assert.deepEqual(s.txns.map(t => t.amount).sort((a, c) => a - c), [100000, 8500000]); ok('edit updates amount');
// 5 Search
await p.type('#q', 'zzz'); assert.match(await p.$eval('#hist-list', e => e.textContent), /No matches/); await p.$eval('#q', e => { e.value = ''; e.dispatchEvent(new Event('input', { bubbles: true })); }); ok('search with no match shows empty state');
// 6 Budget allocation
await p.evaluate(() => { location.hash = '#/budget'; }); await sleep(300);
await p.$eval('[data-act=edit-alloc][data-id=groceries]', e => e.scrollIntoView({ block: 'center' })); await p.click('[data-act=edit-alloc][data-id=groceries]'); await p.type('#a-amount', '800'); await p.click('#a-form button[type=submit]'); await sleep(300);
s = await state(); assert.equal(s.budgets[ym].alloc.groceries, 80000); assert.equal(s.budgets[ym].total, 5000000); ok('category allocation saved');
assert.match(await p.$eval('[data-id=groceries]', e => e.textContent), /₹200 over/); ok('over-allocation shown neutrally: ₹200 over');
// 7 Persistence across reload
await p.reload({ waitUntil: 'networkidle0' }); await sleep(300);
s = await state(); assert.equal(s.txns.length, 2); assert.equal(s.profile.name, 'Asha'); ok('data persists after closing/reopening');
// 8 Export -> wipe -> restore
const exported = await p.evaluate(() => { const st = window.__rupiq.state; return JSON.stringify({ app: 'rupiq', exportedAt: new Date().toISOString(), ...st }); });
await import('node:fs').then(fs => fs.writeFileSync('/tmp/rupiq-e2e-backup.json', exported));
await p.evaluate(() => { location.hash = '#/more'; }); await sleep(400);
await p.click('[data-act=wipe]'); await p.type('#w-in', 'DELETE'); await p.click('#w-go'); await sleep(500);
assert.ok(await p.$('[data-act=ob-next]')); assert.equal((await state()).txns.length, 0); ok('delete-all erases data and returns to welcome');
await p.reload({ waitUntil: 'networkidle0' }); assert.equal((await state()).txns.length, 0); ok('erased data stays erased after reload');
// restore via import: need onboarded state first -> use demo exit path: finish onboarding quickly
await p.click('[data-act=ob-next]'); await p.click('[data-act=ob-next]'); await p.click('[data-act=ob-next]'); await p.click('[data-act=ob-finish]'); await sleep(300); await p.click('[data-act=close-sheet]'); await sleep(200);
await p.evaluate(() => { location.hash = '#/more'; }); await sleep(300);
const inp = await p.$('#file'); await inp.uploadFile('/tmp/rupiq-e2e-backup.json'); await sleep(400);
await p.click('#imp-replace'); await sleep(500);
s = await state(); assert.equal(s.txns.length, 2); assert.equal(s.profile.name, 'Asha'); assert.equal(s.budgets[ym].alloc.groceries, 80000); ok('restore from exported backup recovers everything');
await p.evaluate(() => { location.hash = '#/more'; }); await sleep(500);
assert.ok(!(await p.$eval('#safety-btn', e => e.hidden))); ok('undo-import safety copy available');
// bad file
await p.$eval('#file', e => { e.value = ''; }); await import('node:fs').then(fs => fs.writeFileSync('/tmp/bad.json', '{nope'));
await (await p.$('#file')).uploadFile('/tmp/bad.json'); await sleep(300); assert.match(await text('.toast'), /valid Rupiq backup/); ok('corrupt file rejected with message, data untouched');
assert.equal((await state()).txns.length, 2);
// 9 Offline
await p.evaluate(() => { location.hash = '#/home'; }); await sleep(1500);
await p.setOfflineMode(true); await p.reload({ waitUntil: 'load' }); await sleep(500);
assert.equal((await state()).txns.length, 2); ok('app loads and works offline (service worker)');
await p.setOfflineMode(false);
// 10 Layout: no horizontal overflow at 320px on each screen
await p.setViewport({ width: 320, height: 640, isMobile: true, hasTouch: true });
for (const r of ['home', 'history', 'budget', 'more']) { await p.evaluate(h => { location.hash = '#/' + h; }, r); await sleep(300); const ov = await p.evaluate(() => document.documentElement.scrollWidth - innerWidth); assert.ok(ov <= 0, `${r} overflows by ${ov}`); }
ok('no horizontal overflow at 320px on all screens');
// 11 Demo is isolated
await p.evaluate(() => { location.hash = '#/more'; }); await sleep(300); await p.click('[data-act=start-demo]'); await sleep(500);
assert.ok(await p.$('.banner.demo')); await p.click('[data-act=exit-demo]'); await sleep(500);
assert.equal((await state()).txns.length, 2); ok('demo mode is labelled and never touches real data');
assert.deepEqual(errs, [], 'console errors: ' + errs.join(' | ')); ok('no console errors');
await b.close(); srv.close(); console.log(`\nAll ${n} e2e checks passed`);
