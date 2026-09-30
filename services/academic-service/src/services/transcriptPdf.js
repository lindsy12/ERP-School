const PDFDocument = require('pdfkit');
const studentModel = require('../models/studentModel');
const gradeModel = require('../models/gradeModel');

// Builds a student's transcript as a PDF.
//
// WHAT: generateTranscriptPdf(studentId) loads the student, their PUBLISHED grades grouped by
// semester, and their cumulative GPA, all through the existing models. It lays them out with
// pdfkit and returns the PDF as a Node Readable stream. It returns null if the student
// doesn't exist.
//
// WHY stream instead of saving a file to disk:
//   - Nothing to clean up. A saved file needs a temp path, a delete afterwards, and a plan for
//     when the delete fails; otherwise the disk slowly fills with old transcripts.
//   - It behaves the same whether it runs once or a thousand times at once. Each request gets
//     its own in-memory document; there are no shared file names to collide or disks to fill.
//   - It works in containers, which often have a read-only or throwaway filesystem.
//   - The client starts receiving bytes as soon as they're produced.
//   - A transcript is always rebuilt from current data, so there's no stale copy on disk to
//     go out of date after a grade appeal.
//
// All database reads happen BEFORE the stream is returned. By the time the controller sends
// headers and starts piping, every way this can fail on data (unknown student, DB error) has
// already happened, so the client still gets a proper 404/500 JSON response and never a
// half-written PDF.

// ---------- matric number ----------

// PLACEHOLDER: the students table has no matric number column yet, so this derives one from
// the internal id (student 42 -> "STU000042"). It's stable and unique, but it's NOT an
// institution-issued matric number. Once a real column exists (and studentModel selects it),
// return student.matric_number here; this is the only place to change.
function getMatricNumber(student) {
  return `STU${String(student.id).padStart(6, '0')}`;
}

// ---------- data ----------

// Credit-weighted GPA for a list of grades, computed with integers (hundredths of a point) so
// it rounds exactly like gradeModel.getGPA's DECIMAL arithmetic in MySQL. Floating-point
// could, for example, round 2.675 down to 2.67 where MySQL gives 2.68.
//   GPA = sum(grade_points * credit_hours) / sum(credit_hours)
// Returns { gpa, credits }, with gpa null for an empty list.
function semesterGpa(grades) {
  let weightedHundredths = 0;
  let credits = 0;
  for (const g of grades) {
    weightedHundredths += Math.round(g.grade_points * 100) * g.credit_hours;
    credits += g.credit_hours;
  }
  if (credits === 0) return { gpa: null, credits: 0 };
  return { gpa: Math.round(weightedHundredths / credits) / 100, credits };
}

// Groups published grades into semesters, keeping getGradesForStudent's order
// (semester start date, then course code).
// Why filter here: getGradesForStudent returns drafts too, and drafts must never appear on a
// transcript because they can still change.
function groupBySemester(grades) {
  const semesters = [];
  const byId = new Map();
  for (const g of grades) {
    if (!g.published) continue;
    if (!byId.has(g.semester_id)) {
      const semester = { semesterId: g.semester_id, name: g.semester_name, grades: [] };
      byId.set(g.semester_id, semester);
      semesters.push(semester);
    }
    byId.get(g.semester_id).grades.push(g);
  }
  return semesters;
}

// ---------- layout ----------

const MARGIN = 50;
// Table columns: x position and width, in points (A4 is 595 x 842; content runs 50 -> 545).
const COLS = {
  code: { x: 50, width: 65 },
  title: { x: 120, width: 250 },
  credits: { x: 375, width: 50 },
  grade: { x: 430, width: 45 },
  points: { x: 480, width: 65 },
};
const ROW_HEIGHT = 16;

const fmt2 = (n) => (n === null ? '-' : n.toFixed(2));

// Shortens text with "..." until it fits `width` at the current font size.
// Why: a long course title would otherwise wrap into the next row and break the table layout.
function fitText(doc, text, width) {
  if (doc.widthOfString(text) <= width) return text;
  let cut = text;
  while (cut.length > 0 && doc.widthOfString(`${cut}...`) > width) cut = cut.slice(0, -1);
  return `${cut.trimEnd()}...`;
}

// Starts a new page if fewer than `needed` points remain above the bottom margin.
// Why: we place table rows at exact y positions, and pdfkit only adds pages automatically for
// flowing text, not for rows we position ourselves.
function ensureSpace(doc, needed) {
  if (doc.y + needed > doc.page.height - MARGIN) doc.addPage();
}

function horizontalRule(doc) {
  doc.moveTo(MARGIN, doc.y).lineTo(doc.page.width - MARGIN, doc.y).lineWidth(0.5).stroke();
}

