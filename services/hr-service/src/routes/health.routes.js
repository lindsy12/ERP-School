const express = require('express');
const { sequelize } = require('../models');

const router = express.Router();

router.get('/', async (req, res) => {
  let dbStatus = 'down';
  try {
    await sequelize.authenticate();
    dbStatus = 'up';
  } catch (err) {
    dbStatus = 'down';
  }
  const status = dbStatus === 'up' ? 200 : 503;
  res.status(status).json({ service: 'hr-service', status: dbStatus === 'up' ? 'ok' : 'degraded', db: dbStatus, timestamp: new Date().toISOString() });
});

module.exports = router;
