// Simplified, configurable payroll rates for Cameroon statutory deductions.
// Values below are illustrative/published-rate approximations for exam purposes —
// verify against the current CNPS/DGI schedules before any real-world use, and say
// so explicitly during the defense (brief explicitly allows "simplified brackets").
module.exports = {
  cnps: {
    // Employee PVID (old-age/invalidity/death) contribution.
    rate: 0.042,
    // Monthly contribution ceiling in FCFA.
    ceiling: 27500,
  },

  // Monthly IRPP (PAYE) brackets applied marginally to taxable income (base - CNPS).
  // `upTo` is the upper bound of the bracket in FCFA; the last bracket is unbounded.
  payeBrackets: [
    { upTo: 62000, rate: 0 },
    { upTo: 310000, rate: 0.10 },
    { upTo: 429000, rate: 0.15 },
    { upTo: 667000, rate: 0.25 },
    { upTo: Infinity, rate: 0.35 },
  ],

  // Leave types that do NOT count toward payroll exclusion (i.e. still paid).
  // None of our current leave types are unpaid; kept here so it's a one-line
  // change if the team later adds an "unpaid" leave type.
  unpaidLeaveTypes: [],

  defaultAnnualLeaveDays: 20,

  // Attendance cutoff: check-in after this local time is marked "late".
  lateCutoff: '08:30',
};
