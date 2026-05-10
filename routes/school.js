const express = require('express');
const router = express.Router();
const pool = require('../db/connection');

// POST /api/school/register - School registration request
router.post('/register', async (req, res) => {
  const {
    schoolName,
    curriculumType,
    customCurriculumType,
    country,
    contactName,
    contactEmail,
    estimatedSize,
    message,
  } = req.body;

  if (!schoolName || !curriculumType || !country || !contactName || !contactEmail) {
    return res.status(400).json({ message: 'All required school fields must be provided' });
  }

  try {
    // Check if school already exists
    const [existing] = await pool.query(
      'SELECT id FROM schools WHERE name = ?',
      [schoolName]
    );

    if (existing.length > 0) {
      return res.status(400).json({ message: 'A school with this name already exists' });
    }

    const finalCurriculumType = curriculumType === 'Other (please specify)'
      ? customCurriculumType
      : curriculumType;

    // Insert school registration request
    const [result] = await pool.query(
      `INSERT INTO schools
       (name, curriculum_type, custom_curriculum_type, country, contact_name, contact_email, estimated_size, message, status)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'pending')`,
      [
        schoolName,
        curriculumType === 'Other (please specify)' ? null : curriculumType,
        customCurriculumType || null,
        country,
        contactName,
        contactEmail,
        estimatedSize || null,
        message || null,
      ]
    );

    res.status(201).json({
      message: 'School registration request submitted successfully',
      school_id: result.insertId,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error during school registration' });
  }
});

module.exports = router;
