// Student portal: the signed-in student's own academic record. Everything comes from the
// Academic API through the gateway; academic-service only returns this student's own data
// (their account is linked to their record by email, see src/middleware/identity.js).
import { api, accessToken, signOut } from '/auth/js/session.js';
import { allowRoles } from '/auth/js/access.js';
import { h, clear, badge, fmtDate, toast, busy, loading, table, field, select } from '/auth/js/ui.js';

const API = '/api/v1/academic';
const $ = (id) => document.getElementById(id);
let me; // the student record: { id, first_name, last_name, email, matric_number, ... }

const REASONS = { attendance_below_75: 'attendance below 75%', two_consecutive_fails: 'two failing grades in a row' };
const time = (t) => (t || '').slice(0, 5);
const pct = (n) => (n === null || n === undefined ? '—' : `${Number(n).toFixed(0)}%`);

function pageHead(title, sub, ...actions) {
  return h('div', { class: 'page-head' },
    h('div', null, h('h1', null, title), sub ? h('p', { class: 'muted' }, sub) : null),
    actions.length ? h('div', { class: 'toolbar' }, actions) : null);
}
function stat(label, value, sub) {
  return h('div', { class: 'stat' }, h('div', { class: 'label' }, label), h('div', { class: 'value' }, value), sub ? h('div', { class: 'sub' }, sub) : null);
}
const activeEnrollments = (list) => list.filter((e) => e.status === 'enrolled');

// ---------- Views ----------

async function dashboard(root) {
  const [grades, attendance, risk, enrollments] = await Promise.all([
    api(`${API}/students/${me.id}/grades`),
    api(`${API}/students/${me.id}/attendance`),
    api(`${API}/students/${me.id}/at-risk`),
    api(`${API}/students/${me.id}/enrollments`),
  ]);
  const current = activeEnrollments(enrollments);
  root.append(...[
    pageHead(`Welcome, ${me.first_name}`, `${me.matric_number} · ${me.email}`),
    risk.isAtRisk
      ? h('div', { class: 'notice warn', role: 'alert' }, `You are flagged as at risk (${risk.reasons.map((r) => REASONS[r] || r).join('; ')}). Please see your academic advisor.`)
      : null,
    h('div', { class: 'stat-grid' },
      stat('GPA', grades.gpa === null ? '—' : Number(grades.gpa).toFixed(2), 'published grades only'),
      stat('Credits earned', grades.totalCredits),
      stat('Attendance', pct(attendance.summary.percentage), `${attendance.summary.presentSessions} of ${attendance.summary.totalSessions} sessions`),
      stat('Courses', current.length, 'currently enrolled')),
    h('div', { class: 'card' }, h('h2', null, 'Current courses'),
      table([
        { label: 'Code', key: 'course_code' },
        { label: 'Course', key: 'course_title' },
        { label: 'Semester', key: 'semester_name' },
      ], current, { empty: 'You are not enrolled in any course yet. Use Course registration.' })),
  ].filter(Boolean)); // append() would print a null as the text "null"

}

async function register(root) {
  const [courses, semesters, enrollments] = await Promise.all([
    api(`${API}/courses`), api(`${API}/semesters`), api(`${API}/students/${me.id}/enrollments`),
  ]);
  const today = new Date().toISOString().slice(0, 10);
  const open = semesters.filter((s) => s.end_date >= today);
  if (!open.length) {
    root.append(pageHead('Course registration'), h('div', { class: 'card empty' }, h('strong', null, 'No semester is open for registration.')));
    return;
  }
  const semesterSelect = select('semester', open.map((s) => [s.id, `${s.name} (${fmtDate(s.start_date)} – ${fmtDate(s.end_date)})`]), open[0].id);
  const list = h('div');

  const render = () => {
    const semesterId = Number(semesterSelect.value);
    const taken = new Set(enrollments.filter((e) => e.semester_id === semesterId && e.status === 'enrolled').map((e) => e.course_id));
    clear(list);
    list.append(table([
      { label: 'Code', key: 'course_code', render: (c) => c.code },
      { label: 'Course', key: 'title' },
      { label: 'Credits', key: 'credit_hours', align: 'right' },
      {
        label: '', actions: true,
        render: (c) => (taken.has(c.id) ? badge('Registered', 'ok') : h('button', {
          class: 'btn sm', type: 'button',
          onClick: (e) => busy(e.currentTarget, async () => {
            try {
              const enrollment = await api(`${API}/enrollments`, { method: 'POST', body: { studentId: me.id, courseId: c.id, semesterId } });
              enrollments.push({ ...enrollment, course_id: c.id, semester_id: semesterId, status: 'enrolled' });
              toast(`Registered for ${c.code}. Your tuition invoice is on its way to the bursar.`, 'ok');
              render();
            } catch (err) {
              toast(err.message, 'bad');
            }
          }),
        }, 'Register')),
      },
    ], courses, { empty: 'No courses are offered yet.' }));
  };
  semesterSelect.addEventListener('change', render);
  root.append(
    pageHead('Course registration', 'Registering creates your tuition invoice. Prerequisites are checked for you.'),
    h('div', { class: 'toolbar' }, field('Semester', semesterSelect)),
    list,
  );
  render();
}

