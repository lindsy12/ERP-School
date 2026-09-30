const dayjs = require('dayjs');

// Counts days between start and end (inclusive), excluding Saturdays/Sundays.
// Public holidays are out of scope for this exercise — noted as a known
// simplification in the SRS assumptions.
function countBusinessDays(startDate, endDate) {
  let current = dayjs(startDate);
  const end = dayjs(endDate);
  let count = 0;
  while (current.isBefore(end) || current.isSame(end, 'day')) {
    const dow = current.day(); // 0 = Sunday, 6 = Saturday
    if (dow !== 0 && dow !== 6) count += 1;
    current = current.add(1, 'day');
  }
  return count;
}

module.exports = { countBusinessDays };
