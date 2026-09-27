const PDFDocument = require('pdfkit');

// Streams a payslip PDF directly to `res`. Caller is responsible for setting
// status/headers and for checking Payroll.status === 'paid' beforehand.
function streamPayslip(res, { employee, payrollItem, month, year }) {
  const doc = new PDFDocument({ margin: 50 });
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `attachment; filename=payslip-${employee.matricule}-${month}-${year}.pdf`);
  doc.pipe(res);

  doc.fontSize(18).text('School ERP', { align: 'left' });
  doc.fontSize(12).fillColor('gray').text('Administration & HR — Payslip', { align: 'left' });
  doc.moveDown();
  doc.fillColor('black');

  doc.fontSize(11);
  doc.text(`Employee: ${employee.firstName} ${employee.lastName} (${employee.matricule})`);
  doc.text(`Department: ${employee.department}`);
  doc.text(`Pay period: ${String(month).padStart(2, '0')}/${year}`);
  doc.moveDown();

  const rows = [
    ['Base salary', payrollItem.baseSalary],
    ['Bonus', payrollItem.bonus],
    ['CNPS (employee, 4.2%)', `-${payrollItem.cnpsEmployee}`],
    ['Taxable income', payrollItem.taxable],
    ['PAYE (IRPP)', `-${payrollItem.paye}`],
    ['Other deductions', `-${payrollItem.deductions}`],
  ];
  rows.forEach(([label, value]) => {
    doc.text(`${label}: ${value} FCFA`);
  });
  doc.moveDown();
  doc.fontSize(13).text(`Net pay: ${payrollItem.net} FCFA`, { underline: true });

  doc.moveDown(3);
  doc.fontSize(10).fillColor('gray').text('Employer signature: ____________________________');

  doc.end();
}

module.exports = { streamPayslip };
