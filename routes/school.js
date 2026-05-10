const express = require('express');
const router = express.Router();
const pool = require('../db/connection');

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
    const finalCurriculumType = curriculumType === 'Other (please specify)'
      ? customCurriculumType
      : curriculumType;

    const [result] = await pool.query(
      `INSERT INTO school_registration_requests
       (school_name, curriculum_type, country, contact_name, contact_email, estimated_size, message)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [
        schoolName,
        finalCurriculumType,
        country,
        contactName,
        contactEmail,
        estimatedSize || null,
        message || null,
      ]
    );

    res.status(201).json({
      message: 'School registration request submitted',
      request_id: result.insertId,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error during school registration' });
  }
});

module.exports = router;
