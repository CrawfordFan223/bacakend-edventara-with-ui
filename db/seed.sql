-- Edventara test data
-- Run after db/schema.sql and, for older databases, db/update-events-schema.sql.
-- mysql -u root -p edventara < db/seed.sql

SET @test_password_hash = '$2b$10$52u7CkXOIG1qhoLtwl/.cey8/MS.lFC2Ix9uJ/howccg/W4OKS6Oy';

-- Insert EIS school
INSERT INTO schools (
  name,
  country,
  curriculum_type,
  contact_name,
  contact_email,
  estimated_size,
  message,
  status,
  is_active
) VALUES (
  'EIS',
  'Philippines',
  'K-12',
  'EIS Administrator',
  'admin@eis.edu',
  '500-1000 students',
  'Seed school for backend endpoint testing.',
  'approved',
  TRUE
) ON DUPLICATE KEY UPDATE
  country = VALUES(country),
  curriculum_type = VALUES(curriculum_type),
  contact_name = VALUES(contact_name),
  contact_email = VALUES(contact_email),
  estimated_size = VALUES(estimated_size),
  message = VALUES(message),
  status = VALUES(status),
  is_active = VALUES(is_active);

SET @eis_school_id = (SELECT id FROM schools WHERE name = 'EIS');

-- Insert authorization codes
INSERT INTO authorization_codes (school_id, code, is_active, max_uses, expires_at)
VALUES
  (@eis_school_id, 'EIS-AUTH-001', TRUE, 5, DATE_ADD(NOW(), INTERVAL 1 YEAR)),
  (@eis_school_id, 'EIS-AUTH-ADMIN', TRUE, 1, DATE_ADD(NOW(), INTERVAL 1 YEAR))
ON DUPLICATE KEY UPDATE
  school_id = VALUES(school_id),
  is_active = VALUES(is_active),
  max_uses = VALUES(max_uses),
  expires_at = VALUES(expires_at);

-- Insert invite codes for all 5 roles
INSERT INTO invite_codes (school_id, code, role_assigned, is_active, max_uses, expires_at)
VALUES
  (@eis_school_id, 'EIS-ADMIN-001', 'admin', TRUE, 5, DATE_ADD(NOW(), INTERVAL 1 YEAR)),
  (@eis_school_id, 'EIS-COORD-001', 'coordinator', TRUE, 20, DATE_ADD(NOW(), INTERVAL 1 YEAR)),
  (@eis_school_id, 'EIS-FACULTY-001', 'faculty', TRUE, 50, DATE_ADD(NOW(), INTERVAL 1 YEAR)),
  (@eis_school_id, 'EIS-PARENT-001', 'parent', TRUE, 200, DATE_ADD(NOW(), INTERVAL 1 YEAR)),
  (@eis_school_id, 'EIS-STUDENT-001', 'student', TRUE, 500, DATE_ADD(NOW(), INTERVAL 1 YEAR))
ON DUPLICATE KEY UPDATE
  school_id = VALUES(school_id),
  role_assigned = VALUES(role_assigned),
  is_active = VALUES(is_active),
  max_uses = VALUES(max_uses),
  expires_at = VALUES(expires_at);

-- Insert test users for each role
-- Password for every seed user: Password123!
INSERT INTO users (
  school_id,
  first_name,
  last_name,
  email,
  password_hash,
  role,
  invite_code_used,
  is_approved,
  is_active
) VALUES
  (@eis_school_id, 'EIS', 'Admin', 'admin@eis.edu', @test_password_hash, 'admin', 'EIS-ADMIN-001', TRUE, TRUE),
  (@eis_school_id, 'Casey', 'Coordinator', 'coordinator@eis.edu', @test_password_hash, 'coordinator', 'EIS-COORD-001', TRUE, TRUE),
  (@eis_school_id, 'Faith', 'Faculty', 'faculty@eis.edu', @test_password_hash, 'faculty', 'EIS-FACULTY-001', TRUE, TRUE),
  (@eis_school_id, 'Pat', 'Parent', 'parent@eis.edu', @test_password_hash, 'parent', 'EIS-PARENT-001', TRUE, TRUE),
  (@eis_school_id, 'Sam', 'Student', 'student@eis.edu', @test_password_hash, 'student', 'EIS-STUDENT-001', TRUE, TRUE)
