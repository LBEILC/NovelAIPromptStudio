// Synthetic local-only transport probe. This entry point never opens the user's profile.
import { app, session } from 'electron';
import electronUpdater from 'electron-updater';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import http from 'node:http';
import https from 'node:https';
import net from 'node:net';
import { X509Certificate } from 'node:crypto';
import { createNetworkManager } from '../network.js';
import { openPreferences } from '../preferences.js';

const root = path.resolve(process.argv.at(-1));
if (
  path.dirname(root) !== path.resolve(os.tmpdir()) ||
  !path.basename(root).startsWith('studio-network-probe-')
)
  throw Error('Isolated test root required');
app.setPath('userData', root);
app.commandLine.appendSwitch('no-sandbox');
app.commandLine.appendSwitch('host-resolver-rules', 'MAP network-probe.invalid 127.0.0.1');
const checks = [];
function check(label, value) {
  checks.push({ label, ok: value === true });
  fs.writeFileSync(path.join(root, 'result.json'), JSON.stringify(checks));
  if (value !== true) throw Error(label);
}
const listen = (server) =>
  new Promise((resolve) => server.listen(0, '127.0.0.1', () => resolve(server.address().port)));
const sockets = new Set();
const track = (socket) => {
  sockets.add(socket);
  socket.on('close', () => sockets.delete(socket));
  socket.on('error', () => {});
  return socket;
};
const servers = [];
app.whenReady().then(async () => {
  try {
    const cert = fs.readFileSync(new URL('./network-tls/cert.pem', import.meta.url));
    const key = fs.readFileSync(new URL('./network-tls/key.pem', import.meta.url));
    let requests = 0,
      connects = 0,
      socksNames = [];
    const destination = https.createServer({ cert, key }, (_req, response) => {
      requests++;
      response.end('synthetic-network-response');
    });
    destination.on('connection', track);
    servers.push(destination);
    const targetPort = await listen(destination);
    const proxy = http.createServer((_req, res) => res.writeHead(405).end());
    proxy.on('connection', track);
    servers.push(proxy);
    proxy.on('connect', (request, client, head) => {
      if (request.url !== `network-probe.invalid:${targetPort}`) return client.destroy();
      connects++;
      const upstream = track(
        net.connect(targetPort, '127.0.0.1', () => {
          client.write('HTTP/1.1 200 Connection Established\r\n\r\n');
          if (head.length) upstream.write(head);
          upstream.pipe(client);
          client.pipe(upstream);
        }),
      );
      client.on('close', () => upstream.destroy());
    });
    const proxyPort = await listen(proxy);
    const socks = net.createServer((client) => {
      track(client);
      let buffer = Buffer.alloc(0),
        greeting = true;
      const receive = (chunk) => {
        buffer = Buffer.concat([buffer, chunk]);
        if (greeting) {
          if (buffer.length < 2 || buffer.length < 2 + buffer[1]) return;
          if (buffer[0] !== 5) return client.destroy();
          buffer = buffer.subarray(2 + buffer[1]);
          greeting = false;
          client.write(Buffer.from([5, 0]));
        }
        if (buffer.length < 5) return;
        if (buffer[0] !== 5 || buffer[1] !== 1 || buffer[3] !== 3) return client.destroy();
        const length = buffer[4];
        if (buffer.length < 7 + length) return;
        const hostname = buffer.subarray(5, 5 + length).toString();
        const port = buffer.readUInt16BE(5 + length);
        if (hostname !== 'network-probe.invalid' || port !== targetPort) return client.destroy();
        socksNames.push(hostname);
        const head = buffer.subarray(7 + length);
        client.removeListener('data', receive);
        const upstream = track(
          net.connect(port, '127.0.0.1', () => {
            client.write(Buffer.from([5, 0, 0, 1, 127, 0, 0, 1, 0, 0]));
            if (head.length) upstream.write(head);
            upstream.pipe(client);
            client.pipe(upstream);
          }),
        );
        client.on('close', () => upstream.destroy());
      };
      client.on('data', receive);
    });
    servers.push(socks);
    const socksPort = await listen(socks);
    const business = session.fromPartition('network-probe-business', { cache: false });
    const updaterSession = electronUpdater.autoUpdater.netSession;
    const fingerprint = new X509Certificate(cert).fingerprint256;
    for (const target of [business, updaterSession])
      target.setCertificateVerifyProc((request, callback) => {
        // Trust only this fixture certificate at this synthetic host, never arbitrary TLS errors.
        const accepted =
          request.hostname === 'network-probe.invalid' &&
          new X509Certificate(request.certificate.data).fingerprint256 === fingerprint;
        callback(accepted ? 0 : -3);
      });
    const preferences = openPreferences(root, { isEncryptionAvailable: () => false });
    const network = createNetworkManager({
      session: business,
      updaterSession,
      createTestSession: () => session.fromPartition('network-probe-test'),
      preferences,
    });
    const url = `https://network-probe.invalid:${targetPort}/`;
    await network.initialize();
    await network.save({ mode: 'direct' });
    check(
      '直连本地假服务成功',
      (await network.run(async () => (await network.fetch(url)).text())) ===
        'synthetic-network-response',
    );
    const manual = { mode: 'manual', protocol: 'http', host: '127.0.0.1', port: proxyPort };
    check('业务与更新器使用不同会话', business !== updaterSession);
    check('手动 HTTP 配置成功', (await network.save(manual)).phase === 'ready');
    const beforeConnects = connects;
    check(
      '业务 HTTPS 经 CONNECT 成功',
      (await network.run(async () => (await network.fetch(url)).text())) ===
        'synthetic-network-response',
    );
    check(
      '更新器会话 HTTPS 经 CONNECT 成功',
      (await network.run(async () => (await updaterSession.fetch(url)).text())) ===
        'synthetic-network-response',
    );
    check('两个会话都抵达假代理', connects >= beforeConnects + 2);
    check(
      '代理配置已独立持久化',
      openPreferences(root, { isEncryptionAvailable: () => false }).networkSettings().port ===
        proxyPort,
    );
    await network.save({ ...manual, protocol: 'socks5', port: socksPort });
    check(
      'SOCKS5 请求成功',
      (await network.run(async () => (await network.fetch(url)).text())) ===
        'synthetic-network-response',
    );
    check('SOCKS5 将目标域名交给代理解析', socksNames.includes('network-probe.invalid'));
    const local = http.createServer((_req, res) => res.end('loopback'));
    local.on('connection', track);
    servers.push(local);
    const localPort = await listen(local);
    check(
      '本机回调保持 loopback 绕过',
      (await network.run(async () =>
        (await network.fetch(`http://127.0.0.1:${localPort}`)).text(),
      )) === 'loopback',
    );
    await network.save(manual);
    const stopProxy = new Promise((resolve) => proxy.close(resolve));
    await business.closeAllConnections();
    await updaterSession.closeAllConnections();
    // Close both halves of the test CONNECT tunnels before shutting down the listener.
    for (const socket of sockets) socket.destroy();
    await stopProxy;
    const beforeRequests = requests;
    let failed = false;
    try {
      await network.run(async () =>
        (await network.fetch(url, { signal: AbortSignal.timeout(5000) })).text(),
      );
    } catch {
      failed = true;
    }
    check('失效代理请求明确失败', failed);
    check('失效代理未回退直连', requests === beforeRequests);
    check('代理规则没有 DIRECT 后备', !(await business.resolveProxy(url)).includes('DIRECT'));
    await network.save({ mode: 'direct' });
    check(
      '显式切回直连后恢复',
      (await network.run(async () => (await network.fetch(url)).text())) ===
        'synthetic-network-response',
    );
    await business.closeAllConnections();
    await updaterSession.closeAllConnections();
  } catch (error) {
    checks.push({ label: String(error.message), ok: false });
  } finally {
    for (const socket of sockets) socket.destroy();
    for (const server of servers) server.close();
    fs.writeFileSync(path.join(root, 'result.json'), JSON.stringify(checks));
    app.exit(checks.some((check) => !check.ok) ? 1 : 0);
  }
});
