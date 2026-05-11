const express = require('express');
const router = express.Router();
const pool = require('../db/connection');
const verifyToken = require('../middleware/auth');

const EVENT_STATUSES = ['draft', 'pending', 'approved', 'rejected', 'completed', 'cancelled'];
const MANAGER_ROLES = ['admin', 'coordinator'];

router.use(verifyToken);

function canManageEvents(user) {
  return MANAGER_ROLES.includes(user.role);
}

function isAdmin(user) {
  return user.role === 'admin';
}

function normalizeEventPayload(body) {
  return {
    title: String(body.title || '').trim(),
    event_type: String(body.event_type || body.type || '').trim() || null,
    description: String(body.description || '').trim() || null,
    event_date: body.event_date || body.date || null,
    location: String(body.location || body.venue || '').trim() || null,
    budget_amount: body.budget_amount ?? body.budget ?? 0,
    target_audience: String(body.target_audience || body.demographics || body.participants || '').trim() || null,
    status: body.status || 'draft',
    rejection_reason: String(body.rejection_reason || '').trim() || null,
  };
}

function validateEventPayload(payload, partial = false) {
  const errors = [];

  if (!partial || payload.title !== '') {
    if (!payload.title) errors.push('title is required');
  }

  if (!partial || payload.event_date) {
    if (!payload.event_date) {
      errors.push('event_date is required');
    } else if (Number.isNaN(Date.parse(payload.event_date))) {
      errors.push('event_date must be a valid date');
    }
  }

  if (payload.status && !EVENT_STATUSES.includes(payload.status)) {
    errors.push(`status must be one of: ${EVENT_STATUSES.join(', ')}`);
  }

  const budget = Number(payload.budget_amount);
  if (Number.isNaN(budget) || budget < 0) {
    errors.push('budget_amount must be a non-negative number');
  }

  return errors;
}

