// Runs before every test file (see "jest.setupFiles" in package.json).
// Placeholder values so config/env.js loads; tests never touch a real database.
process.env.DB_HOST = 'localhost';
process.env.DB_USER = 'test';
process.env.DB_NAME = 'auth_test';
process.env.JWT_SECRET = 'test-secret';
process.env.ACCESS_TOKEN_MINUTES = '15';
process.env.REFRESH_TOKEN_DAYS = '7';
process.env.BCRYPT_SALT_ROUNDS = '4'; // fast hashing for tests only
