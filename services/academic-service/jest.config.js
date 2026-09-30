// Jest configuration for the Academic Service integration tests.
// The tests call the real Express app (via Supertest) against a real MySQL test database.
module.exports = {
  testEnvironment: 'node',
  roots: ['<rootDir>/tests'],
  testMatch: ['**/*.test.js'],

  // Runs before each test file loads any app code: points the DB config at the TEST database.
  setupFiles: ['<rootDir>/tests/setup/env.js'],
  // Runs in each test file after Jest is ready: mocks RabbitMQ and quiets app logging.
  setupFilesAfterEnv: ['<rootDir>/tests/setup/mocks.js'],

  // Every test file drops and recreates the same test database in beforeAll/afterAll,
  // so files must run one at a time, never in parallel.
  maxWorkers: 1,

  // Real database round-trips: allow more than Jest's 5s default.
  testTimeout: 30000,
};
