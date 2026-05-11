-- Run this on an existing database that was created before the user roles were finalized.
-- mysql -u root -p edventara < db/update-user-roles.sql

ALTER TABLE users
  MODIFY role ENUM('admin', 'coordinator', 'staff', 'faculty', 'parent', 'student') DEFAULT 'student';

ALTER TABLE invite_codes
  MODIFY role_assigned ENUM('admin', 'coordinator', 'staff', 'faculty', 'parent', 'student') DEFAULT 'student';

UPDATE users SET role = 'faculty' WHERE role = 'staff';
UPDATE invite_codes SET role_assigned = 'faculty' WHERE role_assigned = 'staff';

ALTER TABLE users
  MODIFY role ENUM('admin', 'coordinator', 'faculty', 'parent', 'student') DEFAULT 'student';

ALTER TABLE invite_codes
  MODIFY role_assigned ENUM('admin', 'coordinator', 'faculty', 'parent', 'student') DEFAULT 'student';
