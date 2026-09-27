const { hashPassword, verifyPassword } = require('../src/utils/password');

describe('password hashing', () => {
  it('never returns the plain password and verifies the right one', async () => {
    const hash = await hashPassword('correct horse battery');

    expect(hash).not.toContain('correct horse battery');
    await expect(verifyPassword('correct horse battery', hash)).resolves.toBe(true);
    await expect(verifyPassword('wrong password', hash)).resolves.toBe(false);
  });

  it('rejects passwords bcrypt would silently truncate', async () => {
    await expect(hashPassword('a'.repeat(73))).rejects.toThrow('at most 72 bytes');
  });
});
