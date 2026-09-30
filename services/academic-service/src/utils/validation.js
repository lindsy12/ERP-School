// Small input-parsing helpers shared by controllers.
// Why a shared file: courseController and enrollmentController each have a private copy of
// parseId. New controllers import it from here instead of adding more copies. The older two
// can switch over whenever they're next edited.

// Parses a value into a positive integer id, or returns null if it isn't one.
// Why: ids arrive as strings in URLs ("5") and could be anything in a JSON body ("abc", -1, 2.5).
// Rejecting them up front returns a clean 400 instead of sending junk to MySQL.
function parseId(value) {
  const n = Number(value);
  return Number.isInteger(n) && n > 0 ? n : null;
}

// Returns the names of fields that are missing (undefined, null or '') from `body`.
// Why: every create endpoint starts with "are the required fields there?", and listing *all*
// missing fields at once saves the client a round of fix-one-resubmit-fix-the-next.
function findMissingFields(body, fields) {
  return fields.filter(
    (field) => body?.[field] === undefined || body?.[field] === null || body?.[field] === ''
  );
}

// Returns the string unchanged if it's a real calendar date in YYYY-MM-DD form, else null.
// Why the round-trip through Date: a regex alone accepts impossible dates like 2026-02-30.
// Date.UTC would silently roll that over to March 2, so we check it comes back unchanged.
function parseDate(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const d = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === value ? value : null;
}

// Returns a 24-hour time as "HH:MM:SS" if the value is "HH:MM" or "HH:MM:SS", else null.
// Why normalise: MySQL TIME columns come back as "HH:MM:SS", and a fixed-width format lets us
// compare times as plain strings ("09:00:00" < "10:30:00").
function parseTime(value) {
  if (typeof value !== 'string') return null;
  const match = /^([01]\d|2[0-3]):([0-5]\d)(?::([0-5]\d))?$/.exec(value);
  if (!match) return null;
  return `${match[1]}:${match[2]}:${match[3] ?? '00'}`;
}

// Formats a JS Date as "YYYY-MM-DD" using its *local* date parts.
// Why: mysql2 turns a DATE column into a Date at local midnight. Calling toISOString() on it
// converts to UTC, which can shift the day (2026-09-01 becomes "2026-08-31T23:00Z" in UTC+1).
function toDateString(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

module.exports = {
  parseId,
  findMissingFields,
  parseDate,
  parseTime,
  toDateString,
};
