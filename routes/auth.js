const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const crypto = require('crypto');
const jwt = require('jsonwebtoken');
const pool = require('../db/connection');

function normalizeEmail(email) {
  return String(email || '').trim().toLowerCase();
}

function splitName(fullName) {
  const parts = String(fullName || '').trim().split(/\s+/).filter(Boolean);
  return {
    first_name: parts[0] || '',
    last_name: parts.slice(1).join(' ') || 'Admin',
  };
}

function isEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

async function findValidInviteCode(inviteCode) {
  const [codes] = await pool.query(
    `SELECT invite_codes.*, schools.name AS school_name
     FROM invite_codes
     INNER JOIN schools ON schools.id = invite_codes.school_id
     WHERE invite_codes.code = ?
       AND invite_codes.is_active = 1
       AND schools.is_active = 1
       AND (invite_codes.expires_at IS NULL OR invite_codes.expires_at > NOW())
       AND invite_codes.times_used < invite_codes.max_uses`,
    [String(inviteCode || '').trim()]
  );

  return codes[0] || null;
}

async function findValidAuthorizationCode(authCode) {
  const [codes] = await pool.query(
    `SELECT authorization_codes.*, schools.name AS school_name
     FROM authorization_codes
     LEFT JOIN schools ON schools.id = authorization_codes.school_id
     WHERE authorization_codes.code = ?
       AND authorization_codes.is_active = 1
       AND (authorization_codes.expires_at IS NULL OR authorization_codes.expires_at > NOW())
       AND authorization_codes.times_used < authorization_codes.max_uses`,
    [String(authCode || '').trim()]
  );

  return codes[0] || null;
}

// POST /api/auth/register
router.post('/register', async (req, res) => {
  const { invite_code } = req.body;
  const first_name = String(req.body.first_name || '').trim();
  const last_name = String(req.body.last_name || '').trim();
  const email = normalizeEmail(req.body.email);
  const password = String(req.body.password || '');

  try {
    if (!first_name || !last_name || !email || !password || !invite_code) {
      return res.status(400).json({ message: 'All required fields must be provided' });
    }

    if (!isEmail(email)) {
      return res.status(400).json({ message: 'A valid email address is required' });
    }

    // 1. Validate invite code
    const code = await findValidInviteCode(invite_code);

    if (!code) {
      return res.status(400).json({ message: 'Invalid or expired invite code' });
    }

    // 2. Check if email already exists in that school
    const [existing] = await pool.query(
      'SELECT id FROM users WHERE email = ? AND school_id = ?',
      [email, code.school_id]
    );

    if (existing.length > 0) {
      return res.status(400).json({ message: 'Email already registered in this school' });
    }

    // 3. Hash password
    const password_hash = await bcrypt.hash(password, 10);

    // 4. Create user
    const [result] = await pool.query(
      `INSERT INTO users 
       (school_id, first_name, last_name, email, password_hash, role, invite_code_used, is_approved)
       VALUES (?, ?, ?, ?, ?, ?, ?, 0)`,
      [code.school_id, first_name, last_name, email, password_hash, code.role_assigned, invite_code]
    );

    // 5. Increment invite code usage
    await pool.query(
      'UPDATE invite_codes SET times_used = times_used + 1 WHERE id = ?',
      [code.id]
    );

    res.status(201).json({
      message: 'Registration successful! Waiting for admin approval.',
      user_id: result.insertId,
      role: code.role_assigned,
      school_id: code.school_id,
      school_name: code.school_name,
    });

  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error during registration' });
  }
});

// POST /api/auth/validate-code
router.post('/validate-code', async (req, res) => {
  const inviteCode = req.body.invite_code || req.body.code;

  try {
    if (!inviteCode) {
      return res.status(400).json({ valid: false, message: 'Invite code is required' });
    }

    const code = await findValidInviteCode(inviteCode);

    if (!code) {
      return res.status(400).json({ valid: false, message: 'Invalid or expired invite code' });
    }

    res.json({
      valid: true,
      message: 'Invite code is valid',
      invite_code: {
        code: code.code,
        school_id: code.school_id,
        school_name: code.school_name,
        role_assigned: code.role_assigned,
        uses_remaining: code.max_uses - code.times_used,
        expires_at: code.expires_at,
      },
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ valid: false, message: 'Server error during invite code validation' });
  }
});

