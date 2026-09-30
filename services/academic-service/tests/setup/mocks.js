// Runs in every test file after Jest is set up (Jest `setupFilesAfterEnv`).

// RabbitMQ is replaced by a Jest mock for every test file:
//   - no broker is needed to run the tests;
//   - tests can assert exactly which events were published, and how many times
//     (e.g. "academic.student.at_risk_flagged fires once per transition").
// The mock mirrors the real publishEvent contract: it resolves to true and never throws.
jest.mock('../../src/services/rabbitmq', () => ({
  publishEvent: jest.fn(async () => true),
  connect: jest.fn(async () => {}),
}));

// The app logs a lot on purpose ("[at-risk] student 3 flagged...", expected 500s in rollback
// tests). Keep test output readable; set TEST_VERBOSE=1 to see it.
if (!process.env.TEST_VERBOSE) {
  jest.spyOn(console, 'log').mockImplementation(() => {});
  jest.spyOn(console, 'error').mockImplementation(() => {});
}
