// HTTP agent used for every call from the gateway to a service (proxying and health checks).
//
// Why a custom DNS lookup: Node's default lookup runs on a pool of only 4 threads. Looking up a
// service name that doesn't exist (a stopped or not-yet-built container) takes ~4 s inside Docker,
// so a few of those at once block the pool and EVERY request waits, even to healthy services.
// dns.resolve4 is fully asynchronous (no thread pool) and gets a short timeout here.
const dns = require('dns');
const http = require('http');

const resolver = new dns.Resolver({ timeout: 1000, tries: 2 });

function lookup(hostname, options, callback) {
  if (typeof options === 'function') {
    callback = options;
    options = {};
  }
  // "localhost" comes from the hosts file, which resolve4 doesn't read (used when running locally).
  if (hostname === 'localhost') {
    dns.lookup(hostname, options, callback);
    return;
  }
  resolver.resolve4(hostname, (err, addresses) => {
    if (err) {
      callback(err);
    } else if (options.all) {
      callback(null, addresses.map((address) => ({ address, family: 4 })));
    } else {
      callback(null, addresses[0], 4);
    }
  });
}

const serviceAgent = new http.Agent({ lookup });

module.exports = { serviceAgent, lookup };
