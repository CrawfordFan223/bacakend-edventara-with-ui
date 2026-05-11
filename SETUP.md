# Edventara Backend Setup

## Prerequisites
- Node.js (v16 or higher)
- MySQL Server (v8.0 or higher)
- Git

## Database Setup
1. Install MySQL Server and start it
2. Create a database named `edventara`
3. Import the schema: `mysql -u root -p edventara < db/schema.sql`
4. If you already imported an older schema, update the role enums:
   `mysql -u root -p edventara < db/update-user-roles.sql`
5. If your database existed before event statuses and authorization codes were added:
   `mysql -u root -p edventara < db/update-events-schema.sql`
6. Insert reusable backend test data:
   `mysql -u root -p edventara < db/seed.sql`

## Environment Variables
Create a `.env` file in the root directory:
```
DB_HOST=localhost
DB_USER=root
DB_PASSWORD=your_mysql_password
DB_NAME=edventara
JWT_SECRET=your_secret_key
PORT=5000
```

## Installation
1. `npm install`
2. `cd edventara && npm install`
3. Start backend: `node server.js`
4. Start frontend: `cd edventara && npm run dev`

## Testing
- Backend health: http://localhost:5000/api/health
- Frontend: http://localhost:5173

## Auth Endpoints
Use `POST` for every auth endpoint below.

### Login
`POST http://localhost:5000/api/auth/login`
```json
{
  "email": "admin@eis.edu",
  "password": "Password123!"
}
```

### Register
`POST http://localhost:5000/api/auth/register`
```json
{
  "first_name": "Thunder",
  "last_name": "Tester",
  "email": "thunder.tester@eis.edu",
  "password": "Password123!",
  "invite_code": "EIS-STUDENT-001"
}
```

### Validate Invite Code
`POST http://localhost:5000/api/auth/validate-code`
```json
{
  "code": "EIS-STUDENT-001"
}
```

### Forgot Password
`POST http://localhost:5000/api/auth/forgot-password`
```json
{
  "email": "admin@eis.edu"
}
```

Email sending is not configured yet. In development, the endpoint stores a reset token and returns it in the response for backend testing.

### Validate Authorization Code
`POST http://localhost:5000/api/auth/validate-auth-code`
```json
{
  "code": "EIS-AUTH-001"
}
```

### Setup School
`POST http://localhost:5000/api/auth/setup-school`
```json
{
  "code": "EIS-AUTH-001",
  "name": "EIS Admin",
  "email": "admin@eis.edu",
  "password": "Password123!",
  "school": "EIS",
  "curriculum": "K-12",
  "country": "Philippines",
  "city": "Manila",
  "address": "123 School Street",
  "contact_email": "admin@eis.edu"
}
```

## Events Endpoints
All event endpoints require a real JWT from `POST /api/auth/login`.

Use this header in Thunder Client:
```text
Authorization: Bearer YOUR_LOGIN_TOKEN
```

### Create Event
`POST http://localhost:5000/api/events`
```json
{
  "title": "Science Fair",
  "event_type": "Academic",
  "description": "Annual science project showcase.",
  "event_date": "2026-08-01 09:00:00",
  "location": "School Gymnasium",
  "budget_amount": 12000,
  "target_audience": "Students and Faculty"
}
```

### List Events
`GET http://localhost:5000/api/events`

Optional filters:
```text
GET http://localhost:5000/api/events?status=approved
GET http://localhost:5000/api/events?active=true
GET http://localhost:5000/api/events?search=workshop
```

### Get Event Detail
`GET http://localhost:5000/api/events/1`

### Edit Event
`PUT http://localhost:5000/api/events/1`
```json
{
  "title": "Science Fair Updated",
  "event_type": "Academic",
  "description": "Updated science project showcase.",
  "event_date": "2026-08-02 10:00:00",
  "location": "Auditorium",
  "budget_amount": 15000,
  "target_audience": "Students, Parents, and Faculty",
  "status": "draft"
}
```

### Delete Draft Event
`DELETE http://localhost:5000/api/events/1`

