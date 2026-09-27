const { Router } = require('express');

const router = Router();

// Used by Docker, the gateway and teammates to check the service is up.
router.get('/', (req, res) => {
  res.json({ status: 'ok', service: 'auth' });
});

module.exports = router;
