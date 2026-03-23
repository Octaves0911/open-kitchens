const express = require('express');
const path = require('path');
const fs = require('fs');

const app = express();
const PORT = process.env.PORT || 3000;

// Ensure logs directory exists
const logsDir = path.join(__dirname, '..', 'logs');
if (!fs.existsSync(logsDir)) fs.mkdirSync(logsDir, { recursive: true });

// JSON logger
function log(level, message, meta = {}) {
  const entry = JSON.stringify({ timestamp: new Date().toISOString(), level, message, ...meta });
  fs.appendFileSync(path.join(logsDir, 'app.log'), entry + '\n');
  if (level === 'error') console.error(entry);
}

// Request logging middleware
app.use((req, res, next) => {
  log('info', 'request', { method: req.method, url: req.url, ip: req.ip });
  next();
});

// Serve static files
app.use(express.static(path.join(__dirname, 'public')));
app.use(express.json());

// Routes — serve HTML pages
app.get('/', (req, res) => res.sendFile(path.join(__dirname, 'public', 'index.html')));
app.get('/menu', (req, res) => res.sendFile(path.join(__dirname, 'public', 'menu.html')));
app.get('/checkout', (req, res) => res.sendFile(path.join(__dirname, 'public', 'checkout.html')));
app.get('/tracking', (req, res) => res.sendFile(path.join(__dirname, 'public', 'tracking.html')));
app.get('/restaurant', (req, res) => res.sendFile(path.join(__dirname, 'public', 'restaurant.html')));
app.get('/rider', (req, res) => res.sendFile(path.join(__dirname, 'public', 'rider.html')));

// Health check
app.get('/health', (req, res) => res.json({ status: 'ok', app: 'Open Kitchens', version: '1.0.0' }));

// Mock API endpoints for prototype
app.post('/api/check-pincode', (req, res) => {
  const zones = ['560024','560064','560080','560032','560054','560013','560022','560003','560010','560045'];
  const { pincode } = req.body;
  res.json({ available: zones.includes(String(pincode)), pincode });
});

app.post('/api/order', (req, res) => {
  const orderId = 'OK' + Date.now().toString().slice(-6);
  log('info', 'order_placed', { orderId, items: req.body.items });
  res.json({ success: true, orderId, estimatedTime: 30 });
});

app.listen(PORT, '0.0.0.0', () => {
  log('info', 'server_started', { port: PORT });
  console.log(`Open Kitchens running on port ${PORT}`);
});
