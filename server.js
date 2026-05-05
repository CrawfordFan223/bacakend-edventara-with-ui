const express = require('express');
const cors = require('cors');
require('dotenv').config();

const app = express();

app.use(cors());
app.use(express.json());

app.get('/', (req, res) => {
  res.send('Server running');
});

app.get('/api/health', (req, res) => {
  res.json({ status: 'ok' });
});

const authRoutes = require('./routes/auth.js');
app.use('/api/auth', authRoutes);

const schoolRoutes = require('./routes/school.js');
app.use('/api/school', schoolRoutes);

const pool = require('./db/connection');

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
