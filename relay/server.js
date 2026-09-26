import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { WebSocketServer, WebSocket } from 'ws';
import { GameManager } from '../src/game-manager.js';
import { PlayerStore } from '../src/player-store.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const readJson = (relativePath) => JSON.parse(fs.readFileSync(path.join(root, relativePath), 'utf8'));
const classes = readJson('config/classes.json');
const balance = readJson('config/balance.json');
const store = new PlayerStore(path.join(root, 'data', 'players.json'));
const mime = { '.html':'text/html; charset=utf-8', '.css':'text/css; charset=utf-8', '.js':'text/javascript; charset=utf-8', '.json':'application/json; charset=utf-8', '.png':'image/png', '.svg':'image/svg+xml' };

const server = http.createServer((request, response) => {
  const url = new URL(request.url, 'http://localhost');
  if (request.method === 'POST' && url.pathname === '/api/chat-command') {
    let body = '';
    request.on('data', (chunk) => { body += chunk; if (body.length > 1e6) request.destroy(); });
    request.on('end', () => {
      try {
        const result = manager.handleCommand(JSON.parse(body || '{}'));
        response.writeHead(200, { 'Content-Type':'application/json; charset=utf-8', 'Access-Control-Allow-Origin':'*' });
        response.end(JSON.stringify({ ok: true, result }));
      } catch (error) {
        response.writeHead(400, { 'Content-Type':'application/json; charset=utf-8', 'Access-Control-Allow-Origin':'*' });
        response.end(JSON.stringify({ ok: false, error: error.message }));
      }
    });
    return;
  }
  const requested = url.pathname === '/' ? '/overlay/index.html' : url.pathname;
  const filePath = path.resolve(root, `.${requested}`);
  if (!filePath.startsWith(root)) { response.writeHead(403).end('Forbidden'); return; }
  fs.readFile(filePath, (error, content) => {
    if (error) { response.writeHead(error.code === 'ENOENT' ? 404 : 500).end('Not found'); return; }
    response.writeHead(200, { 'Content-Type': mime[path.extname(filePath)] || 'application/octet-stream', 'Cache-Control':'no-cache' });
    response.end(content);
  });
});

const wss = new WebSocketServer({ server, path: '/ws' });
const broadcast = (payload) => {
  const message = JSON.stringify(payload);
  for (const client of wss.clients) if (client.readyState === WebSocket.OPEN) client.send(message);
};
const manager = new GameManager({ classes, balance, store, broadcast, sendChat: (payload) => console.log(`[CHAT] ${payload.message}`) });

wss.on('connection', (client) => {
  client.send(JSON.stringify({ type:'relay:ready', queue: manager.queue.length, battleActive: Boolean(manager.activeBattle) }));
  client.on('message', (raw) => {
    try {
      const message = JSON.parse(raw.toString());
      if (message.type === 'chat:command') manager.handleCommand(message);
      if (message.type === 'battle:complete') manager.finishBattle(message.battleId);
      if (message.type === 'relay:broadcast' && message.payload) broadcast(message.payload);
    } catch (error) {
      client.send(JSON.stringify({ type:'relay:error', message:error.message }));
    }
  });
});

const port = Number(process.env.PORT || 8080);
server.listen(port, () => {
  console.log(`Арена: http://localhost:${port}/`);
  console.log(`OBS: http://localhost:${port}/?overlay=1`);
  console.log(`WebSocket: ws://localhost:${port}/ws`);
});
