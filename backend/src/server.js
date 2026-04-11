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
const { getSession } = require('./services/waSessions');
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

  if (!token) { ws.send(JSON.stringify({ error: 'Token obrigatório' })); ws.close(); return; }

  let decoded;
  try {
    decoded = jwt.verify(token, process.env.JWT_SECRET || 'dev_secret');
  } catch {
    ws.send(JSON.stringify({ error: 'Token inválido' })); ws.close(); return;
  }

  const userId = decoded.id || decoded.userId;
  const wa = getSession(userId);

  const send = (data) => {
    if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(data));
  };

  // Handlers vinculados a este WebSocket
  const onQr = async (qr) => {
    try { send({ status: 'qr', qr: await QRCode.toDataURL(qr) }); } catch {}
  };
  const onReady        = () => send({ status: 'ready' });
  const onAuth         = () => send({ status: 'authenticated' });
  const onDisconnected = (r) => send({ status: 'disconnected', reason: r });

  wa.on('qr', onQr);
  wa.on('ready', onReady);
  wa.on('authenticated', onAuth);
  wa.on('disconnected', onDisconnected);

  ws.on('close', () => {
    wa.off('qr', onQr);
    wa.off('ready', onReady);
    wa.off('authenticated', onAuth);
    wa.off('disconnected', onDisconnected);
  });

  // Envia status atual imediatamente
  if (wa.status === 'qr' && wa.qrBase64) {
    send({ status: 'qr', qr: wa.qrBase64 });
  } else {
    send({ status: wa.status });
  }
});

// ── Middleware ────────────────────────────────────────────────────────────────
app.use(cors());

app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

const globalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 1000,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Muitas requisições. Tente novamente em 15 minutos.' },
});
app.use(globalLimiter);

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 30,
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
    // Sessões WhatsApp inicializadas sob demanda por usuário
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
