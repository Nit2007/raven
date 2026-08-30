const express = require('express');
const cors = require('cors');
const path = require('path');
const { WebSocketServer } = require('ws');
const http = require('http');

const app = express();
app.use(cors());
app.use(express.json({ limit: '50mb' }));

const server = http.createServer(app);
const wss = new WebSocketServer({ server });

// Store the latest scan so new WS clients get data immediately
let latestScan = null;

// Serve viewer.html as the root page — bypasses all extension CSP restrictions
app.use('/dashboard', express.static(path.join(__dirname, 'dashboard')));

app.get('/', (req, res) => {
  res.redirect('/dashboard/viewer.html');
});

// Broadcast received scans to all connected WebSocket clients
app.post('/log-scan', (req, res) => {
  const scanData = req.body;
  latestScan = scanData;
  console.log(`[+] Received scan from ${scanData.url} (${scanData.classifiedElements?.length || 0} elements)`);

  const payloadStr = JSON.stringify(scanData);
  let sentCount = 0;
  wss.clients.forEach(client => {
    if (client.readyState === 1) {
      client.send(payloadStr);
      sentCount++;
    }
  });
  console.log(`    → Broadcast to ${sentCount} viewer(s)`);

  res.json({ success: true });
});

// When a new viewer connects, immediately send the latest scan if we have one
wss.on('connection', (ws) => {
  console.log('[+] Viewer connected via WebSocket');
  if (latestScan) {
    ws.send(JSON.stringify(latestScan));
  }
});

server.listen(3001, '0.0.0.0', () => {
  console.log('=============================================');
  console.log('🚀 SafeScreen Live Server running on port 3001');
  console.log('=============================================');
  console.log('');
  console.log('  ▸ Open the viewer:  http://localhost:3001');
  console.log('');
  console.log('The extension POSTs redaction data here.');
  console.log('The viewer connects over WebSocket to receive it live.');
});
