// Runs before every test file (see "jest.setupFiles" in package.json).
// Placeholder URLs so config/env.js loads; tests pass their own fake services to createApp().
process.env.AUTH_SERVICE_URL = 'http://127.0.0.1:1';
process.env.ACADEMIC_SERVICE_URL = 'http://127.0.0.1:1';
process.env.FINANCE_SERVICE_URL = 'http://127.0.0.1:1';
process.env.HR_SERVICE_URL = 'http://127.0.0.1:1';
process.env.NOTIFICATION_SERVICE_URL = 'http://127.0.0.1:1';
process.env.CORS_ORIGIN = 'http://allowed.test';
