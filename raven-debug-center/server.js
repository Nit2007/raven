/**
 * RAVEN Telemetry Relay Server (Port 8765)
 * Combines HTTP REST endpoint and WebSocket server to bridge telemetry
 * between the Chrome Extension background worker and the Debug Center frontend.
 */

import http from 'node:http';
import { WebSocketServer, WebSocket } from 'ws';

const PORT = 8765;

const server = http.createServer((req, res) => {
  // CORS Headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    res.end();
    return;
  }

  if (req.url === '/health' && req.method === 'GET') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ status: 'ok', clients: wss.clients.size }));
    return;
  }

  if (req.url === '/telemetry' && req.method === 'POST') {
    let body = '';
    req.on('data', chunk => {
      body += chunk;
      // Safeguard against oversized payloads (> 50MB)
      if (body.length > 50 * 1024 * 1024) {
        req.destroy();
      }
    });

    req.on('end', () => {
      try {
        const payload = JSON.parse(body);
        broadcastToClients(payload);
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ ok: true, forwardedTo: wss.clients.size }));
      } catch (err) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ ok: false, error: err.message }));
      }
    });
    return;
  }

  res.writeHead(404, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({ error: 'Not found' }));
});

const wss = new WebSocketServer({ server });

function broadcastToClients(data) {
  const jsonStr = typeof data === 'string' ? data : JSON.stringify(data);
  for (const client of wss.clients) {
    if (client.readyState === WebSocket.OPEN) {
      client.send(jsonStr);
    }
  }
}

wss.on('connection', (ws) => {
  console.log(`[RAVEN Telemetry Relay] Client connected (Total: ${wss.clients.size})`);

  ws.on('message', (message) => {
    try {
      const data = JSON.parse(message.toString());
      // Re-broadcast message to other clients
      broadcastToClients(data);
    } catch (_) {}
  });

  ws.on('close', () => {
    console.log(`[RAVEN Telemetry Relay] Client disconnected (Total: ${wss.clients.size})`);
  });
});

server.listen(PORT, () => {
  console.log(`[RAVEN Telemetry Relay] Running on http://localhost:${PORT} and ws://localhost:${PORT}`);
});