// POST /api/auth/login
router.post('/login', async (req, res) => {
  const email = normalizeEmail(req.body.email);
  const { password, school_id } = req.body;

  try {
    if (!email || !password) {
      return res.status(400).json({ message: 'Email and password are required' });
    }

    // 1. Find user
    const [users] = school_id
      ? await pool.query(
          `SELECT users.*, schools.name AS school_name
           FROM users
           LEFT JOIN schools ON schools.id = users.school_id
           WHERE users.email = ? AND users.school_id = ?`,
          [email, school_id]
        )
      : await pool.query(
          `SELECT users.*, schools.name AS school_name
           FROM users
           LEFT JOIN schools ON schools.id = users.school_id
           WHERE users.email = ?`,
          [email]
        );

    if (users.length === 0) {
      return res.status(401).json({ message: 'Invalid email or password' });
    }

    const user = users[0];

    // 2. Check if approved
    if (!user.is_approved) {
      return res.status(403).json({ message: 'Your account is pending admin approval' });
    }

    // 3. Check if active
    if (!user.is_active) {
      return res.status(403).json({ message: 'Your account has been deactivated' });
    }

    // 4. Check password
    const validPassword = user.password_hash
      ? await bcrypt.compare(password, user.password_hash)
      : false;
    if (!validPassword) {
      return res.status(401).json({ message: 'Invalid email or password' });
    }

    // 5. Generate JWT
    const token = jwt.sign(
      { id: user.id, role: user.role, school_id: user.school_id },
      process.env.JWT_SECRET,
      { expiresIn: '8h' }
    );

    res.json({
      message: 'Login successful',
      token,
      user: {
        id: user.id,
        first_name: user.first_name,
        last_name: user.last_name,
        email: user.email,
        role: user.role,
        school_id: user.school_id,
        school_name: user.school_name
      }
    });

  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error during login' });
  }
});

// POST /api/auth/forgot-password
router.post('/forgot-password', async (req, res) => {
  const email = normalizeEmail(req.body.email);

  try {
    if (!email) {
      return res.status(400).json({ message: 'Email is required' });
    }

    const genericMessage = 'If that email exists, password reset instructions have been sent.';
    const [users] = await pool.query(
      `SELECT id, email
       FROM users
       WHERE email = ? AND is_active = 1
       ORDER BY id ASC
       LIMIT 1`,
      [email]
    );

    if (users.length === 0) {
      return res.json({ message: genericMessage });
    }

    const user = users[0];
    const resetToken = crypto.randomBytes(32).toString('hex');
    const tokenHash = crypto.createHash('sha256').update(resetToken).digest('hex');

    await pool.query(
      `INSERT INTO password_reset_tokens (user_id, token_hash, expires_at)
       VALUES (?, ?, DATE_ADD(NOW(), INTERVAL 1 HOUR))`,
      [user.id, tokenHash]
    );

    // Email delivery is not configured yet, so keep this visible for backend testing.
    console.log(`Password reset token for ${user.email}: ${resetToken}`);

    const response = { message: genericMessage };
    if (process.env.NODE_ENV !== 'production') {
      response.reset_token = resetToken;
    }

    res.json(response);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error during password reset request' });
  }
});

// POST /api/auth/validate-auth-code
router.post('/validate-auth-code', async (req, res) => {
  const authCode = req.body.authorization_code || req.body.auth_code || req.body.code;

  try {
    if (!authCode) {
      return res.status(400).json({ valid: false, message: 'Authorization code is required' });
    }

    const code = await findValidAuthorizationCode(authCode);

    if (!code) {
      return res.status(400).json({ valid: false, message: 'Invalid or expired authorization code' });
    }

    res.json({
      valid: true,
      message: 'Authorization code is valid',
      authorization_code: {
        code: code.code,
        school_id: code.school_id,
        school_name: code.school_name,
        uses_remaining: code.max_uses - code.times_used,
        expires_at: code.expires_at,
      },
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ valid: false, message: 'Server error during authorization code validation' });
  }
});

