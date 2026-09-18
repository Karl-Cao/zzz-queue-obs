import { createServer } from 'node:net';
export async function isFree(port) { return new Promise(resolve => { const server = createServer(); server.once('error', () => resolve(false)); server.listen(port, '0.0.0.0', () => server.close(() => resolve(true))); }); }
export async function findFreePort(start = 3667) { for (let p = start; p < Math.min(start + 100,65536); p++) if (await isFree(p)) return p; throw Error('没有可用端口，请关闭重复服务后重试'); }
