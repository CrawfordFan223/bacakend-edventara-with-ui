const express = require('express');
const router = express.Router();
const pool = require('../db/connection');
const verifyToken = require('../middleware/auth');

const ACTIVE_EVENT_STATUSES = ['draft', 'pending', 'approved'];
const DEFAULT_DURATION_MINUTES = 120;
const SCHOOL_WIDE_TERMS = ['all', 'whole school', 'school community', 'students and faculty', 'parents and students'];

router.use(verifyToken);

function parseEventInput(body) {
  const start = body.event_date || body.date || body.start_at || body.start;
  const duration = Number(body.duration_minutes || body.duration || DEFAULT_DURATION_MINUTES);
  const end = body.end_date || body.end_at || body.end;

  return {
    id: body.id ? Number(body.id) : null,
    title: String(body.title || '').trim(),
    event_type: String(body.event_type || body.type || '').trim() || null,
    description: String(body.description || '').trim() || null,
    event_date: start,
    end_date: end || null,
    duration_minutes: Number.isFinite(duration) && duration > 0 ? duration : DEFAULT_DURATION_MINUTES,
    location: String(body.location || body.venue || '').trim() || null,
    budget_amount: Number(body.budget_amount ?? body.budget ?? 0),
    target_audience: String(body.target_audience || body.demographics || body.participants || '').trim() || null,
    expected_attendees: body.expected_attendees ? Number(body.expected_attendees) : null,
  };
}

function validateInput(event) {
  const errors = [];
  const startDate = event.event_date ? new Date(event.event_date) : null;
  const endDate = event.end_date ? new Date(event.end_date) : null;

  if (!event.title) errors.push('title is required');
  if (!event.event_date) {
    errors.push('event_date is required');
  } else if (!startDate || Number.isNaN(startDate.getTime())) {
    errors.push('event_date must be a valid date');
  } else if (startDate.getFullYear() < 2020 || startDate.getFullYear() > 2100) {
    errors.push('event_date year must be between 2020 and 2100');
  }

  if (event.end_date && (!endDate || Number.isNaN(endDate.getTime()))) {
    errors.push('end_date must be a valid date');
  } else if (endDate && (endDate.getFullYear() < 2020 || endDate.getFullYear() > 2100)) {
    errors.push('end_date year must be between 2020 and 2100');
  }

  if (startDate && endDate && !Number.isNaN(startDate.getTime()) && !Number.isNaN(endDate.getTime()) && endDate <= startDate) {
    errors.push('end_date must be after event_date');
  }

  if (Number.isNaN(event.budget_amount) || event.budget_amount < 0) {
    errors.push('budget_amount must be a non-negative number');
  }

  if (event.expected_attendees !== null && (Number.isNaN(event.expected_attendees) || event.expected_attendees < 0)) {
    errors.push('expected_attendees must be a non-negative number');
  }

  return errors;
}

function getWindow(event) {
  const start = new Date(event.event_date);
  const end = event.end_date
    ? new Date(event.end_date)
    : new Date(start.getTime() + event.duration_minutes * 60 * 1000);

  return { start, end };
}

function addMinutes(date, minutes) {
  return new Date(date.getTime() + minutes * 60 * 1000);
}

function sameDay(left, right) {
  return left.getFullYear() === right.getFullYear()
    && left.getMonth() === right.getMonth()
    && left.getDate() === right.getDate();
}

function overlaps(leftStart, leftEnd, rightStart, rightEnd) {
  return leftStart < rightEnd && rightStart < leftEnd;
}

function minutesBetween(left, right) {
  return Math.abs(left.getTime() - right.getTime()) / 60000;
}

function normalizeText(value) {
  return String(value || '').trim().toLowerCase();
}

function hasSharedAudience(left, right) {
  const a = normalizeText(left);
  const b = normalizeText(right);

  if (!a || !b) return false;
  if (SCHOOL_WIDE_TERMS.some((term) => a.includes(term) || b.includes(term))) return true;

  const leftTokens = new Set(a.split(/[^a-z0-9]+/).filter((token) => token.length >= 4));
  const rightTokens = b.split(/[^a-z0-9]+/).filter((token) => token.length >= 4);

  return rightTokens.some((token) => leftTokens.has(token));
}

function severityRank(severity) {
  return { high: 3, medium: 2, low: 1 }[severity] || 0;
}

