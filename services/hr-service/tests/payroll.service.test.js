const { calculateCnpsEmployee, calculateIRPP, computePayrollItem } = require('../src/services/payroll.service');

describe('payroll.service', () => {
  test('calculateCnpsEmployee applies the 4.2% rate below the ceiling', () => {
    expect(calculateCnpsEmployee(100000)).toBe(4200);
  });

  test('calculateCnpsEmployee is capped at the configured ceiling', () => {
    expect(calculateCnpsEmployee(1000000)).toBe(27500);
  });

  test('calculateIRPP applies 0% under the first bracket', () => {
    expect(calculateIRPP(50000)).toBe(0);
  });

  test('calculateIRPP applies marginal rates across brackets', () => {
    // 62000@0% + (310000-62000)@10% + (350000-310000)@15%
    const taxable = 350000;
    const expected = (310000 - 62000) * 0.10 + (350000 - 310000) * 0.15;
    expect(calculateIRPP(taxable)).toBeCloseTo(expected, 2);
  });

  test('computePayrollItem produces a consistent net', () => {
    const result = computePayrollItem(200000, { bonus: 10000, deductions: 5000 });
    const expectedNet = 200000 - result.cnpsEmployee - result.paye + 10000 - 5000;
    expect(result.net).toBeCloseTo(expectedNet, 2);
  });
});