ON DUPLICATE KEY UPDATE
  first_name = VALUES(first_name),
  last_name = VALUES(last_name),
  password_hash = VALUES(password_hash),
  role = VALUES(role),
  invite_code_used = VALUES(invite_code_used),
  is_approved = VALUES(is_approved),
  is_active = VALUES(is_active);

SET @admin_user_id = (
  SELECT id FROM users WHERE school_id = @eis_school_id AND email = 'admin@eis.edu'
);

-- Insert sample events in different statuses
INSERT INTO events (
  school_id,
  title,
  event_type,
  description,
  event_date,
  location,
  budget_amount,
  target_audience,
  status,
  rejection_reason,
  created_by,
  is_active
) VALUES
  (@eis_school_id, 'AI Workshop Series', 'Workshop', 'Introductory AI workshop for high school students.', '2026-05-18 09:00:00', 'Computer Laboratory', 15000.00, 'Grade 10-12 Students', 'draft', NULL, @admin_user_id, TRUE),
  (@eis_school_id, 'Basketball Tournament', 'Sports', 'Inter-section basketball tournament.', '2026-05-20 13:00:00', 'School Gymnasium', 25000.00, 'Students and Faculty', 'pending', NULL, @admin_user_id, TRUE),
  (@eis_school_id, 'Heritage Week', 'Cultural', 'Week-long celebration of local culture and school community.', '2026-06-10 08:00:00', 'Main Campus', 45000.00, 'Whole School Community', 'approved', NULL, @admin_user_id, TRUE),
  (@eis_school_id, 'Math Workshop', 'Academic', 'Math enrichment workshop with faculty facilitators.', '2026-05-10 10:00:00', 'Room 204', 8000.00, 'Grade 8-10 Students', 'completed', NULL, @admin_user_id, TRUE),
  (@eis_school_id, 'Career Day Rejected', 'Career', 'Career talks from external speakers.', '2026-05-22 09:00:00', 'Auditorium', 18000.00, 'Grade 11-12 Students', 'rejected', 'Schedule overlaps with another approved school-wide event.', @admin_user_id, TRUE),
  (@eis_school_id, 'Outdoor Family Day', 'Community', 'Outdoor family event and school fair.', '2026-07-04 08:00:00', 'Open Field', 30000.00, 'Parents and Students', 'cancelled', NULL, @admin_user_id, FALSE)
ON DUPLICATE KEY UPDATE
  event_type = VALUES(event_type),
  description = VALUES(description),
  event_date = VALUES(event_date),
  location = VALUES(location),
  budget_amount = VALUES(budget_amount),
  target_audience = VALUES(target_audience),
  status = VALUES(status),
  rejection_reason = VALUES(rejection_reason),
  created_by = VALUES(created_by),
  is_active = VALUES(is_active);

-- Insert sample attendance for completed event
SET @math_event_id = (
  SELECT id FROM events
  WHERE school_id = @eis_school_id AND title = 'Math Workshop'
);

SET @faculty_user_id = (
  SELECT id FROM users WHERE school_id = @eis_school_id AND email = 'faculty@eis.edu'
);

SET @student_user_id = (
  SELECT id FROM users WHERE school_id = @eis_school_id AND email = 'student@eis.edu'
);

INSERT INTO attendance (event_id, user_id, status, checked_in_at)
VALUES
  (@math_event_id, @faculty_user_id, 'present', '2026-05-10 09:55:00'),
  (@math_event_id, @student_user_id, 'late', '2026-05-10 10:12:00')
ON DUPLICATE KEY UPDATE
  status = VALUES(status),
  checked_in_at = VALUES(checked_in_at);
