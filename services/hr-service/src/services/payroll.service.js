const { cnps, payeBrackets } = require('../config/payrollConfig');

function round2(n) {
  return Math.round(n * 100) / 100;
}

function calculateCnpsEmployee(baseSalary) {
  return round2(Math.min(baseSalary * cnps.rate, cnps.ceiling));
}

// Marginal-bracket IRPP calculation over the configured (simplified) brackets.
function calculateIRPP(taxable) {
  let tax = 0;
  let previousCap = 0;
  for (const bracket of payeBrackets) {
    if (taxable <= previousCap) break;
    const slice = Math.min(taxable, bracket.upTo) - previousCap;
    tax += slice * bracket.rate;
    previousCap = bracket.upTo;
  }
  return round2(tax);
}

function computePayrollItem(baseSalary, { bonus = 0, deductions = 0 } = {}) {
  const cnpsEmployee = calculateCnpsEmployee(baseSalary);
  const taxable = round2(baseSalary - cnpsEmployee);
  const paye = calculateIRPP(taxable);
  const net = round2(baseSalary - cnpsEmployee - paye + Number(bonus) - Number(deductions));
  return { baseSalary: round2(baseSalary), cnpsEmployee, taxable, paye, net, bonus: round2(Number(bonus)), deductions: round2(Number(deductions)) };
}

module.exports = { calculateCnpsEmployee, calculateIRPP, computePayrollItem, round2 };
