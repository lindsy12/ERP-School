// Home: who you are, and a card for each module of the ERP your role works in. Each module serves its own pages
// through the gateway (/academic/, /finance/, /hr/, /notifications/) and shares this sign-in.
import { h } from '../ui.js';
import { icon } from '../app.js';
import { loadMe, ROLE_LABELS } from '../me.js';

// Each role sees only the modules it works in. The services enforce the same rules on their APIs;
// hiding a card is only so nobody is sent to a page they can't use.
const STAFF_ROLES = ['SUPER_ADMIN', 'ADMIN', 'STAFF'];
const MODULES = [
  {
    roles: STAFF_ROLES, href: '/academic/', title: 'Academics',
    text: 'Courses, enrolment, exams, grades and attendance.',
    d: 'M22 10L12 5 2 10l10 5 10-5zM6 12v5c3 2 9 2 12 0v-5',
  },
  {
    roles: ['STUDENT'], href: '/academic/student-portal.html', title: 'My studies',
    text: 'Your courses, registration, grades, attendance, exam timetable and transcript.',
    d: 'M22 10L12 5 2 10l10 5 10-5zM6 12v5c3 2 9 2 12 0v-5',
  },
  {
    roles: STAFF_ROLES, href: '/finance/', title: 'Finance',
    text: 'Tuition invoices, payments in FCFA and receipts.',
    d: 'M3 7h18v13H3zM3 7l3-4h12l3 4M16 14h2',
  },
  {
    roles: ['SUPER_ADMIN', 'ADMIN'], href: '/hr/', title: 'Administration & HR',
    text: 'Staff, attendance, leave, payroll and school assets.',
    d: 'M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8z',
  },
  {
    roles: ['STAFF'], href: '/hr/', title: 'My HR',
    text: 'Your attendance, leave requests and payslips.',
    d: 'M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8z',
  },
  {
    roles: [...STAFF_ROLES, 'STUDENT'], href: '/notifications/', title: 'Notifications',
    text: 'Messages about grades, invoices, payments and leave.',
    d: 'M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9M13.73 21a2 2 0 0 1-3.46 0',
  },
];

export default async function home(root) {
  const me = await loadMe();

  root.append(
    h('div', { class: 'page-head' },
      h('div', null,
        h('h1', null, 'Welcome'),
        h('p', { class: 'muted' }, `Signed in as ${me.email} · ${ROLE_LABELS[me.role] || me.role}`))),
    h('div', { class: 'modules' }, MODULES.filter((m) => m.roles.includes(me.role)).map((m) =>
      h('a', { class: 'card module', href: m.href },
        h('span', { class: 'logo' }, icon(m.d)),
        h('h2', null, m.title),
        h('p', null, m.text)))),
  );
}
