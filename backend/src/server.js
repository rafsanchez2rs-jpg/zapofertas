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
const { authenticate } = require('./middleware/auth');
const scheduler = require('./scheduler');

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

// ── WebSocket server — broadcast WhatsApp events to all authenticated clients ─
const wss = new WebSocket.Server({ server, path: '/ws/whatsapp' });
const wsClients = new Set();

wss.on('connection', (ws, req) => {
  const url = new URL(req.url, 'http://localhost');
  const token = url.searchParams.get('token');

  if (!token) {
    ws.send(JSON.stringify({ error: 'Token obrigatório' }));
    ws.close();
    return;
  }

  try {
    jwt.verify(token, process.env.JWT_SECRET || 'dev_secret');
  } catch {
    ws.send(JSON.stringify({ error: 'Token inválido' }));
    ws.close();
    return;
  }

  wsClients.add(ws);
  ws.on('close', () => wsClients.delete(ws));

  // Send current status immediately on connect
  const { status } = waManager.getStatus();
  if (status === 'qr' && waManager.qrCode) {
    QRCode.toDataURL(waManager.qrCode)
      .then((qrBase64) => {
        if (ws.readyState === WebSocket.OPEN) {
          ws.send(JSON.stringify({ status: 'qr', qr: qrBase64 }));
        }
      })
      .catch(() => {});
  } else {
    ws.send(JSON.stringify({ status }));
  }
});

function broadcast(data) {
  const payload = JSON.stringify(data);
  for (const ws of wsClients) {
    if (ws.readyState === WebSocket.OPEN) ws.send(payload);
  }
}

// ── Wire waManager events → WebSocket broadcasts ──────────────────────────────
waManager.on('qr', async (qr) => {
  try {
    const qrBase64 = await QRCode.toDataURL(qr);
    broadcast({ status: 'qr', qr: qrBase64 });
  } catch {}
});

waManager.on('authenticated', () => broadcast({ status: 'authenticated' }));
waManager.on('ready', () => broadcast({ status: 'ready' }));
waManager.on('auth_failure', (msg) => broadcast({ status: 'auth_failure', message: msg }));
waManager.on('disconnected', (reason) => broadcast({ status: 'disconnected', reason }));
waManager.on('rate_limited', (rl) => broadcast({ status: 'rate_limited', until: rl?.until }));
waManager.on('max_reconnect_reached', (data) => broadcast({ status: 'max_reconnect_reached', message: data?.message }));

// ── Middleware ────────────────────────────────────────────────────────────────
app.use(cors());

app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

const globalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 200,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Muitas requisições. Tente novamente em 15 minutos.' },
});
app.use(globalLimiter);

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  message: { error: 'Muitas tentativas de login. Tente novamente em 15 minutos.' },
});

// ── Routes ────────────────────────────────────────────────────────────────────
app.use('/api/auth', authLimiter, authRoutes);
app.use('/api/products', productsRoutes);
app.use('/api/groups', groupsRoutes);
app.use('/api/campaigns', campaignsRoutes);
app.use('/api/whatsapp', whatsappRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/dashboard', dashboardRoutes);

app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString(), version: '1.0.0' });
});

app.use((err, req, res, next) => {
  console.error('[Server] Unhandled error:', err);
  res.status(500).json({ error: 'Erro interno do servidor' });
});

if (process.env.NODE_ENV === 'production') {
  app.use(express.static(path.join(__dirname, '../../frontend/dist')));
  app.get('*', (req, res) => {
    if (!req.path.startsWith('/api') && !req.path.startsWith('/ws')) {
      res.sendFile(path.join(__dirname, '../../frontend/dist/index.html'));
    }
  });
}

app.use((req, res) => {
  res.status(404).json({ error: `Rota não encontrada: ${req.method} ${req.path}` });
});

// ── Start ─────────────────────────────────────────────────────────────────────
const PORT = process.env.PORT || 3001;

async function start() {
  await runMigrations();
  scheduler.init();
  server.listen(PORT, '0.0.0.0', () => {
    console.log(`ZapOfertas Backend rodando na porta ${PORT}`);
    console.log(`API: http://localhost:${PORT}/api`);
    console.log(`Env: ${process.env.NODE_ENV}`);
    waManager.initialize().catch((err) => {
      console.error('[WA] Erro ao verificar sessão Evolution API:', err.message);
    });
  });
}

start().catch((err) => {
  console.error('[Server] Falha ao iniciar:', err);
  process.exit(1);
});

process.on('SIGTERM', () => {
  console.log('[Server] SIGTERM received. Shutting down...');
  server.close(() => process.exit(0));
});

process.on('SIGINT', () => {
  console.log('\n[Server] SIGINT received. Shutting down...');
  server.close(() => process.exit(0));
});

module.exports = { app, server };
