// Strict calendar dates in the form YYYY-MM-DD.
//
// Dates are handled as whole days (a "day number"), never as JS Date objects with a
// time, so time zones and daylight saving can never shift a result by one day.

const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})$/;

function isLeapYear(year: number): boolean {
  return (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
}

function daysInMonth(year: number, month: number): number {
  if (month === 2) return isLeapYear(year) ? 29 : 28;
  return [4, 6, 9, 11].includes(month) ? 30 : 31;
}

/**
 * Days since 1970-01-01 for a valid proleptic Gregorian date
 * (Howard Hinnant's days_from_civil algorithm).
 */
function dayNumber(year: number, month: number, day: number): number {
  const y = month <= 2 ? year - 1 : year;
  const era = Math.floor(y / 400);
  const yoe = y - era * 400;
  const mp = (month + 9) % 12;
  const doy = Math.floor((153 * mp + 2) / 5) + day - 1;
  const doe = yoe * 365 + Math.floor(yoe / 4) - Math.floor(yoe / 100) + doy;
  return era * 146097 + doe - 719468;
}

/**
 * Return the day number of `value` if it is a real date written exactly as
 * YYYY-MM-DD, otherwise null. Anything that is not a string returns null.
 */
export function parseIsoDate(value: unknown): number | null {
  if (typeof value !== "string") return null;
  const match = ISO_DATE.exec(value);
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  if (month < 1 || month > 12) return null;
  if (day < 1 || day > daysInMonth(year, month)) return null;
  return dayNumber(year, month, day);
}

export function isIsoDate(value: unknown): value is string {
  return parseIsoDate(value) !== null;
}

/** Today's date on this machine's clock, as YYYY-MM-DD. */
export function localToday(now: Date = new Date()): string {
  const mm = String(now.getMonth() + 1).padStart(2, "0");
  const dd = String(now.getDate()).padStart(2, "0");
  return `${now.getFullYear()}-${mm}-${dd}`;
}
