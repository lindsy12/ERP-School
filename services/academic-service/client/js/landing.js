// Academics landing page: students go straight to their portal; staff and administrators see
// the tools their role uses.
import { currentUser } from '/auth/js/access.js';

const me = await currentUser();
if (me) {
  if (me.role === 'STUDENT') {
    location.replace('student-portal.html');
  } else {
    const admin = ['SUPER_ADMIN', 'ADMIN'].includes(me.role);
    document.getElementById('exams-text').textContent = admin
      ? 'Schedule exams by course, semester and room, with clash detection.'
      : 'The exam timetable for every course (scheduling is done by administrators).';
    document.getElementById('registrar-card').hidden = !admin;
    document.getElementById('modules').hidden = false;
  }
}