function formatEvent(row) {
  if (!row) return null;

  return {
    id: row.id,
    school_id: row.school_id,
    title: row.title,
    event_type: row.event_type,
    description: row.description,
    event_date: row.event_date,
    location: row.location,
    budget_amount: row.budget_amount,
    target_audience: row.target_audience,
    status: row.status,
    rejection_reason: row.rejection_reason,
    created_by: row.created_by,
    created_by_name: row.created_by_name,
    is_active: Boolean(row.is_active),
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

async function getScopedEvent(eventId, schoolId) {
  const [rows] = await pool.query(
    `SELECT events.*, CONCAT(users.first_name, ' ', users.last_name) AS created_by_name
     FROM events
     LEFT JOIN users ON users.id = events.created_by
     WHERE events.id = ? AND events.school_id = ?`,
    [eventId, schoolId]
  );

  return rows[0] || null;
}

async function updateEventWorkflow(eventId, schoolId, status, rejectionReason = null) {
  await pool.query(
    `UPDATE events
     SET status = ?, rejection_reason = ?
     WHERE id = ? AND school_id = ?`,
    [status, status === 'rejected' ? rejectionReason : null, eventId, schoolId]
  );

  return getScopedEvent(eventId, schoolId);
}

// POST /api/events - create event
router.post('/', async (req, res) => {
  try {
    if (!canManageEvents(req.user)) {
      return res.status(403).json({ message: 'Only admins and coordinators can create events' });
    }

    const payload = normalizeEventPayload(req.body);
    const errors = validateEventPayload(payload);

    if (errors.length > 0) {
      return res.status(400).json({ message: 'Invalid event data', errors });
    }

    const [result] = await pool.query(
      `INSERT INTO events
       (school_id, title, event_type, description, event_date, location, budget_amount,
        target_audience, status, rejection_reason, created_by, is_active)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1)`,
      [
        req.user.school_id,
        payload.title,
        payload.event_type,
        payload.description,
        payload.event_date,
        payload.location,
        Number(payload.budget_amount),
        payload.target_audience,
        payload.status,
        payload.rejection_reason,
        req.user.id,
      ]
    );

    const event = await getScopedEvent(result.insertId, req.user.school_id);

    res.status(201).json({
      message: 'Event created successfully',
      event: formatEvent(event),
    });
  } catch (err) {
    if (err.code === 'ER_DUP_ENTRY') {
      return res.status(400).json({ message: 'An event with this title already exists for this school' });
    }

    console.error(err);
    res.status(500).json({ message: 'Server error while creating event' });
  }
});

// GET /api/events - list school-scoped events
router.get('/', async (req, res) => {
  try {
    const { status, active, search } = req.query;
    const conditions = ['events.school_id = ?'];
    const params = [req.user.school_id];

    if (status) {
      if (!EVENT_STATUSES.includes(status)) {
        return res.status(400).json({ message: `status must be one of: ${EVENT_STATUSES.join(', ')}` });
      }
      conditions.push('events.status = ?');
      params.push(status);
    }

    if (active !== undefined) {
      conditions.push('events.is_active = ?');
      params.push(active === 'false' || active === '0' ? 0 : 1);
    }

    if (search) {
      conditions.push('(events.title LIKE ? OR events.description LIKE ? OR events.location LIKE ?)');
      const like = `%${search}%`;
      params.push(like, like, like);
    }

    const [rows] = await pool.query(
      `SELECT events.*, CONCAT(users.first_name, ' ', users.last_name) AS created_by_name
       FROM events
       LEFT JOIN users ON users.id = events.created_by
       WHERE ${conditions.join(' AND ')}
       ORDER BY events.event_date ASC, events.id ASC`,
      params
    );

    res.json({
      events: rows.map(formatEvent),
      count: rows.length,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error while listing events' });
  }
});

// GET /api/events/:id - single event detail
router.get('/:id', async (req, res) => {
  try {
    const event = await getScopedEvent(req.params.id, req.user.school_id);

    if (!event) {
      return res.status(404).json({ message: 'Event not found' });
    }

    res.json({ event: formatEvent(event) });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error while fetching event' });
  }
});

// PUT /api/events/:id - edit event
router.put('/:id', async (req, res) => {
  try {
    if (!canManageEvents(req.user)) {
      return res.status(403).json({ message: 'Only admins and coordinators can edit events' });
    }

    const existing = await getScopedEvent(req.params.id, req.user.school_id);

    if (!existing) {
      return res.status(404).json({ message: 'Event not found' });
    }

    const payload = normalizeEventPayload({
      ...existing,
      ...req.body,
    });
    const errors = validateEventPayload(payload);

    if (errors.length > 0) {
      return res.status(400).json({ message: 'Invalid event data', errors });
    }

    await pool.query(
      `UPDATE events
       SET title = ?, event_type = ?, description = ?, event_date = ?, location = ?,
           budget_amount = ?, target_audience = ?, status = ?, rejection_reason = ?
       WHERE id = ? AND school_id = ?`,
      [
        payload.title,
        payload.event_type,
        payload.description,
        payload.event_date,
        payload.location,
        Number(payload.budget_amount),
        payload.target_audience,
        payload.status,
        payload.rejection_reason,
        req.params.id,
        req.user.school_id,
      ]
    );

    const event = await getScopedEvent(req.params.id, req.user.school_id);

    res.json({
      message: 'Event updated successfully',
      event: formatEvent(event),
    });
  } catch (err) {
    if (err.code === 'ER_DUP_ENTRY') {
      return res.status(400).json({ message: 'An event with this title already exists for this school' });
    }

    console.error(err);
    res.status(500).json({ message: 'Server error while updating event' });
  }
});

// DELETE /api/events/:id - delete draft event
router.delete('/:id', async (req, res) => {
  try {
    if (!canManageEvents(req.user)) {
      return res.status(403).json({ message: 'Only admins and coordinators can delete events' });
    }

    const event = await getScopedEvent(req.params.id, req.user.school_id);

    if (!event) {
      return res.status(404).json({ message: 'Event not found' });
    }

    if (event.status !== 'draft') {
      return res.status(400).json({ message: 'Only draft events can be deleted' });
    }

    await pool.query(
      'DELETE FROM events WHERE id = ? AND school_id = ? AND status = ?',
      [req.params.id, req.user.school_id, 'draft']
    );

    res.json({ message: 'Draft event deleted successfully' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error while deleting event' });
  }
});

// PATCH /api/events/:id/status - update status
router.patch('/:id/status', async (req, res) => {
  try {
    if (!canManageEvents(req.user)) {
      return res.status(403).json({ message: 'Only admins and coordinators can update event status' });
    }

    const status = String(req.body.status || '').trim();
    const rejectionReason = String(req.body.rejection_reason || '').trim() || null;

    if (!EVENT_STATUSES.includes(status)) {
      return res.status(400).json({ message: `status must be one of: ${EVENT_STATUSES.join(', ')}` });
    }

    const event = await getScopedEvent(req.params.id, req.user.school_id);

    if (!event) {
      return res.status(404).json({ message: 'Event not found' });
    }

    await pool.query(
      `UPDATE events
       SET status = ?, rejection_reason = ?
       WHERE id = ? AND school_id = ?`,
      [
        status,
        status === 'rejected' ? rejectionReason : null,
        req.params.id,
        req.user.school_id,
      ]
    );

    const updated = await getScopedEvent(req.params.id, req.user.school_id);

    res.json({
      message: 'Event status updated successfully',
      event: formatEvent(updated),
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error while updating event status' });
  }
});

// PATCH /api/events/:id/submit - coordinator/admin submits draft for approval
router.patch('/:id/submit', async (req, res) => {
  try {
    if (!canManageEvents(req.user)) {
      return res.status(403).json({ message: 'Only admins and coordinators can submit events' });
    }

    const event = await getScopedEvent(req.params.id, req.user.school_id);

    if (!event) {
      return res.status(404).json({ message: 'Event not found' });
    }

    if (!['draft', 'rejected'].includes(event.status)) {
      return res.status(400).json({ message: 'Only draft or rejected events can be submitted for approval' });
    }

    const updated = await updateEventWorkflow(req.params.id, req.user.school_id, 'pending');

    res.json({
      message: 'Event submitted for approval',
      event: formatEvent(updated),
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error while submitting event' });
  }
});

// PATCH /api/events/:id/ht-approve - legacy route, admin approval
router.patch('/:id/ht-approve', async (req, res) => {
  try {
    if (!isAdmin(req.user)) {
      return res.status(403).json({ message: 'Only admins can approve events' });
    }

    const event = await getScopedEvent(req.params.id, req.user.school_id);

    if (!event) {
      return res.status(404).json({ message: 'Event not found' });
    }

    if (event.status !== 'pending') {
      return res.status(400).json({ message: 'Only pending events can be approved' });
    }

    const updated = await updateEventWorkflow(req.params.id, req.user.school_id, 'approved');

    res.json({
      message: 'Event approved successfully',
      event: formatEvent(updated),
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error while approving event' });
  }
});

// PATCH /api/events/:id/ht-reject - legacy route, admin rejection
router.patch('/:id/ht-reject', async (req, res) => {
  try {
    if (!isAdmin(req.user)) {
      return res.status(403).json({ message: 'Only admins can reject events' });
    }

    const event = await getScopedEvent(req.params.id, req.user.school_id);

    if (!event) {
      return res.status(404).json({ message: 'Event not found' });
    }

    if (event.status !== 'pending') {
      return res.status(400).json({ message: 'Only pending events can be rejected' });
    }

    const rejectionReason = String(req.body.rejection_reason || req.body.notes || '').trim() || null;
    const updated = await updateEventWorkflow(req.params.id, req.user.school_id, 'rejected', rejectionReason);

    res.json({
      message: 'Event rejected successfully',
      event: formatEvent(updated),
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error while rejecting event' });
  }
});

// PATCH /api/events/:id/admin-approve - admin final approval
router.patch('/:id/admin-approve', async (req, res) => {
  try {
    if (!isAdmin(req.user)) {
      return res.status(403).json({ message: 'Only admins can approve events' });
    }

    const event = await getScopedEvent(req.params.id, req.user.school_id);

    if (!event) {
      return res.status(404).json({ message: 'Event not found' });
    }

    if (!['pending', 'draft'].includes(event.status)) {
      return res.status(400).json({ message: 'Only draft or pending events can be approved' });
    }

    const updated = await updateEventWorkflow(req.params.id, req.user.school_id, 'approved');

    res.json({
      message: 'Event approved successfully',
      event: formatEvent(updated),
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error while approving event' });
  }
});

// PATCH /api/events/:id/admin-reject - admin rejects with notes
router.patch('/:id/admin-reject', async (req, res) => {
  try {
    if (!isAdmin(req.user)) {
      return res.status(403).json({ message: 'Only admins can reject events' });
    }

    const event = await getScopedEvent(req.params.id, req.user.school_id);

    if (!event) {
      return res.status(404).json({ message: 'Event not found' });
    }

    if (!['pending', 'draft'].includes(event.status)) {
      return res.status(400).json({ message: 'Only draft or pending events can be rejected' });
    }

    const rejectionReason = String(req.body.rejection_reason || req.body.notes || '').trim() || null;
    const updated = await updateEventWorkflow(req.params.id, req.user.school_id, 'rejected', rejectionReason);

    res.json({
      message: 'Event rejected successfully',
      event: formatEvent(updated),
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error while rejecting event' });
  }
});

// PATCH /api/events/:id/complete - mark approved event as completed
router.patch('/:id/complete', async (req, res) => {
  try {
    if (!isAdmin(req.user)) {
      return res.status(403).json({ message: 'Only admins can complete events' });
    }

    const event = await getScopedEvent(req.params.id, req.user.school_id);

    if (!event) {
      return res.status(404).json({ message: 'Event not found' });
    }

    if (event.status !== 'approved') {
      return res.status(400).json({ message: 'Only approved events can be marked as completed' });
    }

    const updated = await updateEventWorkflow(req.params.id, req.user.school_id, 'completed');

    res.json({
      message: 'Event marked as completed',
      event: formatEvent(updated),
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error while completing event' });
  }
});

// PATCH /api/events/:id/cancel - cancel event
router.patch('/:id/cancel', async (req, res) => {
  try {
    if (!isAdmin(req.user)) {
      return res.status(403).json({ message: 'Only admins can cancel events' });
    }

    const event = await getScopedEvent(req.params.id, req.user.school_id);

    if (!event) {
      return res.status(404).json({ message: 'Event not found' });
    }

    if (['completed', 'cancelled'].includes(event.status)) {
      return res.status(400).json({ message: 'Completed or cancelled events cannot be cancelled' });
    }

    const updated = await updateEventWorkflow(req.params.id, req.user.school_id, 'cancelled');

    res.json({
      message: 'Event cancelled successfully',
      event: formatEvent(updated),
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error while cancelling event' });
  }
});

module.exports = router;