async function courses(root) {
  const enrollments = await api(`${API}/students/${me.id}/enrollments`);
  root.append(pageHead('My courses', 'Every course you have registered for.'),
    table([
      { label: 'Code', key: 'course_code' },
      { label: 'Course', key: 'course_title' },
      { label: 'Semester', key: 'semester_name' },
      { label: 'Registered', render: (e) => fmtDate(e.enrolled_at) },
      { label: 'Status', render: (e) => (e.status === 'enrolled' ? badge('Enrolled', 'ok') : badge('Dropped')) },
    ], enrollments, { empty: 'No registrations yet.' }));
}

function appealButton(grade) {
  const cell = h('div');
  const open = h('button', { class: 'btn ghost sm', type: 'button' }, 'Appeal');
  open.addEventListener('click', () => {
    const reason = h('textarea', { maxlength: 2000, placeholder: 'Explain why this grade should be reviewed' });
    const send = h('button', { class: 'btn sm', type: 'button' }, 'Send appeal');
    send.addEventListener('click', () => busy(send, async () => {
      if (!reason.value.trim()) { toast('Please give a reason.', 'bad'); return; }
      try {
        await api(`${API}/grades/${grade.id}/appeals`, { method: 'POST', body: { studentId: me.id, reason: reason.value.trim() } });
        clear(cell);
        cell.append(badge('Appeal sent', 'info'));
        toast('Your appeal was sent to your lecturer.', 'ok');
      } catch (err) {
        toast(err.status === 409 ? 'You already have an open appeal for this grade.' : err.message, 'bad');
      }
    }));
    clear(cell);
    cell.append(h('div', { class: 'appeal-form' }, reason, send));
  });
  cell.append(open);
  return cell;
}

async function downloadTranscript(button) {
  await busy(button, async () => {
    const token = await accessToken();
    const res = await fetch(`${API}/students/${me.id}/transcript/pdf`, { headers: { Authorization: `Bearer ${token}` } });
    if (!res.ok) throw new Error(`Could not create the transcript (HTTP ${res.status})`);
    const url = URL.createObjectURL(await res.blob());
    const link = h('a', { href: url, download: `transcript-${me.matric_number}.pdf` });
    document.body.append(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 10000);
  });
}

async function grades(root) {
  const data = await api(`${API}/students/${me.id}/grades`);
  const bySemester = new Map();
  data.grades.forEach((g) => {
    if (!bySemester.has(g.semester_name)) bySemester.set(g.semester_name, []);
    bySemester.get(g.semester_name).push(g);
  });
  const pdf = h('button', { class: 'btn secondary', type: 'button' }, 'Download transcript (PDF)');
  pdf.addEventListener('click', () => downloadTranscript(pdf));
  root.append(pageHead('Grades & transcript',
    `GPA ${data.gpa === null ? '—' : Number(data.gpa).toFixed(2)} · ${data.totalCredits} credits · only published grades are shown`, pdf));
  if (!bySemester.size) {
    root.append(h('div', { class: 'card empty' }, h('strong', null, 'No published grades yet.')));
    return;
  }
  bySemester.forEach((list, semester) => {
    root.append(h('div', { class: 'term' }, h('h3', null, semester), table([
      { label: 'Code', key: 'course_code' },
      { label: 'Course', key: 'course_title' },
      { label: 'Credits', key: 'credit_hours', align: 'right' },
      { label: 'Grade', render: (g) => badge(g.grade_letter, g.grade_letter === 'F' ? 'bad' : 'ok') },
      { label: 'Points', render: (g) => g.grade_points.toFixed(2), align: 'right' },
      { label: 'Published', render: (g) => fmtDate(g.published_at) },
      { label: '', actions: true, render: appealButton },
    ], list)));
  });
}