function makeFinding(type, severity, title, message, event = null, recommendation = null) {
  return {
    type,
    severity,
    title,
    message,
    conflicting_event: event
      ? {
          id: event.id,
          title: event.title,
          event_date: event.event_date,
          location: event.location,
          status: event.status,
        }
      : null,
    recommendation,
  };
}

function formatMoney(amount) {
  return Number(amount || 0).toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

async function getComparableEvents(event, schoolId) {
  const params = [schoolId];
  let excludeClause = '';

  if (event.id) {
    excludeClause = 'AND id <> ?';
    params.push(event.id);
  }

  const [rows] = await pool.query(
    `SELECT id, title, event_type, description, event_date, location, budget_amount,
            target_audience, status, is_active
     FROM events
     WHERE school_id = ?
       ${excludeClause}
       AND is_active = 1
       AND status IN ('draft', 'pending', 'approved')
     ORDER BY event_date ASC`,
    params
  );

  return rows;
}

function analyzeConflicts(proposed, existingEvents) {
  const findings = [];
  const proposedWindow = getWindow(proposed);
  const proposedLocation = normalizeText(proposed.location);
  const proposedTitle = normalizeText(proposed.title);

  for (const existing of existingEvents) {
    const existingWindow = {
      start: new Date(existing.event_date),
      end: addMinutes(new Date(existing.event_date), DEFAULT_DURATION_MINUTES),
    };

    const existingLocation = normalizeText(existing.location);
    const existingTitle = normalizeText(existing.title);
    const isSameDay = sameDay(proposedWindow.start, existingWindow.start);
    const isOverlap = overlaps(proposedWindow.start, proposedWindow.end, existingWindow.start, existingWindow.end);
    const sameVenue = proposedLocation && existingLocation && proposedLocation === existingLocation;
    const sharedAudience = hasSharedAudience(proposed.target_audience, existing.target_audience);

    if (proposedTitle && existingTitle && proposedTitle === existingTitle) {
      findings.push(makeFinding(
        'duplicate_title',
        'medium',
        'Duplicate event title',
        `An event with the same title already exists: "${existing.title}".`,
        existing,
        'Rename the event or confirm that this is not a duplicate proposal.'
      ));
    }

    if (isOverlap && sameVenue) {
      findings.push(makeFinding(
        'venue_time_overlap',
        'high',
        'Venue is already booked',
        `The proposed event overlaps with "${existing.title}" at ${existing.location}.`,
        existing,
        'Choose a different venue or move the proposed event to a non-overlapping time.'
      ));
      continue;
    }

    if (isOverlap && sharedAudience) {
      findings.push(makeFinding(
        'audience_time_overlap',
        'high',
        'Audience schedule conflict',
        `The proposed event overlaps with "${existing.title}" and appears to target a similar audience.`,
        existing,
        'Move one event to a different time block to avoid splitting attendance.'
      ));
    }

    if (isSameDay && sameVenue && !isOverlap && minutesBetween(proposedWindow.start, existingWindow.end) < 60) {
      findings.push(makeFinding(
        'venue_turnover_risk',
        'medium',
        'Venue turnover window is tight',
        `"${existing.title}" uses the same venue within one hour of the proposed event.`,
        existing,
        'Add at least 60 minutes for ingress, cleanup, and setup.'
      ));
    }

    if (isSameDay && sharedAudience && !isOverlap) {
      findings.push(makeFinding(
        'same_day_audience_load',
        'medium',
        'Same-day audience load',
        `"${existing.title}" is on the same day and may involve the same audience.`,
        existing,
        'Confirm participants can reasonably attend both events, or separate them by date.'
      ));
    }
  }

  return findings;
}

function analyzeBudget(proposed, existingEvents) {
  const findings = [];

  if (!proposed.event_type || proposed.budget_amount <= 0) {
    return findings;
  }

  const comparable = existingEvents
    .filter((event) => normalizeText(event.event_type) === normalizeText(proposed.event_type))
    .map((event) => Number(event.budget_amount || 0))
    .filter((amount) => amount > 0);

  if (comparable.length < 2) {
    if (proposed.budget_amount >= 50000) {
      findings.push(makeFinding(
        'budget_review',
        'medium',
        'Large budget requires review',
        `The proposed budget is ${formatMoney(proposed.budget_amount)}, but there is limited history for this event type.`,
        null,
        'Ask for an itemized budget and admin review before approval.'
      ));
    }
    return findings;
  }

  const average = comparable.reduce((sum, amount) => sum + amount, 0) / comparable.length;

  if (proposed.budget_amount > average * 1.5) {
    findings.push(makeFinding(
      'budget_anomaly_high',
      'medium',
      'Budget is above comparable events',
      `The proposed budget is ${formatMoney(proposed.budget_amount)}, above the ${formatMoney(average)} average for ${proposed.event_type} events.`,
      null,
      'Request an itemized budget or reduce the amount before approval.'
    ));
  }

  if (proposed.budget_amount < average * 0.35) {
    findings.push(makeFinding(
      'budget_anomaly_low',
      'low',
      'Budget may be underestimated',
      `The proposed budget is ${formatMoney(proposed.budget_amount)}, far below the ${formatMoney(average)} average for ${proposed.event_type} events.`,
      null,
      'Confirm that venue, materials, staffing, and contingency costs are included.'
    ));
  }

  return findings;
}

function analyzeTiming(proposed) {
  const findings = [];
  const { start, end } = getWindow(proposed);
  const hour = start.getHours();
  const day = start.getDay();
  const durationHours = (end.getTime() - start.getTime()) / 3600000;

  if (day === 0 || day === 6) {
    findings.push(makeFinding(
      'weekend_schedule',
      'low',
      'Weekend event',
      'The proposed event is scheduled on a weekend.',
      null,
      'Confirm campus access, supervision, and participant availability.'
    ));
  }

  if (hour < 7 || hour >= 18) {
    findings.push(makeFinding(
      'outside_school_hours',
      'medium',
      'Outside normal school hours',
      'The proposed start time falls outside normal school hours.',
      null,
      'Confirm security, facilities, transportation, and staff availability.'
    ));
  }

  if (durationHours > 6) {
    findings.push(makeFinding(
      'long_duration',
      'low',
      'Long event duration',
      `The proposed event duration is about ${durationHours.toFixed(1)} hours.`,
      null,
      'Consider breaks, meals, supervision shifts, and cleanup time.'
    ));
  }

  return findings;
}

function buildSummary(findings) {
  const high = findings.filter((item) => item.severity === 'high').length;
  const medium = findings.filter((item) => item.severity === 'medium').length;
  const low = findings.filter((item) => item.severity === 'low').length;
  const score = Math.max(0, 100 - high * 35 - medium * 15 - low * 5);
  const has_conflict = high > 0 || medium > 0;

  let decision = 'safe';
  let summary = 'No major conflicts detected. The event can proceed to normal review.';

  if (high > 0) {
    decision = 'blocked';
    summary = 'High-risk conflicts were detected. Resolve these before submitting for approval.';
  } else if (medium > 0) {
    decision = 'review';
    summary = 'Potential conflicts were detected. Admin review is recommended before approval.';
  } else if (low > 0) {
    decision = 'caution';
    summary = 'Minor planning risks were detected. The event is likely workable with confirmations.';
  }

  return {
    has_conflict,
    decision,
    risk_score: score,
    counts: { high, medium, low, total: findings.length },
    summary,
  };
}

// POST /api/ai/conflict-check
router.post('/conflict-check', async (req, res) => {
  try {
    const proposed = parseEventInput(req.body);
    const errors = validateInput(proposed);

    if (errors.length > 0) {
      return res.status(400).json({ message: 'Invalid event data', errors });
    }

    const existingEvents = await getComparableEvents(proposed, req.user.school_id);
    const findings = [
      ...analyzeConflicts(proposed, existingEvents),
      ...analyzeBudget(proposed, existingEvents),
      ...analyzeTiming(proposed),
    ].sort((left, right) => severityRank(right.severity) - severityRank(left.severity));

    const analysis = buildSummary(findings);
    const recommendations = findings
      .map((finding) => finding.recommendation)
      .filter(Boolean);

    if (recommendations.length === 0) {
      recommendations.push('Proceed with the normal event approval workflow.');
    }

    res.json({
      message: 'AI conflict check completed',
      proposed_event: proposed,
      analysis,
      findings,
      recommendations,
      checked_against: existingEvents.length,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error during conflict check' });
  }
});

module.exports = router;
