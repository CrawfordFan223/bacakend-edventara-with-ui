const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const pool = require('../db/connection');

// POST /api/auth/register
router.post('/register', async (req, res) => {
  const { first_name, last_name, email, password, invite_code } = req.body;

  try {
    if (!first_name || !last_name || !email || !password || !invite_code) {
      return res.status(400).json({ message: 'All required fields must be provided' });
    }

    // 1. Validate invite code
    const [codes] = await pool.query(
      `SELECT * FROM invite_codes 
       WHERE code = ? AND is_active = 1 
       AND (expires_at IS NULL OR expires_at > NOW())
       AND times_used < max_uses`,
      [invite_code]
    );

    if (codes.length === 0) {
      return res.status(400).json({ message: 'Invalid or expired invite code' });
    }

    const code = codes[0];

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
      user_id: result.insertId
    });

  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error during registration' });
  }
});

// POST /api/auth/login
router.post('/login', async (req, res) => {
  const { email, password, school_id } = req.body;

  try {
    if (!email || !password) {
      return res.status(400).json({ message: 'Email and password are required' });
    }

    // 1. Find user
    const [users] = school_id
      ? await pool.query(
          'SELECT * FROM users WHERE email = ? AND school_id = ?',
          [email, school_id]
        )
      : await pool.query(
          'SELECT * FROM users WHERE email = ?',
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
        school_id: user.school_id
      }
    });

  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error during login' });
  }
});

module.exports = router;