Only events with `status = "draft"` can be deleted.

### Update Event Status
`PATCH http://localhost:5000/api/events/1/status`
```json
{
  "status": "approved"
}
```

For rejected events:
```json
{
  "status": "rejected",
  "rejection_reason": "Schedule overlaps with another approved event."
}
```

## Approval Workflow Endpoints
All workflow endpoints require this header:
```text
Authorization: Bearer YOUR_LOGIN_TOKEN
```

Coordinator/admin submits an event for approval:
```text
PATCH http://localhost:5000/api/events/1/submit
```

Legacy approval routes are kept, but they now require admin:
```text
PATCH http://localhost:5000/api/events/1/ht-approve
PATCH http://localhost:5000/api/events/1/ht-reject
```

Admin final approval:
```text
PATCH http://localhost:5000/api/events/1/admin-approve
```

Admin rejection with notes:
```text
PATCH http://localhost:5000/api/events/1/admin-reject
```
```json
{
  "notes": "Needs schedule adjustment."
}
```

Admin marks approved event as completed:
```text
PATCH http://localhost:5000/api/events/1/complete
```

Admin cancels an event:
```text
PATCH http://localhost:5000/api/events/1/cancel
```

## AI Conflict Detection
Requires this header:
```text
Authorization: Bearer YOUR_LOGIN_TOKEN
```

`POST http://localhost:5000/api/ai/conflict-check`
```json
{
  "title": "Gym Conflict Test",
  "event_type": "Sports",
  "event_date": "2026-05-20 13:30:00",
  "location": "School Gymnasium",
  "budget_amount": 26000,
  "target_audience": "Students and Faculty",
  "duration_minutes": 120
}
```

The response includes:
- `analysis.decision`: `safe`, `caution`, `review`, or `blocked`
- `analysis.risk_score`: 0 to 100
- `findings`: structured conflict and risk details
- `recommendations`: suggested next actions
- `checked_against`: number of school events reviewed

Suggested Thunder Client test scenarios:
- Same venue and overlapping time: should return `blocked`
- Same target audience and overlapping time: should return `blocked`
- Same venue within less than 60 minutes: should return `review`
- Same audience on same day: should return `review`
- Duplicate title: should return `review`
- Budget far above similar event type: should return `review`
- Weekend or after-hours event: should return `caution` or `review`
- Different date, venue, and audience: should return `safe`

## Database Tables
- `schools`: School registration requests
- `authorization_codes`: Initial admin setup codes
- `users`: User accounts
- `invite_codes`: Registration invites
- `events`: School events with draft, pending, approved, rejected, completed, and cancelled statuses
- `attendance`: Event attendance

## Seed Data
The seed script creates an approved EIS school, setup authorization codes, invite codes for every role, test users, sample events, and attendance records.

Seed login password for every test user:
```text
Password123!
```

Seed users:
- `admin@eis.edu`
- `coordinator@eis.edu`
- `faculty@eis.edu`
- `parent@eis.edu`
- `student@eis.edu`

Seed authorization codes:
- `EIS-AUTH-001`
- `EIS-AUTH-ADMIN`

Seed invite codes:
- `EIS-ADMIN-001`
- `EIS-COORD-001`
- `EIS-FACULTY-001`
- `EIS-PARENT-001`
- `EIS-STUDENT-001`

## Account Role Flow
User accounts are assigned to a school and role through their invite code.

For example, if EIS has `schools.id = 1`, create invite codes like:
```sql
INSERT INTO invite_codes (school_id, code, role_assigned, max_uses)
VALUES
  (1, 'EIS-ADMIN-001', 'admin', 1),
  (1, 'EIS-COORD-001', 'coordinator', 1),
  (1, 'EIS-FACULTY-001', 'faculty', 20),
  (1, 'EIS-PARENT-001', 'parent', 200),
  (1, 'EIS-STUDENT-001', 'student', 500);
```

When someone registers with one of those codes, their `users.school_id` becomes EIS and their `users.role` becomes the invite code role.
