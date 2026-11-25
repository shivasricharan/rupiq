// Dates are plain "YYYY-MM-DD" strings in the user's calendar (India: Asia/Kolkata).
// Storing calendar days (not timestamps) means a ₹ spent at 11:50pm on the 30th
// can never slip into the next month because of a timezone conversion.

const TZ = 'Asia/Kolkata';
const fmtYMD = new Intl.DateTimeFormat('en-CA', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit' });

export const todayIST = (now = new Date()) => fmtYMD.format(now);
export const ymOf = d => d.slice(0, 7);
export const dayOf = d => Number(d.slice(8, 10));

const parts = d => d.split('-').map(Number);
const utc = d => { const [y, m, dd] = parts(d); return Date.UTC(y, m - 1, dd); };
const fromUtc = t => new Date(t).toISOString().slice(0, 10);

export function isValidDate(s) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  return fromUtc(utc(s)) === s;
}
export function daysInMonth(ym) { const [y, m] = ym.split('-').map(Number); return new Date(Date.UTC(y, m, 0)).getUTCDate(); }
export function addDays(d, n) { return fromUtc(utc(d) + n * 86400000); }
export function addMonths(ym, n) {
  const [y, m] = ym.split('-').map(Number);
  const t = y * 12 + (m - 1) + n;
  return `${Math.floor(t / 12)}-${String((t % 12) + 1).padStart(2, '0')}`;
}
export const weekday = d => new Date(utc(d)).getUTCDay(); // 0 = Sunday
/** Monday of the week containing d. */
export const weekStart = d => addDays(d, -((weekday(d) + 6) % 7));
export const clampDay = (ym, day) => `${ym}-${String(Math.min(day, daysInMonth(ym))).padStart(2, '0')}`;

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
export const monthLabel = ym => `${MONTHS[Number(ym.slice(5)) - 1]} ${ym.slice(0, 4)}`;
export const monthShort = ym => `${MONTHS[Number(ym.slice(5)) - 1].slice(0, 3)} ${ym.slice(0, 4)}`;
export function dayLabel(d, today) {
  if (d === today) return 'Today';
  if (d === addDays(today, -1)) return 'Yesterday';
  return `${DAYS[weekday(d)]}, ${dayOf(d)} ${MONTHS[Number(d.slice(5, 7)) - 1].slice(0, 3)}${d.slice(0, 4) !== today.slice(0, 4) ? ' ' + d.slice(0, 4) : ''}`;
}
