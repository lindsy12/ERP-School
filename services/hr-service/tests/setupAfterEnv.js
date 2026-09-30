// globalTeardown runs in its own module registry, so requiring '../src/models' there closes
// a *different* Sequelize instance than the one each test FILE actually used (Jest isolates
// modules per file). This file runs inside each test file's own registry instead, so the
// `sequelize` it closes is the same pooled connection that file's tests ran against.
const { sequelize } = require('../src/models');

afterAll(async () => {
  await sequelize.close();
});
