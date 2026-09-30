const studentModel = require('../models/studentModel');
const { generateTranscriptPdf, getMatricNumber } = require('../services/transcriptPdf');
const { parseId } = require('../utils/validation');

// Express route handler for transcript downloads.

// GET /api/v1/students/:studentId/transcript/pdf
// Streams the student's transcript as a downloadable PDF named transcript-<matricNumber>.pdf.
// 400 non-integer id; 404 student not found.
//
// Order matters: everything that can fail with a normal JSON error (bad id, unknown student,
// DB errors while loading the data) happens BEFORE any header is sent. Once we set the PDF
// headers and start piping, the status is already 200 and can't be changed. So an error
// mid-stream (very unlikely, since the data is already loaded) can only abort the connection,
// and the client sees a failed download rather than a corrupt "successful" file.
async function downloadTranscript(req, res) {
  const studentId = parseId(req.params.studentId);
  if (studentId === null) return res.status(400).json({ error: 'studentId must be a positive integer' });

  let pdf;
  let student;
  try {
    student = await studentModel.getStudentById(studentId);
    if (!student) return res.status(404).json({ error: `Student ${studentId} not found` });

    pdf = await generateTranscriptPdf(studentId);
    // The student could be deleted between the two reads; treat it the same as not found.
    if (!pdf) return res.status(404).json({ error: `Student ${studentId} not found` });
  } catch (err) {
    console.error('downloadTranscript failed:', err);
    return res.status(500).json({ error: 'Failed to generate transcript' });
  }

  // "attachment" makes the browser download the file rather than display it inline. The
  // filename only contains [A-Z0-9], so it needs no quoting or encoding.
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `attachment; filename="transcript-${getMatricNumber(student)}.pdf"`);
  // A transcript contains personal data and changes after regrades, so don't let caches keep it.
  res.setHeader('Cache-Control', 'no-store');

  pdf.on('error', (err) => {
    console.error(`downloadTranscript: PDF stream failed for student ${studentId}:`, err);
    res.destroy(err);
  });
  pdf.pipe(res);
}

module.exports = {
  downloadTranscript,
};
