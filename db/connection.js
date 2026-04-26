const mysql = require('mysql2/promise');

const pool = mysql.createPool({
  host: process.env.DB_HOST || 'localhost',
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASSWORD || '',
  database: process.env.DB_NAME || 'edventara',
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0
});

pool.on('error', (err) => {
  console.error('Database pool error:', err);
});

pool.getConnection()
  .then((connection) => {
    console.log('Database connection successful');
    connection.release();
  })
  .catch((err) => {
    console.error('Failed to establish database connection:', err.message);
  });

module.exports = pool;