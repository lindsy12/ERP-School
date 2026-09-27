// Loads a small, realistic demo data set so the UI has something to show.
//
//   docker compose exec hr-service node scripts/seed-demo.js
//   (or locally: DB_HOST=127.0.0.1 DB_PORT=3307 npm run seed)
//
// Idempotent: does nothing if employees already exist. Refuses to run in production.
require('dotenv').config();
const dayjs = require('dayjs');
const {
  sequelize, Employee, Attendance, Leave, LeaveBalance, Asset,
} = require('../src/models');
const { generateMatricule } = require('../src/utils/matricule');

const PEOPLE = [
  // userId 1 = the dev "Admin" token, userId 2 = the dev "Staff" token (see dev-token.js)
  ['Keziah', 'Ngu', 'HR', 'HR Manager', 650000, 1],
  ['Paul', 'Mbarga', 'Academic', 'Lecturer', 420000, 2],
  ['Aisha', 'Tchoumi', 'Academic', 'Senior Lecturer', 550000, null],
  ['Brice', 'Fotso', 'Finance', 'Accountant', 380000, null],
  ['Carine', 'Essomba', 'Finance', 'Finance Officer', 300000, null],
  ['Denis', 'Nkeng', 'IT', 'System Administrator', 700000, null], // above the CNPS ceiling
  ['Estelle', 'Ambe', 'Administration', 'Registrar', 260000, null],
  ['Farid', 'Bello', 'Administration', 'Office Assistant', 120000, null],
];

async function run() {
  if (process.env.NODE_ENV === 'production') throw new Error('seed-demo refuses to run with NODE_ENV=production');
  await sequelize.authenticate();
  await sequelize.sync();
  if (await Employee.count() > 0) {
    console.log('[seed] employees already exist — nothing to do');
    return;
  }

  const employees = [];
  for (const [firstName, lastName, department, role, baseSalary, userId] of PEOPLE) {
    // sequential on purpose: matricule numbering depends on the running count
    // eslint-disable-next-line no-await-in-loop
    const matricule = await generateMatricule();
    // eslint-disable-next-line no-await-in-loop
    employees.push(await Employee.create({
      matricule,
      firstName,
      lastName,
      email: `${firstName}.${lastName}@school.cm`.toLowerCase(),
      phone: '+2376' + String(70000000 + employees.length * 1111).slice(0, 8),
      department,
      role,
      hireDate: '2024-09-01',
      baseSalary,
      userId,
      status: 'active',
    }));
  }

  // Attendance for the last 7 days (weekdays only, not today): mostly present, some late/absent.
  for (let back = 6; back >= 1; back -= 1) {
    const day = dayjs().subtract(back, 'day');
    if (day.day() === 0 || day.day() === 6) continue; // eslint-disable-line no-continue
    for (const [i, emp] of employees.entries()) {
      if ((i + back) % 7 === 0) continue; // eslint-disable-line no-continue -- absent
      const late = (i * 3 + back) % 5 === 0;
      const checkIn = day.hour(late ? 8 : 7).minute(late ? 47 : 52).second(0);
      // eslint-disable-next-line no-await-in-loop
      await Attendance.create({
        employeeId: emp.id,
        date: day.format('YYYY-MM-DD'),
        checkInTime: checkIn.toDate(),
        checkOutTime: checkIn.hour(16).minute(30).toDate(),
        durationMinutes: late ? 523 : 518,
        location: 'Main entrance',
        status: late ? 'late' : 'present',
      });
    }
  }

  // Leave: one approved (covering today), one pending, one rejected.
  const today = dayjs();
  await Leave.create({
    employeeId: employees[2].id, type: 'annual', startDate: today.format('YYYY-MM-DD'),
    endDate: today.add(2, 'day').format('YYYY-MM-DD'), days: 3, reason: 'Family event',
    status: 'approved', approvedBy: 1, approvedAt: new Date(),
  });
  await LeaveBalance.create({ employeeId: employees[2].id, year: today.year(), annualUsed: 3 });
  await Leave.create({
    employeeId: employees[1].id, type: 'sick', startDate: today.add(7, 'day').format('YYYY-MM-DD'),
    endDate: today.add(8, 'day').format('YYYY-MM-DD'), days: 2, reason: 'Medical appointment', status: 'pending',
  });
  await Leave.create({
    employeeId: employees[4].id, type: 'annual', startDate: today.add(20, 'day').format('YYYY-MM-DD'),
    endDate: today.add(24, 'day').format('YYYY-MM-DD'), days: 5, reason: 'Trip', status: 'rejected',
    rejectionReason: 'Month-end closing period',
  });

  await Asset.bulkCreate([
    { name: 'Dell Latitude 5440', category: 'IT Equipment', serialNumber: 'DL-5440-001', status: 'assigned', assignedTo: employees[5].id, purchaseDate: '2025-02-10', value: 650000 },
    { name: 'HP LaserJet Pro', category: 'IT Equipment', serialNumber: 'HP-LJ-014', status: 'available', purchaseDate: '2024-11-03', value: 210000 },
    { name: 'Projector Epson EB-X49', category: 'Teaching Equipment', serialNumber: 'EP-X49-007', status: 'maintenance', purchaseDate: '2023-06-21', value: 320000 },
    { name: 'Office Desk', category: 'Furniture', serialNumber: 'FU-DK-120', status: 'assigned', assignedTo: employees[6].id, purchaseDate: '2024-01-15', value: 85000 },
    { name: 'Toyota Hilux (school van)', category: 'Vehicle', serialNumber: 'VH-TY-2019', status: 'available', purchaseDate: '2019-05-30', value: 14500000 },
  ]);

  console.log(`[seed] created ${employees.length} employees, attendance, leaves and assets`);
}

run()
  .catch((err) => { console.error('[seed] failed:', err.message); process.exitCode = 1; })
  .finally(() => sequelize.close());
