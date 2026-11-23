/**
 * Flaky local DNS often fails getaddrinfo for Expo/GCS hosts (including
 * dynamic *.on.expo.app tunnel hostnames). Force lookups through public DNS.
 */
const dns = require('dns');
const { promisify } = require('util');

dns.setServers(['8.8.8.8', '1.1.1.1', '8.8.4.4']);

const resolve4 = promisify(dns.resolve4);
const originalLookup = dns.lookup.bind(dns);

const STATIC = {
  'api.expo.dev': '104.18.5.104',
  'expo.dev': '104.18.4.104',
  'exp.host': '34.110.201.56',
  'u.expo.dev': '104.18.5.104',
  'storage.googleapis.com': '142.250.202.155',
};

const cache = { ...STATIC };
const pending = Object.create(null);

function reply(callback, options, ip) {
  const family = 4;
  if (options && options.all) {
    callback(null, [{ address: ip, family }]);
  } else {
    callback(null, ip, family);
  }
}

function shouldPatch(hostname) {
  if (!hostname || typeof hostname !== 'string') return false;
  if (cache[hostname] || STATIC[hostname]) return true;
  return (
    hostname.endsWith('.on.expo.app')
    || hostname.endsWith('.expo.app')
    || hostname.endsWith('.exp.direct')
    || hostname === 'api.expo.dev'
    || hostname === 'expo.dev'
    || hostname === 'exp.host'
    || hostname === 'u.expo.dev'
    || hostname === 'storage.googleapis.com'
  );
}

dns.lookup = (hostname, options, callback) => {
  if (typeof options === 'function') {
    callback = options;
    options = {};
  }

  if (!shouldPatch(hostname)) {
    return originalLookup(hostname, options, callback);
  }

  if (cache[hostname]) {
    return reply(callback, options, cache[hostname]);
  }

  if (!pending[hostname]) {
    pending[hostname] = resolve4(hostname)
      .then((addrs) => {
        if (addrs && addrs[0]) cache[hostname] = addrs[0];
        return cache[hostname] || null;
      })
      .catch(() => null)
      .finally(() => {
        delete pending[hostname];
      });
  }

  pending[hostname].then((ip) => {
    if (ip) return reply(callback, options, ip);
    return originalLookup(hostname, options, callback);
  });
};
