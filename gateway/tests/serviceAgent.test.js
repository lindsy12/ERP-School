const { lookup } = require('../src/utils/serviceAgent');

const lookupAsync = (hostname, options) =>
  new Promise((resolve, reject) => {
    lookup(hostname, options, (err, ...result) => (err ? reject(err) : resolve(result)));
  });

describe('service DNS lookup', () => {
  it('resolves localhost from the hosts file (local development)', async () => {
    const [address] = await lookupAsync('localhost', {});

    expect(address).toMatch(/^(127\.0\.0\.1|::1)$/);
  });

  it('supports the { all: true } form Node uses when connecting', async () => {
    const [addresses] = await lookupAsync('localhost', { all: true });

    expect(addresses[0]).toEqual({ address: expect.any(String), family: expect.any(Number) });
  });

  it('fails fast for a name that does not exist', async () => {
    const started = Date.now();

    await expect(lookupAsync('no-such-service.invalid', {})).rejects.toHaveProperty('code');
    expect(Date.now() - started).toBeLessThan(3000);
  });
});
