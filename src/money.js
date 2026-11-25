// Money helpers. All amounts are stored as integer paise (1 rupee = 100 paise)
// so there is never floating-point drift in totals.

export const MAX_PAISE = 100_00_00_000_00; // ₹100 crore sanity cap

/** Parse user input like "1,250.50", "₹ 80", "80." into integer paise. Returns null if invalid. */
export function parseAmount(input) {
  if (input == null) return null;
  const s = String(input).replace(/[₹,\s]/g, '').replace(/^(rs\.?|inr)/i, '');
  if (!/^\d+(\.\d{0,2})?$/.test(s)) return null;
  const [r, f = ''] = s.split('.');
  const paise = Number(r) * 100 + Number((f + '00').slice(0, 2));
  if (!Number.isSafeInteger(paise) || paise <= 0 || paise > MAX_PAISE) return null;
  return paise;
}

/** Paise -> plain string for editing inputs ("1250.5" style, no grouping). */
export function toInputString(paise) {
  const r = Math.trunc(paise / 100);
  const f = Math.abs(paise % 100);
  return f ? `${r}.${String(f).padStart(2, '0').replace(/0$/, '')}` : String(r);
}

const LOCALES = { INR: 'en-IN', USD: 'en-US', EUR: 'en-IE', GBP: 'en-GB', AED: 'en-AE', SGD: 'en-SG' };
export const CURRENCIES = Object.keys(LOCALES);
const cache = new Map();

function nf(cur, digits) {
  const k = cur + digits;
  if (!cache.has(k)) {
    cache.set(k, new Intl.NumberFormat(LOCALES[cur] || 'en-IN', {
      style: 'currency', currency: cur, minimumFractionDigits: digits, maximumFractionDigits: digits,
    }));
  }
  return cache.get(k);
}

/** Format paise as currency. INR uses Indian grouping: ₹1,25,000. Whole rupees drop the ".00". */
export function fmt(paise, cur = 'INR') {
  const whole = paise % 100 === 0;
  return nf(cur, whole ? 0 : 2).format(paise / 100);
}

export const sum = (arr, f = x => x) => arr.reduce((a, x) => a + f(x), 0);
