// Runs before every test file (see "jest.setupFiles" in package.json).
// Placeholder values so the modules load; tests never touch a real database or broker.
process.env.DB_HOST = 'localhost';
process.env.DB_USER = 'test';
process.env.DB_NAME = 'notification_test';
