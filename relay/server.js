import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { WebSocketServer } from 'ws';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const mime = { '.html':'text/html; charset=utf-8', '.css':'text/css; charset=utf-8', '.js':'text/javascript; charset=utf-8', '.json':'application/json; charset=utf-8', '.png':'image/png', '.svg':'image/svg+xml' };

const server = http.createServer((request, response) => {
  const rawPath = new URL(request.url, 'http://localhost').pathname;
  const requested = rawPath === '/' ? '/overlay/index.html' : rawPath;
  const filePath = path.resolve(root, `.${requested}`);
  if (!filePath.startsWith(root)) { response.writeHead(403).end('Forbidden'); return; }
  fs.readFile(filePath, (error, content) => {
    if (error) { response.writeHead(error.code === 'ENOENT' ? 404 : 500).end('Not found'); return; }
    response.writeHead(200, { 'Content-Type': mime[path.extname(filePath)] || 'application/octet-stream', 'Cache-Control':'no-cache' });
    response.end(content);
  });
});
server.listen(8080, () => console.log('Arena: http://localhost:8080/'));

const ws = new WebSocketServer({ port: 8081 });
ws.on('connection', (client) => {
  client.send(JSON.stringify({ type:'relay:ready' }));
  client.on('message', (message) => {
    for (const peer of ws.clients) if (peer.readyState === 1) peer.send(message.toString());
  });
});
console.log('WebSocket: ws://localhost:8081');
