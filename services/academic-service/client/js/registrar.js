// Registrar (administrators only): students, enrolment, programs, courses and semesters.
// A student can sign in once an administrator also creates a STUDENT account with the same email
// on the Users page (/auth/#/users); the email links the account to the record.
import { api, signOut } from '/auth/js/session.js';
import { allowRoles, ROLE_LABELS } from '/auth/js/access.js';
import { h, clear, fmtDate, toast, busy, loading, table, field, select, modal } from '/auth/js/ui.js';

const API = '/api/v1/academic';
const $ = (id) => document.getElementById(id);

function pageHead(title, sub, ...actions) {
  return h('div', { class: 'page-head' },
    h('div', null, h('h1', null, title), sub ? h('p', { class: 'muted' }, sub) : null),
    actions.length ? h('div', { class: 'toolbar' }, actions) : null);
}
const input = (name, attrs = {}) => h('input', { name, required: true, ...attrs });

// Opens a form in a dialog; `send(values)` does the request, then the current view reloads.
function formDialog(title, fields, send, submitLabel = 'Save') {
  const form = h('form', { class: 'form-grid' }, fields);
  modal(title, (close) => {
    const submit = h('button', { class: 'btn', type: 'button' }, submitLabel);
    submit.addEventListener('click', () => busy(submit, async () => {
      if (!form.reportValidity()) return;
      await send(Object.fromEntries(new FormData(form)));
      close();
      route();
    }));
    return { body: form, actions: [h('button', { class: 'btn secondary', type: 'button', onClick: close }, 'Cancel'), submit] };
  });
}

// ---------- Views ----------

async function students(root) {
  const list = await api(`${API}/students`);
  const add = h('button', { class: 'btn', type: 'button' }, 'New student');
  add.addEventListener('click', () => formDialog('New student', [
    field('First name', input('firstName', { maxlength: 100 })),
    field('Last name', input('lastName', { maxlength: 100 })),
    h('div', { class: 'full' }, field('Email', input('email', { type: 'email', maxlength: 255 }),
      'Use the same email for the student\'s sign-in account (Users page) so they see their own portal.')),
  ], async (v) => {
    const s = await api(`${API}/students`, { method: 'POST', body: v });
    toast(`Student ${s.first_name} ${s.last_name} created`, 'ok');
  }, 'Create student'));
  root.append(pageHead('Students', `${list.length} students`, add), table([
    { label: 'Matric', render: (s) => `STU${String(s.id).padStart(6, '0')}` },
    { label: 'Name', render: (s) => `${s.last_name}, ${s.first_name}` },
    { label: 'Email', key: 'email' },
    { label: 'Since', render: (s) => fmtDate(s.enrollment_date) },
  ], list, { empty: 'No students yet.' }));
}

async function enrol(root) {
  const [studentList, courseList, semesterList] = await Promise.all([api(`${API}/students`), api(`${API}/courses`), api(`${API}/semesters`)]);
  if (!studentList.length || !courseList.length || !semesterList.length) {
    root.append(pageHead('Enrol a student'), h('div', { class: 'card empty' }, h('strong', null, 'Create at least one student, course and semester first.')));
    return;
  }
  const form = h('form', { class: 'form-grid card' },
    field('Student', select('studentId', studentList.map((s) => [s.id, `${s.last_name}, ${s.first_name} (STU${String(s.id).padStart(6, '0')})`]))),
    field('Semester', select('semesterId', semesterList.map((s) => [s.id, s.name]), semesterList[semesterList.length - 1].id)),
    h('div', { class: 'full' }, field('Course', select('courseId', courseList.map((c) => [c.id, `${c.code} — ${c.title}`])))),
  );
  const submit = h('button', { class: 'btn', type: 'button' }, 'Enrol');
  submit.addEventListener('click', () => busy(submit, async () => {
    const v = Object.fromEntries(new FormData(form));
    await api(`${API}/enrollments`, { method: 'POST', body: { studentId: Number(v.studentId), courseId: Number(v.courseId), semesterId: Number(v.semesterId) } });
    toast('Enrolled. Finance creates the tuition invoice automatically.', 'ok');
  }));
  form.append(h('div', { class: 'full' }, submit));
  root.append(pageHead('Enrol a student', 'Prerequisites are checked; the enrolment event makes Finance issue the tuition invoice.'), form);
}

