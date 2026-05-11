# Edventara Git Workflow Notes

## What happened today

This project currently has two Git repositories:

1. Backend/root repo
   - Local folder: `edventara-backend`
   - GitHub repo: `https://github.com/CrawfordFan223/bacakend-edventara-with-ui.git`

2. Frontend nested repo
   - Local folder: `edventara-backend/edventara`
   - GitHub repo: `https://github.com/jabdenina/edventara.git`

The `edventara` frontend folder is not tracked like a normal folder by the backend repo. The backend repo stores a pointer to a specific frontend commit.

Because of that, frontend changes must be committed inside `edventara/` first. Then the backend repo must commit the updated `edventara` pointer.

## Latest commits pushed

Frontend:

```text
e971629 Wire dashboard to backend workflows
```

Backend:

```text
d0c3755 Add backend workflows and AI conflict checks
```

## What was added

Backend:

- Database schema updates
- Seed data
- Auth routes
- Events CRUD routes
- Approval workflow routes
- AI conflict detection route
- Setup/test documentation

Frontend:

- Login stores backend JWT
- Coordinator dashboard route is available
- Create Event page can call AI conflict check
- AI result shows decision, risk score, findings, and events checked

## How a groupmate should pull everything

From the backend/root folder:

```bash
git pull origin main
git submodule update --init --recursive
```

Then install dependencies:

```bash
npm install
cd edventara
npm install
cd ..
```

They need their own `.env` file in the backend/root folder:

```env
DB_HOST=localhost
DB_USER=root
DB_PASSWORD=their_mysql_password
DB_NAME=edventara
JWT_SECRET=any_secret_key
PORT=5000
```

Then set up the database:

```bash
mysql -u root -p edventara < db/schema.sql
mysql -u root -p edventara < db/update-user-roles.sql
mysql -u root -p edventara < db/update-events-schema.sql
mysql -u root -p edventara < db/update-auth-schema.sql
mysql -u root -p edventara < db/seed.sql
```

Run backend:

```bash
node server.js
```

Run frontend in another terminal:

```bash
cd edventara
npm run dev
```

## How to commit backend-only changes

From the backend/root folder:

```bash
git status
git add .
git commit -m "Describe backend change"
git push origin main
```

Do not commit `.env`, `node_modules`, or log files.

## How to commit frontend changes

If files inside `edventara/` changed, commit frontend first:

```bash
cd edventara
git status
git add .
git commit -m "Describe frontend change"
git push origin main
cd ..
```

Then commit the updated frontend pointer in the backend repo:

```bash
git status
git add edventara
git commit -m "Update frontend pointer"
git push origin main
```

## How to commit backend and frontend changes together

1. Commit and push frontend first:

```bash
cd edventara
git add .
git commit -m "Describe frontend change"
git push origin main
cd ..
```

2. Commit and push backend plus frontend pointer:

```bash
git add .
git commit -m "Describe backend and frontend integration"
git push origin main
```

## If Git says the frontend is behind

Inside `edventara/`:

```bash
git pull --rebase origin main
```

If there are conflicts, resolve the files, then:

```bash
git add .
git rebase --continue
git push origin main
```

Then go back to the backend/root folder and commit the updated `edventara` pointer.

## Quick testing accounts

All seed users use this password:

```text
Password123!
```

Seed users:

```text
admin@eis.edu
coordinator@eis.edu
faculty@eis.edu
parent@eis.edu
student@eis.edu
```

## AI conflict test

Login as:

```text
coordinator@eis.edu
Password123!
```

Go to:

```text
http://localhost:5173/coordinator-dashboard
```

Create event test data:

```text
Event Name: Gym Conflict Test
Event Type: Sports
Event Date: 2026-05-20
Start Time: 13:30
End Time: 15:30
Venue: School Gymnasium
Budget: 26000
Target Demographic: Select All Grades
Description: test
```

Click `Check for Conflicts`.

Expected result:

```text
decision: blocked
```
