require('dotenv').config();

const express = require('express');
const cors = require('cors');
const http = require('http');
const WebSocket = require('ws');
const QRCode = require('qrcode');
const rateLimit = require('express-rate-limit');
const jwt = require('jsonwebtoken');
const path = require('path');

const { runMigrations } = require('./db/migrations');
const waManager = require('./services/whatsappClient');
const scheduler = require('./scheduler');

// Rotas
const authRoutes = require('./routes/auth');
const productsRoutes = require('./routes/products');
const groupsRoutes = require('./routes/groups');
const campaignsRoutes = require('./routes/campaigns');
const whatsappRoutes = require('./routes/whatsapp');
const adminRoutes = require('./routes/admin');
const dashboardRoutes = require('./routes/dashboard');

const app = express();
app.set('trust proxy', 1);
const server = http.createServer(app);

// ── WebSocket ─────────────────────────────────────────
const wss = new WebSocket.Server({ server, path: '/ws/whatsapp' });
const wsClients = new Set();

wss.on('connection', (ws, req) => {
  const url = new URL(req.url, 'http://localhost');
  const token = url.searchParams.get('token');

  if (!token) {
    ws.send(JSON.stringify({ error: 'Token obrigatório' }));
    return ws.close();
  }

  try {
    jwt.verify(token, process.env.JWT_SECRET || 'dev_secret');
  } catch {
    ws.send(JSON.stringify({ error: 'Token inválido' }));
    return ws.close();
  }

  wsClients.add(ws);
  ws.on('close', () => wsClients.delete(ws));

  const { status } = waManager.getStatus();
  ws.send(JSON.stringify({ status }));
});

function broadcast(data) {
  const payload = JSON.stringify(data);
  wsClients.forEach(ws => {
    if (ws.readyState === WebSocket.OPEN) ws.send(payload);
  });
}

// Eventos WhatsApp
waManager.on('qr', async (qr) => {
  try {
    const qrBase64 = await QRCode.toDataURL(qr);
    broadcast({ status: 'qr', qr: qrBase64 });
  } catch {}
});

waManager.on('ready', () => broadcast({ status: 'ready' }));

// ── Middlewares ───────────────────────────────────────
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

const limiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 200
});

app.use(limiter);

// ── Rotas ─────────────────────────────────────────────
app.use('/api/auth', authRoutes);
app.use('/api/products', productsRoutes);
app.use('/api/groups', groupsRoutes);
app.use('/api/campaigns', campaignsRoutes);
app.use('/api/whatsapp', whatsappRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/dashboard', dashboardRoutes);

// ── Frontend (produção) ───────────────────────────────
if (process.env.NODE_ENV === 'production') {
  const frontendPath = path.join(__dirname, '../../frontend/dist');

  app.use(express.static(frontendPath));

  app.get('*', (req, res) => {
    if (!req.path.startsWith('/api') && !req.path.startsWith('/ws')) {
      res.sendFile(path.join(frontendPath, 'index.html'));
    }
  });
}

// ── 404 ───────────────────────────────────────────────
app.use((req, res) => {
  res.status(404).json({ error: 'Rota não encontrada' });
});

// ── Start ─────────────────────────────────────────────
const PORT = process.env.PORT || 3001;

runMigrations();
scheduler.init();

server.listen(PORT, '0.0.0.0', () => {
});

// Encerramento
process.on('SIGTERM', () => process.exit(0));
process.on('SIGINT', () => process.exit(0));

module.exports = { app, server };
