import { networkInterfaces } from 'node:os';
import { randomInt, randomBytes, timingSafeEqual } from 'node:crypto';

export const loopback = ip => ip === '127.0.0.1' || ip === '::1' || ip === '::ffff:127.0.0.1';
const ipv4 = ip => ip?.replace(/^::ffff:/, '');
const number = ip => ip.split('.').reduce((n, p) => (n * 256 + Number(p)) >>> 0, 0);
export function interfaces() {
  return Object.values(networkInterfaces()).flat().filter(x => x.family === 'IPv4' && !x.internal && /^(10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.)/.test(x.address));
}
export function allowedPeer(ip, networks = interfaces()) {
  if (loopback(ip)) return true;
  ip = ipv4(ip);
  if (!/^\d+\.\d+\.\d+\.\d+$/.test(ip || '')) return false;
  return networks.some(x => (number(ip) & number(x.netmask)) === (number(x.address) & number(x.netmask)));
}
export function allowedHost(host, port, networks = interfaces()) {
  return ['127.0.0.1', 'localhost', ...networks.map(x => x.address)].some(x => host === `${x}:${port}`);
}
export function createAccess() {
  const code = String(randomInt(10000000, 100000000));
  const sessions = new Map(), attempts = new Map();
  const duration = 12 * 60 * 60 * 1000;
  function authorized(req) {
    if (loopback(req.socket.remoteAddress) && /^(127\.0\.0\.1|localhost):/.test(req.headers.host || '')) return true;
    const token = /(?:^|;\s*)queue_session=([a-f0-9]{48})(?:;|$)/.exec(req.headers.cookie || '')?.[1];
    return Boolean(token && sessions.get(token) > Date.now());
  }
  function login(ip, input, now = Date.now()) {
    for (const [k, v] of sessions) if (v <= now) sessions.delete(k);
    for (const [k, v] of attempts) if (v.until <= now) attempts.delete(k);
    let attempt = attempts.get(ip) || { count: 0, until: now + 60000 };
    if (attempt.count >= 5) throw Object.assign(Error('尝试过多，请一分钟后重试'), { status: 429 });
    attempt.count++; attempts.set(ip, attempt);
    const entered = Buffer.from(String(input ?? ''));
    if (entered.length !== code.length || !timingSafeEqual(entered, Buffer.from(code))) throw Object.assign(Error('配对码不正确，请查看电脑控制台'), { status: 401 });
    attempts.delete(ip);
    const token = randomBytes(24).toString('hex'); sessions.set(token, now + duration);
    return `queue_session=${token}; HttpOnly; SameSite=Strict; Path=/; Max-Age=${duration / 1000}`;
  }
  return { code, authorized, login };
}