async function courses(root) {
  const [programList, courseList] = await Promise.all([api(`${API}/programs`), api(`${API}/courses`)]);
  const addProgram = h('button', { class: 'btn secondary', type: 'button' }, 'New program');
  addProgram.addEventListener('click', () => formDialog('New program', [
    h('div', { class: 'full' }, field('Name', input('name', { maxlength: 150 }))),
    h('div', { class: 'full' }, field('Description', h('input', { name: 'description' }))),
  ], async (v) => {
    await api(`${API}/programs`, { method: 'POST', body: v });
    toast('Program created', 'ok');
  }));
  const addCourse = h('button', { class: 'btn', type: 'button', disabled: !programList.length }, 'New course');
  addCourse.addEventListener('click', () => formDialog('New course', [
    field('Program', select('program_id', programList.map((p) => [p.id, p.name]))),
    field('Code', input('code', { maxlength: 20, placeholder: 'SEN4121' })),
    h('div', { class: 'full' }, field('Title', input('title', { maxlength: 200 }))),
    field('Credit hours', input('credit_hours', { type: 'number', min: 1, max: 30, value: 3 })),
  ], async (v) => {
    await api(`${API}/courses`, { method: 'POST', body: { ...v, program_id: Number(v.program_id), credit_hours: Number(v.credit_hours) } });
    toast(`Course ${v.code} created`, 'ok');
  }));
  const programName = new Map(programList.map((p) => [p.id, p.name]));
  root.append(pageHead('Programs & courses', `${programList.length} programs · ${courseList.length} courses`, addProgram, addCourse), table([
    { label: 'Code', key: 'code' },
    { label: 'Title', key: 'title' },
    { label: 'Program', render: (c) => programName.get(c.program_id) || '—' },
    { label: 'Credits', key: 'credit_hours', align: 'right' },
  ], courseList, { empty: programList.length ? 'No courses yet.' : 'Create a program first, then its courses.' }));
}

async function semesters(root) {
  const list = await api(`${API}/semesters`);
  const add = h('button', { class: 'btn', type: 'button' }, 'New semester');
  add.addEventListener('click', () => formDialog('New semester', [
    h('div', { class: 'full' }, field('Name', input('name', { maxlength: 50, placeholder: 'Spring 2027' }))),
    field('Starts', input('startDate', { type: 'date' })),
    field('Ends', input('endDate', { type: 'date' })),
  ], async (v) => {
    await api(`${API}/semesters`, { method: 'POST', body: v });
    toast(`Semester ${v.name} created`, 'ok');
  }));
  root.append(pageHead('Semesters', null, add), table([
    { label: 'Name', key: 'name' },
    { label: 'Starts', render: (s) => fmtDate(s.start_date) },
    { label: 'Ends', render: (s) => fmtDate(s.end_date) },
  ], list, { empty: 'No semesters yet.' }));
}

// ---------- Shell ----------

const ROUTES = { students, enrol, courses, semesters };
let navToken = 0;

async function route() {
  const name = location.hash.replace(/^#\//, '') || 'students';
  const view = ROUTES[name] ? name : 'students';
  document.querySelectorAll('#nav a[data-route]').forEach((a) => {
    if (a.dataset.route === view) a.setAttribute('aria-current', 'page'); else a.removeAttribute('aria-current');
  });
  const token = ++navToken;
  clear($('view'));
  $('view').append(loading());
  const fresh = h('div');
  try {
    await ROUTES[view](fresh);
  } catch (err) {
    if (err.status === 401) return;
    fresh.replaceChildren(h('div', { class: 'card empty' }, h('strong', null, 'Something went wrong loading this page'), h('p', null, err.message)));
  }
  if (token !== navToken) return;
  clear($('view'));
  $('view').append(fresh);
}

async function boot() {
  const me = await allowRoles(['SUPER_ADMIN', 'ADMIN']);
  if (!me) return;
  $('who').textContent = me.email;
  $('who-sub').textContent = ROLE_LABELS[me.role] || me.role;
  $('logout').addEventListener('click', async () => { await signOut(); location.assign('/auth/'); });
  window.addEventListener('hashchange', route);
  route();
}

boot();
