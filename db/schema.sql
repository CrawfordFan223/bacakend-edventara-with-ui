-- Edventara Database Schema
-- Run this file to set up your database: mysql -u root -p edventara < db/schema.sql

-- Create schools table
CREATE TABLE IF NOT EXISTS schools (
  id INT AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(255) NOT NULL UNIQUE,
  country VARCHAR(100),
  curriculum_type VARCHAR(255),
  custom_curriculum_type VARCHAR(255),
  city VARCHAR(100),
  address VARCHAR(500),
  contact_name VARCHAR(255),
  contact_email VARCHAR(255) NOT NULL,
  estimated_size VARCHAR(255),
  message LONGTEXT,
  status ENUM('pending', 'approved', 'rejected') DEFAULT 'pending',
  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_status (status),
  INDEX idx_email (contact_email)
);

-- Create users table
CREATE TABLE IF NOT EXISTS users (
  id INT AUTO_INCREMENT PRIMARY KEY,
  school_id INT NOT NULL,
  first_name VARCHAR(100) NOT NULL,
  last_name VARCHAR(100) NOT NULL,
  email VARCHAR(255) NOT NULL,
  password_hash VARCHAR(255) NOT NULL,
  role ENUM('admin', 'coordinator', 'faculty', 'parent', 'student') DEFAULT 'student',
  invite_code_used VARCHAR(50),
  is_approved BOOLEAN DEFAULT FALSE,
  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY unique_email_school (email, school_id),
  FOREIGN KEY (school_id) REFERENCES schools(id) ON DELETE CASCADE,
  INDEX idx_school (school_id),
  INDEX idx_email (email),
  INDEX idx_role (role)
);

-- Create invite_codes table
CREATE TABLE IF NOT EXISTS invite_codes (
  id INT AUTO_INCREMENT PRIMARY KEY,
  school_id INT NOT NULL,
  code VARCHAR(50) NOT NULL UNIQUE,
  role_assigned ENUM('admin', 'coordinator', 'faculty', 'parent', 'student') DEFAULT 'student',
  is_active BOOLEAN DEFAULT TRUE,
  times_used INT DEFAULT 0,
  max_uses INT DEFAULT 1,
  expires_at DATETIME,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (school_id) REFERENCES schools(id) ON DELETE CASCADE,
  INDEX idx_code (code),
  INDEX idx_school (school_id),
  INDEX idx_active (is_active)
);

-- Create authorization_codes table
-- Used for initial school admin setup.
CREATE TABLE IF NOT EXISTS authorization_codes (
  id INT AUTO_INCREMENT PRIMARY KEY,
  code VARCHAR(50) NOT NULL UNIQUE,
  school_id INT,
  is_active BOOLEAN DEFAULT TRUE,
  times_used INT DEFAULT 0,
  max_uses INT DEFAULT 1,
  expires_at DATETIME,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (school_id) REFERENCES schools(id) ON DELETE SET NULL,
  INDEX idx_code (code),
  INDEX idx_school (school_id),
  INDEX idx_active (is_active)
);

-- Create events table
CREATE TABLE IF NOT EXISTS events (
  id INT AUTO_INCREMENT PRIMARY KEY,
  school_id INT NOT NULL,
  title VARCHAR(255) NOT NULL,
  event_type VARCHAR(100),
  description LONGTEXT,
  event_date DATETIME NOT NULL,
  location VARCHAR(255),
  budget_amount DECIMAL(12, 2) DEFAULT 0.00,
  target_audience VARCHAR(255),
  status ENUM('draft', 'pending', 'approved', 'rejected', 'completed', 'cancelled') DEFAULT 'draft',
  rejection_reason TEXT,
  created_by INT NOT NULL,
  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (school_id) REFERENCES schools(id) ON DELETE CASCADE,
  FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE CASCADE,
  UNIQUE KEY unique_school_event_title (school_id, title),
  INDEX idx_school (school_id),
  INDEX idx_date (event_date),
  INDEX idx_status (status)
);

-- Create attendance table
CREATE TABLE IF NOT EXISTS attendance (
  id INT AUTO_INCREMENT PRIMARY KEY,
  event_id INT NOT NULL,
  user_id INT NOT NULL,
  status ENUM('present', 'absent', 'late') DEFAULT 'present',
  checked_in_at TIMESTAMP,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (event_id) REFERENCES events(id) ON DELETE CASCADE,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  UNIQUE KEY unique_event_user (event_id, user_id),
  INDEX idx_event (event_id),
  INDEX idx_user (user_id)
);

-- Create password_reset_tokens table
CREATE TABLE IF NOT EXISTS password_reset_tokens (
  id INT AUTO_INCREMENT PRIMARY KEY,
  user_id INT NOT NULL,
  token_hash VARCHAR(255) NOT NULL,
  expires_at DATETIME NOT NULL,
  used_at DATETIME,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  INDEX idx_user (user_id),
  INDEX idx_expires (expires_at)
);
