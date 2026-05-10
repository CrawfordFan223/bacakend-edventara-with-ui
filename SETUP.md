# Edventara Backend Setup

## Prerequisites
- Node.js (v16 or higher)
- MySQL Server (v8.0 or higher)
- Git

## Database Setup
1. Install MySQL Server and start it
2. Create a database named `edventara`
3. Import the schema: `mysql -u root -p edventara < db/schema.sql`

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

## Database Tables
- `schools`: School registration requests
- `users`: User accounts
- `invite_codes`: Registration invites
- `events`: School events
- `attendance`: Event attendance