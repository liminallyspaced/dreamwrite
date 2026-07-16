/**
 * Fiction calendar — display/parse only. Layout never imports this.
 * Absolute integer ticks; two infinite bookend eras required (Aeon invariant).
 *
 * Default: Star Wars-style BBY / ABY with year-as-single-month days.
 * tickUnit = day; one "year" = 365 days for the default calendar.
 */

export const DAYS_PER_YEAR_DEFAULT = 365;

/**
 * @returns {object} Calendar with BBY (backwards ∞) + ABY (forwards ∞)
 */
export function createBbyAbyCalendar(opts = {}) {
  const daysPerYear = opts.daysPerYear ?? DAYS_PER_YEAR_DEFAULT;
  return {
    id: opts.id || 'cal_bby_aby',
    name: opts.name || 'Galactic Standard (BBY/ABY)',
    tickUnit: 'day',
    daysPerYear,
    eras: [
      {
        id: 'bby',
        name: 'Before the Battle of Yavin',
        abbr: 'BBY',
        direction: -1,
        length: Infinity,
        originTick: 0,
      },
      {
        id: 'aby',
        name: 'After the Battle of Yavin',
        abbr: 'ABY',
        direction: 1,
        length: Infinity,
        originTick: 0,
      },
    ],
    months: [{ id: 'y', name: 'Year', abbr: 'Yr', days: daysPerYear }],
    weekdays: [{ id: 'd', name: 'Day', abbr: 'D' }],
  };
}

/**
 * Validate Aeon total-coverage invariant: one ∞ backward + one ∞ forward era.
 * @param {object} calendar
 * @returns {{ ok: boolean, error?: string }}
 */
export function validateCalendar(calendar) {
  const eras = calendar?.eras || [];
  if (eras.length < 2) return { ok: false, error: 'Need at least two eras (bookends)' };
  const back = eras.some((e) => e.direction === -1 && e.length === Infinity);
  const fwd = eras.some((e) => e.direction === 1 && e.length === Infinity);
  if (!back || !fwd) {
    return { ok: false, error: 'Need infinite backward and forward bookend eras' };
  }
  if (!(calendar.months || []).length) return { ok: false, error: 'Need ≥1 month' };
  if (!(calendar.weekdays || []).length) return { ok: false, error: 'Need ≥1 weekday' };
  return { ok: true };
}

/**
 * Format absolute tick as era label, e.g. "6 BBY", "0", "4 ABY".
 * @param {number} t
 * @param {object} calendar
 */
export function formatTick(t, calendar) {
  const dpy = calendar.daysPerYear || DAYS_PER_YEAR_DEFAULT;
  const tick = Math.trunc(Number(t) || 0);
  if (tick === 0) return '0';
  if (tick < 0) {
    const years = Math.ceil(Math.abs(tick) / dpy);
    return `${years} BBY`;
  }
  const years = Math.floor(tick / dpy);
  // Mid-year: still label with year number; day-of-year optional later
  return `${years} ABY`;
}

/**
 * Parse "6 BBY", "4 ABY", "0", "-6" into absolute ticks (start of that year).
 * @param {string} text
 * @param {object} calendar
 * @returns {number|null}
 */
export function parseTick(text, calendar) {
  const dpy = calendar.daysPerYear || DAYS_PER_YEAR_DEFAULT;
  const s = String(text || '').trim();
  if (!s) return null;
  if (s === '0') return 0;
  const m = s.match(/^(-?\d+)\s*(BBY|ABY)?$/i);
  if (!m) return null;
  const n = parseInt(m[1], 10);
  const era = (m[2] || '').toUpperCase();
  if (era === 'BBY' || (!era && n < 0)) {
    const years = Math.abs(n);
    return -(years * dpy);
  }
  if (era === 'ABY' || (!era && n > 0)) {
    return n * dpy;
  }
  return n * dpy;
}

/**
 * Axis tick marks for a visible tick range.
 * @returns {{ t: number, label: string }[]}
 */
export function axisTicks(tMin, tMax, calendar, maxLabels = 12) {
  const dpy = calendar.daysPerYear || DAYS_PER_YEAR_DEFAULT;
  const span = Math.max(dpy, tMax - tMin);
  // Step in years that keeps ~maxLabels
  const yearSpan = span / dpy;
  let stepYears = 1;
  while (yearSpan / stepYears > maxLabels) {
    stepYears *= stepYears < 5 ? 5 : 2;
  }
  const step = stepYears * dpy;
  const startYear = Math.floor(tMin / dpy) * dpy;
  /** @type {{ t: number, label: string }[]} */
  const out = [];
  for (let t = startYear; t <= tMax + step; t += step) {
    if (t < tMin - step) continue;
    out.push({ t, label: formatTick(t, calendar) });
  }
  return out;
}