// Writes one table row at the current y. `bold` is used for the header row.
function tableRow(doc, cells, { bold = false } = {}) {
  ensureSpace(doc, ROW_HEIGHT);
  const y = doc.y;
  doc.font(bold ? 'Helvetica-Bold' : 'Helvetica').fontSize(10);
  doc.text(cells.code, COLS.code.x, y, { width: COLS.code.width, lineBreak: false });
  doc.text(fitText(doc, cells.title, COLS.title.width), COLS.title.x, y, { width: COLS.title.width, lineBreak: false });
  doc.text(cells.credits, COLS.credits.x, y, { width: COLS.credits.width, align: 'right', lineBreak: false });
  doc.text(cells.grade, COLS.grade.x, y, { width: COLS.grade.width, align: 'center', lineBreak: false });
  doc.text(cells.points, COLS.points.x, y, { width: COLS.points.width, align: 'right', lineBreak: false });
  doc.x = MARGIN;
  doc.y = y + ROW_HEIGHT;
}

// ---------- main ----------

async function generateTranscriptPdf(studentId) {
  // 1. Load everything first (see the note at the top of the file).
  const student = await studentModel.getStudentById(studentId);
  if (!student) return null;
  const [grades, cumulative] = await Promise.all([
    gradeModel.getGradesForStudent(studentId),
    gradeModel.getGPA(studentId),
  ]);
  const semesters = groupBySemester(grades);
  const matricNumber = getMatricNumber(student);
  const fullName = `${student.first_name} ${student.last_name}`;

  // 2. Lay out the document. pdfkit writes into the stream as we go; doc.end() finishes it.
  const doc = new PDFDocument({
    size: 'A4',
    margin: MARGIN,
    info: { Title: `Academic Transcript - ${fullName}`, Author: 'Academic Service' },
  });

  // Header: title, then the student's identity.
  doc.font('Helvetica-Bold').fontSize(18).text('Academic Transcript', { align: 'center' });
  doc.moveDown(1);
  doc.fontSize(11);
  doc.font('Helvetica-Bold').text('Name: ', { continued: true }).font('Helvetica').text(fullName);
  doc.font('Helvetica-Bold').text('Matric No.: ', { continued: true }).font('Helvetica').text(matricNumber);
  doc.font('Helvetica-Bold').text('Generated: ', { continued: true }).font('Helvetica')
    .text(new Date().toISOString().slice(0, 10));
  doc.moveDown(0.5);
  horizontalRule(doc);
  doc.moveDown(1);

  if (semesters.length === 0) {
    doc.font('Helvetica-Oblique').fontSize(11).text('No published grades yet.');
    doc.moveDown(1);
  }

  // One section per semester: heading, table, semester GPA.
  for (const semester of semesters) {
    // Keep the heading with at least the table header and one row, so it's never stranded
    // alone at the bottom of a page.
    ensureSpace(doc, 20 + ROW_HEIGHT * 2);
    doc.x = MARGIN;
    doc.font('Helvetica-Bold').fontSize(13).text(semester.name);
    doc.moveDown(0.3);

    tableRow(doc, { code: 'Code', title: 'Course Title', credits: 'Credits', grade: 'Grade', points: 'Points' }, { bold: true });
    for (const g of semester.grades) {
      tableRow(doc, {
        code: g.course_code,
        title: g.course_title,
        credits: String(g.credit_hours),
        grade: g.grade_letter,
        points: fmt2(g.grade_points),
      });
    }

    const { gpa, credits } = semesterGpa(semester.grades);
    ensureSpace(doc, ROW_HEIGHT);
    doc.font('Helvetica-Bold').fontSize(10)
      .text(`Semester GPA: ${fmt2(gpa)}   (${credits} credits)`, MARGIN, doc.y + 2, {
        width: doc.page.width - MARGIN * 2,
        align: 'right',
      });
    doc.moveDown(1.2);
  }

  // Footer: cumulative GPA, using the same function as the grades endpoint so they always agree.
  ensureSpace(doc, 50);
  doc.x = MARGIN;
  horizontalRule(doc);
  doc.moveDown(0.6);
  doc.font('Helvetica-Bold').fontSize(12)
    .text(`Cumulative GPA: ${fmt2(cumulative.gpa)}   (${cumulative.totalCredits} credits)`, MARGIN, doc.y, {
      width: doc.page.width - MARGIN * 2,
      align: 'right',
    });
  doc.moveDown(1.5);
  doc.font('Helvetica').fontSize(8).fillColor('#555555')
    .text(
      'Only published grades are shown. GPA is weighted by credit hours on a 4.00 scale.',
      MARGIN, doc.y, { width: doc.page.width - MARGIN * 2, align: 'center' }
    );

  doc.end();
  // A PDFDocument is itself a Readable stream of the PDF bytes.
  return doc;
}

module.exports = {
  generateTranscriptPdf,
  getMatricNumber,
};