async function attendance(root) {
  const data = await api(`${API}/students/${me.id}/attendance`);
  const s = data.summary;
  const kind = { present: 'ok', late: 'warn', absent: 'bad' };
  root.append(
    pageHead('Attendance', 'Below 75% you are flagged as at risk.'),
    h('div', { class: 'stat-grid' },
      stat('Attendance', pct(s.percentage)),
      stat('Present', s.presentSessions), stat('Late', s.lateSessions), stat('Sessions', s.totalSessions)),
    table([
      { label: 'Date', render: (r) => fmtDate(r.session_date) },
      { label: 'Time', render: (r) => `${time(r.start_time)}–${time(r.end_time)}` },
      { label: 'Course', render: (r) => `${r.course_code} · ${r.course_title}` },
      { label: 'Status', render: (r) => badge(r.status, kind[r.status]) },
    ], data.records, { empty: 'No attendance has been taken yet.' }),
  );
}

async function timetable(root) {
  const [enrollments, exams] = await Promise.all([api(`${API}/students/${me.id}/enrollments`), api(`${API}/exams`)]);
  const mine = new Set(activeEnrollments(enrollments).map((e) => `${e.course_id}:${e.semester_id}`));
  const myExams = exams.filter((x) => mine.has(`${x.course_id}:${x.semester_id}`));
  root.append(pageHead('Exam timetable', 'Exams for the courses you are enrolled in.'),
    table([
      { label: 'Date', render: (x) => fmtDate(x.exam_date) },
      { label: 'Time', render: (x) => `${time(x.start_time)}–${time(x.end_time)}` },
      { label: 'Course', render: (x) => `${x.course_code} · ${x.course_title}` },
      { label: 'Semester', key: 'semester_name' },
      { label: 'Room', key: 'room' },
    ], myExams, { empty: 'No exams are scheduled for your courses yet.' }));
}

// ---------- Shell ----------

const ROUTES = { dashboard, register, courses, grades, attendance, timetable };
let navToken = 0;

async function route() {
  const name = location.hash.replace(/^#\//, '') || 'dashboard';
  const view = ROUTES[name] ? name : 'dashboard';
  document.querySelectorAll('#nav a[data-route]').forEach((a) => {
    if (a.dataset.route === view) a.setAttribute('aria-current', 'page'); else a.removeAttribute('aria-current');
  });
  const token = ++navToken;
  const root = $('view');
  clear(root);
  root.append(loading());
  const fresh = h('div');
  try {
    await ROUTES[view](fresh);
  } catch (err) {
    if (err.status === 401) return;
    fresh.replaceChildren(h('div', { class: 'card empty' }, h('strong', null, 'Something went wrong loading this page'), h('p', null, err.message)));
  }
  if (token !== navToken) return;
  clear(root);
  root.append(fresh);
}

async function boot() {
  const account = await allowRoles(['STUDENT']);
  if (!account) return;
  $('logout').addEventListener('click', async () => { await signOut(); location.assign('/auth/'); });
  $('who').textContent = account.email;
  try {
    me = await api(`${API}/students/me`);
  } catch (err) {
    $('who-sub').textContent = 'Student';
    clear($('view'));
    $('view').append(h('div', { class: 'card empty' },
      h('strong', null, 'Your account is not linked to a student record yet'),
      h('p', null, err.status === 404 ? err.message : `Could not load your record: ${err.message}`)));
    return;
  }
  $('who-sub').textContent = `${me.first_name} ${me.last_name} · ${me.matric_number}`;
  window.addEventListener('hashchange', route);
  route();
}

boot();
