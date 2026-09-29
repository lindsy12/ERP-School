-- Academic Service schema: programs, courses, and course prerequisites.
-- Run against academic_db, e.g.:
--   mysql -h 127.0.0.1 -P 3307 -u root -p academic_db < src/db/schema.sql
-- Uses IF NOT EXISTS so it is safe to re-run.

-- A program is a degree/track (e.g. "BSc Computer Science") that groups courses.
CREATE TABLE IF NOT EXISTS programs (
  id           INT UNSIGNED  NOT NULL AUTO_INCREMENT,
  name         VARCHAR(150)  NOT NULL,
  description  TEXT          NULL,
  created_at   TIMESTAMP     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_programs_name (name)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- A course belongs to exactly one program.
-- ON DELETE RESTRICT: a program can't be deleted while it still has courses,
-- so courses are never silently orphaned or wiped out.
CREATE TABLE IF NOT EXISTS courses (
  id            INT UNSIGNED     NOT NULL AUTO_INCREMENT,
  program_id    INT UNSIGNED     NOT NULL,
  code          VARCHAR(20)      NOT NULL,
  title         VARCHAR(200)     NOT NULL,
  description   TEXT             NULL,
  credit_hours  TINYINT UNSIGNED NOT NULL,
  created_at    TIMESTAMP        NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_courses_code (code),
  KEY idx_courses_program_id (program_id),
  CONSTRAINT fk_courses_program
    FOREIGN KEY (program_id) REFERENCES programs (id)
    ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Join table: each row says "course_id requires prerequisite_course_id".
-- A course can have many rows here, i.e. many prerequisites.
--   course_id side              -> ON DELETE CASCADE: deleting a course removes its own prerequisite links.
--   prerequisite_course_id side -> ON DELETE RESTRICT: a course that other courses depend on
--                                  can't be deleted until those links are removed first.
-- The UNIQUE key stops the same prerequisite being linked twice.
-- (A course being its own prerequisite is rejected in the controller; MySQL does not allow
--  a CHECK constraint on columns that also have FK ON DELETE actions.)
CREATE TABLE IF NOT EXISTS course_prerequisites (
  id                      INT UNSIGNED NOT NULL AUTO_INCREMENT,
  course_id               INT UNSIGNED NOT NULL,
  prerequisite_course_id  INT UNSIGNED NOT NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uq_course_prereq (course_id, prerequisite_course_id),
  KEY idx_prereq_prerequisite_course_id (prerequisite_course_id),
  CONSTRAINT fk_prereq_course
    FOREIGN KEY (course_id) REFERENCES courses (id)
    ON DELETE CASCADE,
  CONSTRAINT fk_prereq_prerequisite
    FOREIGN KEY (prerequisite_course_id) REFERENCES courses (id)
    ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================================
-- Student enrollment
-- ============================================================

-- A student at the school. email is UNIQUE so the same person can't be registered twice.
-- enrollment_date is when they joined the school (not a course); it defaults to today.
CREATE TABLE IF NOT EXISTS students (
  id               INT UNSIGNED  NOT NULL AUTO_INCREMENT,
  first_name       VARCHAR(100)  NOT NULL,
  last_name        VARCHAR(100)  NOT NULL,
  email            VARCHAR(255)  NOT NULL,
  enrollment_date  DATE          NOT NULL DEFAULT (CURRENT_DATE),
  created_at       TIMESTAMP     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_students_email (email)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- A teaching period, e.g. "Fall 2026". Dates decide which semesters count as "prior"
-- when checking prerequisites, so end_date must not come before start_date.
CREATE TABLE IF NOT EXISTS semesters (
  id          INT UNSIGNED  NOT NULL AUTO_INCREMENT,
  name        VARCHAR(50)   NOT NULL,
  start_date  DATE          NOT NULL,
  end_date    DATE          NOT NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uq_semesters_name (name),
  CONSTRAINT chk_semesters_dates CHECK (end_date >= start_date)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- One row per (student, course, semester). The UNIQUE key blocks double-enrolling in the
-- same course in the same semester. Note it also blocks re-enrolling after a 'dropped' row
-- in that same semester; that would need to reactivate the existing row instead.
-- All FKs are ON DELETE RESTRICT: enrollment history is a permanent academic record, so a
-- student, course or semester that has enrollments can't be deleted out from under it.
CREATE TABLE IF NOT EXISTS enrollments (
  id           INT UNSIGNED               NOT NULL AUTO_INCREMENT,
  student_id   INT UNSIGNED               NOT NULL,
  course_id    INT UNSIGNED               NOT NULL,
  semester_id  INT UNSIGNED               NOT NULL,
  status       ENUM('enrolled','dropped') NOT NULL DEFAULT 'enrolled',
  enrolled_at  TIMESTAMP                  NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_enrollment (student_id, course_id, semester_id),
  KEY idx_enrollments_course_id (course_id),
  KEY idx_enrollments_semester_id (semester_id),
  CONSTRAINT fk_enrollments_student
    FOREIGN KEY (student_id) REFERENCES students (id)
    ON DELETE RESTRICT,
  CONSTRAINT fk_enrollments_course
    FOREIGN KEY (course_id) REFERENCES courses (id)
    ON DELETE RESTRICT,
  CONSTRAINT fk_enrollments_semester
    FOREIGN KEY (semester_id) REFERENCES semesters (id)
    ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================================
-- Attendance
-- ============================================================

-- One scheduled meeting of a course in a semester (e.g. CS101, Fall 2026, 2026-09-07 09:00-10:30).
-- The UNIQUE key stops the same meeting being created twice, which would double-count it
-- in attendance percentages.
CREATE TABLE IF NOT EXISTS class_sessions (
  id            INT UNSIGNED NOT NULL AUTO_INCREMENT,
  course_id     INT UNSIGNED NOT NULL,
  semester_id   INT UNSIGNED NOT NULL,
  session_date  DATE         NOT NULL,
  start_time    TIME         NOT NULL,
  end_time      TIME         NOT NULL,
  created_at    TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_class_session (course_id, semester_id, session_date, start_time),
  KEY idx_class_sessions_semester_id (semester_id),
  CONSTRAINT chk_class_sessions_times CHECK (end_time > start_time),
  CONSTRAINT fk_class_sessions_course
    FOREIGN KEY (course_id) REFERENCES courses (id)
    ON DELETE RESTRICT,
  CONSTRAINT fk_class_sessions_semester
    FOREIGN KEY (semester_id) REFERENCES semesters (id)
    ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- One row per student per session. UNIQUE (session_id, student_id) means a student can't be
-- marked twice for the same session. FKs are RESTRICT: attendance is a permanent record.
CREATE TABLE IF NOT EXISTS attendance_records (
  id           INT UNSIGNED                      NOT NULL AUTO_INCREMENT,
  session_id   INT UNSIGNED                      NOT NULL,
  student_id   INT UNSIGNED                      NOT NULL,
  status       ENUM('present','absent','late')   NOT NULL,
  recorded_at  TIMESTAMP                         NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_attendance (session_id, student_id),
  KEY idx_attendance_student_id (student_id),
  CONSTRAINT fk_attendance_session
    FOREIGN KEY (session_id) REFERENCES class_sessions (id)
    ON DELETE RESTRICT,
  CONSTRAINT fk_attendance_student
    FOREIGN KEY (student_id) REFERENCES students (id)
    ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================================
-- Grades
-- ============================================================

-- One final grade per student per course per semester (UNIQUE key).
-- A grade is recorded as a draft (published = FALSE) and can be corrected until it is
-- published. Publishing makes it visible, fires academic.grade.published, and freezes it.
-- grade_points is DECIMAL (exact), not FLOAT, so GPA sums don't pick up rounding noise;
-- the CHECK keeps it on a 0.00-4.00 scale.
CREATE TABLE IF NOT EXISTS grades (
  id            INT UNSIGNED                  NOT NULL AUTO_INCREMENT,
  student_id    INT UNSIGNED                  NOT NULL,
  course_id     INT UNSIGNED                  NOT NULL,
  semester_id   INT UNSIGNED                  NOT NULL,
  grade_letter  ENUM('A','B','C','D','F')     NOT NULL,
  grade_points  DECIMAL(3,2)                  NOT NULL,
  published     BOOLEAN                       NOT NULL DEFAULT FALSE,
  published_at  TIMESTAMP                     NULL DEFAULT NULL,
  created_at    TIMESTAMP                     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_grade (student_id, course_id, semester_id),
  KEY idx_grades_course_id (course_id),
  KEY idx_grades_semester_id (semester_id),
  CONSTRAINT chk_grades_points CHECK (grade_points BETWEEN 0.00 AND 4.00),
  CONSTRAINT fk_grades_student
    FOREIGN KEY (student_id) REFERENCES students (id)
    ON DELETE RESTRICT,
  CONSTRAINT fk_grades_course
    FOREIGN KEY (course_id) REFERENCES courses (id)
    ON DELETE RESTRICT,
  CONSTRAINT fk_grades_semester
    FOREIGN KEY (semester_id) REFERENCES semesters (id)
    ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