// POST /api/auth/setup-school
router.post('/setup-school', async (req, res) => {
  const authCodeValue = req.body.authorization_code || req.body.auth_code || req.body.code;
  const adminName = req.body.admin_name || req.body.full_name || req.body.name;
  const adminEmail = normalizeEmail(req.body.admin_email || req.body.email);
  const password = String(req.body.password || '');
  const schoolName = String(req.body.school_name || req.body.school || '').trim();
  const curriculumType = String(req.body.curriculum_type || req.body.curriculum || '').trim();
  const customCurriculumType = String(req.body.custom_curriculum_type || req.body.customCurriculum || '').trim();
  const country = String(req.body.country || '').trim();
  const city = String(req.body.city || '').trim();
  const address = String(req.body.address || '').trim();
  const contactEmail = normalizeEmail(req.body.contact_email || req.body.school_email || req.body.schoolContactEmail || adminEmail);

  let connection;

  try {
    if (!authCodeValue || !adminName || !adminEmail || !password || !schoolName || !curriculumType || !country || !contactEmail) {
      return res.status(400).json({ message: 'Authorization code, admin details, and school details are required' });
    }

    if (!isEmail(adminEmail) || !isEmail(contactEmail)) {
      return res.status(400).json({ message: 'Valid admin and school contact emails are required' });
    }

    const authCode = await findValidAuthorizationCode(authCodeValue);

    if (!authCode) {
      return res.status(400).json({ message: 'Invalid or expired authorization code' });
    }

    const { first_name, last_name } = splitName(adminName);
    const passwordHash = await bcrypt.hash(password, 10);

    connection = await pool.getConnection();
    await connection.beginTransaction();

    let schoolId = authCode.school_id;

    if (schoolId) {
      await connection.query(
        `UPDATE schools
         SET name = ?, country = ?, curriculum_type = ?, custom_curriculum_type = ?,
             city = ?, address = ?, contact_name = ?, contact_email = ?,
             status = 'approved', is_active = 1
         WHERE id = ?`,
        [
          schoolName,
          country,
          curriculumType === 'Others (please specify)' || curriculumType === 'Other (please specify)' ? null : curriculumType,
          customCurriculumType || null,
          city || null,
          address || null,
          adminName,
          contactEmail,
          schoolId,
        ]
      );
    } else {
      const [existingSchools] = await connection.query(
        'SELECT id FROM schools WHERE name = ?',
        [schoolName]
      );

      if (existingSchools.length > 0) {
        schoolId = existingSchools[0].id;
        await connection.query(
          `UPDATE schools
           SET country = ?, curriculum_type = ?, custom_curriculum_type = ?,
               city = ?, address = ?, contact_name = ?, contact_email = ?,
               status = 'approved', is_active = 1
           WHERE id = ?`,
          [
            country,
            curriculumType === 'Others (please specify)' || curriculumType === 'Other (please specify)' ? null : curriculumType,
            customCurriculumType || null,
            city || null,
            address || null,
            adminName,
            contactEmail,
            schoolId,
          ]
        );
      } else {
        const [schoolResult] = await connection.query(
          `INSERT INTO schools
           (name, country, curriculum_type, custom_curriculum_type, city, address, contact_name, contact_email, status, is_active)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'approved', 1)`,
          [
            schoolName,
            country,
            curriculumType === 'Others (please specify)' || curriculumType === 'Other (please specify)' ? null : curriculumType,
            customCurriculumType || null,
            city || null,
            address || null,
            adminName,
            contactEmail,
          ]
        );
        schoolId = schoolResult.insertId;
      }

      await connection.query(
        'UPDATE authorization_codes SET school_id = ? WHERE id = ?',
        [schoolId, authCode.id]
      );
    }

    const [existingUsers] = await connection.query(
      'SELECT id FROM users WHERE email = ? AND school_id = ?',
      [adminEmail, schoolId]
    );

    let userId;
    if (existingUsers.length > 0) {
      userId = existingUsers[0].id;
      await connection.query(
        `UPDATE users
         SET first_name = ?, last_name = ?, password_hash = ?, role = 'admin',
             is_approved = 1, is_active = 1
         WHERE id = ?`,
        [first_name, last_name, passwordHash, userId]
      );
    } else {
      const [userResult] = await connection.query(
        `INSERT INTO users
         (school_id, first_name, last_name, email, password_hash, role, invite_code_used, is_approved, is_active)
         VALUES (?, ?, ?, ?, ?, 'admin', ?, 1, 1)`,
        [schoolId, first_name, last_name, adminEmail, passwordHash, String(authCodeValue).trim()]
      );
      userId = userResult.insertId;
    }

    await connection.query(
      `UPDATE authorization_codes
       SET times_used = times_used + 1
       WHERE id = ?`,
      [authCode.id]
    );

    await connection.commit();

    const token = jwt.sign(
      { id: userId, role: 'admin', school_id: schoolId },
      process.env.JWT_SECRET,
      { expiresIn: '8h' }
    );

    res.status(201).json({
      message: 'School setup completed successfully',
      token,
      user: {
        id: userId,
        first_name,
        last_name,
        email: adminEmail,
        role: 'admin',
        school_id: schoolId,
        school_name: schoolName,
      },
    });
  } catch (err) {
    if (connection) await connection.rollback();
    console.error(err);
    res.status(500).json({ message: 'Server error during school setup' });
  } finally {
    if (connection) connection.release();
  }
});

module.exports = router;
