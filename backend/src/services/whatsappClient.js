const { Client, LocalAuth, MessageMedia } = require('whatsapp-web.js');
const path = require('path');
const fs = require('fs');
const EventEmitter = require('events');

// ── File logger ───────────────────────────────────────────────────────────────
const LOG_DIR = path.join(__dirname, '../../logs');
const LOG_FILE = path.join(LOG_DIR, 'whatsapp.log');
if (!fs.existsSync(LOG_DIR)) fs.mkdirSync(LOG_DIR, { recursive: true });

function logToFile(level, message) {
  const line = `[${new Date().toISOString()}] [${level}] ${message}\n`;
  try { fs.appendFileSync(LOG_FILE, line); } catch { /* ignore */ }
}
function log(msg)   { console.log(msg);   logToFile('INFO',  msg); }
function warn(msg)  { console.warn(msg);  logToFile('WARN',  msg); }
function error(msg) { console.error(msg); logToFile('ERROR', msg); }

// ── Rate-limit error file ─────────────────────────────────────────────────────
const AUTH_DIR  = path.join(__dirname, '../../.wwebjs_auth');
const ERR_FILE  = path.join(AUTH_DIR, 'last_error.json');
const RATE_COOLDOWN_MS = 15 * 60 * 1000; // 15 minutos

function saveErrorState(type) {
  try {
    if (!fs.existsSync(AUTH_DIR)) fs.mkdirSync(AUTH_DIR, { recursive: true });
    fs.writeFileSync(ERR_FILE, JSON.stringify({ at: Date.now(), type }));
  } catch { /* ignore */ }
}

function readErrorState() {
  try {
    if (!fs.existsSync(ERR_FILE)) return null;
    return JSON.parse(fs.readFileSync(ERR_FILE, 'utf8'));
  } catch { return null; }
}

function clearErrorState() {
  try { if (fs.existsSync(ERR_FILE)) fs.unlinkSync(ERR_FILE); } catch { /* ignore */ }
}

/** Retorna { until, remainingMs } se ainda dentro do cooldown, ou null. */
function getRateLimitStatus() {
  const err = readErrorState();
  if (!err || err.type !== 'rate_limit') return null;
  const until = err.at + RATE_COOLDOWN_MS;
  if (Date.now() >= until) return null;
  return { until, remainingMs: until - Date.now() };
}

function looksLikeRateLimit(msg = '') {
  return /rate.?limit|429|too many|muitas requisi|flood/i.test(msg);
}

// ── Delays progressivos para reconexão (máx 3 tentativas) ────────────────────
const RECONNECT_DELAYS = [30000, 60000, 120000]; // 30s, 1min, 2min
const MAX_RECONNECT = 3;

// ── WhatsAppManager ───────────────────────────────────────────────────────────
class WhatsAppManager extends EventEmitter {
  constructor() {
    super();
    this.client        = null;
    this.status        = 'disconnected';
    this.qrCode        = null;
    this.reconnectTimer = null;
    this.reconnectAttempts = 0;
    this.isInitializing = false;
    this.keepAliveTimer = null;
    this.connectedSince = null;
  }

  // ── Inicializar cliente ──────────────────────────────────────────────────────
  async initialize() {
    if (this.isInitializing) return;
    if (this.status === 'qr'    && this.client) return;
    if (this.status === 'ready') return;

    // Bloquear se em cooldown de rate limit
    const rl = getRateLimitStatus();
    if (rl) {
      const mins = Math.ceil(rl.remainingMs / 60000);
      warn(`[WA] Rate limit ativo — aguardar ${mins} min antes de reconectar`);
      this.status = 'disconnected';
      this.emit('rate_limited', rl);
      return;
    }

    this.isInitializing = true;
    this.status = 'connecting';
    this._stopKeepAlive();

    if (this.client) {
      try { await this.client.destroy(); } catch { /* ignore */ }
      this.client = null;
    }

    const puppeteerConfig = {
      headless: true,
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-gpu',
        '--no-first-run',
        '--no-zygote',
        '--single-process',
        '--disable-accelerated-2d-canvas',
        '--disable-webgl',
      ],
      timeout: 60000,
    };

    if (process.env.NODE_ENV === 'production') {
      puppeteerConfig.executablePath = '/usr/bin/chromium';
    }

    this.client = new Client({
      authStrategy: new LocalAuth({
        dataPath: path.join(__dirname, '../../.wwebjs_auth'),
      }),
      puppeteer: puppeteerConfig,
    });

    this.client.on('qr', (qr) => {
      this.qrCode = qr;
      this.status = 'qr';
      this.isInitializing = false;
      this.emit('qr', qr);
      log('[WA] QR Code gerado');
    });

    this.client.on('ready', () => {
      this.status         = 'ready';
      this.qrCode         = null;
      this.reconnectAttempts = 0;
      this.isInitializing = false;
      this.connectedSince = new Date().toISOString();
      clearErrorState(); // limpar qualquer erro anterior
      if (this.reconnectTimer) {
        clearTimeout(this.reconnectTimer);
        this.reconnectTimer = null;
      }
      this._startKeepAlive();
      this.emit('ready');
      log(`[WA] Conectado! Número: ${this.client.info?.wid?.user}`);
    });

    this.client.on('authenticated', () => {
      this.emit('authenticated');
      log('[WA] Autenticado');
    });

    this.client.on('auth_failure', (msg) => {
      const msgStr = String(msg || '');
      error(`[WA] Falha de autenticação: ${msgStr}`);
      this.status         = 'disconnected';
      this.isInitializing = false;
      this._stopKeepAlive();

      if (looksLikeRateLimit(msgStr)) {
        warn('[WA] Rate limit detectado em auth_failure');
        saveErrorState('rate_limit');
        const rl = getRateLimitStatus();
        this.emit('rate_limited', rl);
      } else {
        this.emit('auth_failure', msg);
      }
    });

    this.client.on('disconnected', (reason) => {
      const reasonStr = String(reason || '');
      warn(`[WA] Desconectado: ${reasonStr}`);
      this.status         = 'disconnected';
      this.isInitializing = false;
      this.connectedSince = null;
      this._stopKeepAlive();
      this.emit('disconnected', reason);

      if (reasonStr === 'LOGOUT') {
        // Desconexão manual — não reconectar
        return;
      }

      if (looksLikeRateLimit(reasonStr)) {
        warn('[WA] Rate limit detectado em disconnected');
        saveErrorState('rate_limit');
        const rl = getRateLimitStatus();
        this.emit('rate_limited', rl);
        return;
      }

      this.scheduleReconnect();
    });

    try {
      await this.client.initialize();
    } catch (err) {
      const msgStr = err.message || '';
      error(`[WA] Erro ao inicializar: ${msgStr}`);
      this.status         = 'disconnected';
      this.isInitializing = false;
      this._stopKeepAlive();

      if (looksLikeRateLimit(msgStr)) {
        saveErrorState('rate_limit');
        const rl = getRateLimitStatus();
        this.emit('rate_limited', rl);
      } else {
        this.scheduleReconnect();
      }
    }
  }

  // ── Keep-alive ───────────────────────────────────────────────────────────────
  _startKeepAlive() {
    this._stopKeepAlive();
    this.keepAliveTimer = setInterval(async () => {
      if (this.status !== 'ready') return;
      try {
        await this.client.getState();
      } catch (e) {
        warn('[WA] Keep-alive falhou, agendando reconexão...');
        logToFile('WARN', `Keep-alive error: ${e.message}`);
        this._stopKeepAlive();
        if (this.status === 'ready') {
          this.status = 'disconnected';
          this.scheduleReconnect();
        }
      }
    }, 30000);
  }

  _stopKeepAlive() {
    if (this.keepAliveTimer) {
      clearInterval(this.keepAliveTimer);
      this.keepAliveTimer = null;
    }
  }

  // ── Reconexão progressiva (máx 3 tentativas) ─────────────────────────────────
  scheduleReconnect() {
    if (this.reconnectTimer) return;

    // Verificar rate limit antes de agendar
    const rl = getRateLimitStatus();
    if (rl) {
      warn(`[WA] Rate limit ativo — não agendando reconexão automática`);
      this.emit('rate_limited', rl);
      return;
    }

    if (this.reconnectAttempts >= MAX_RECONNECT) {
      warn('[WA] Máximo de tentativas atingido — reconexão manual necessária');
      this.emit('max_reconnect_reached');
      return;
    }

    const delay = RECONNECT_DELAYS[this.reconnectAttempts] ?? RECONNECT_DELAYS[RECONNECT_DELAYS.length - 1];
    this.reconnectAttempts++;
    log(`[WA] Reconectando em ${delay / 1000}s (tentativa ${this.reconnectAttempts}/${MAX_RECONNECT})`);

    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      this.initialize();
    }, delay);
  }

  // ── Envio de mensagem ────────────────────────────────────────────────────────
  async sendMessage(chatId, text, imageUrl = null) {
    if (this.status !== 'ready' || !this.client || !this.client.info) {
      throw new Error('WhatsApp não está conectado');
    }

    try {
      if (imageUrl) {
        let media = null;
        try {
          media = await MessageMedia.fromUrl(imageUrl, {
            unsafeMime: true,
            reqOptions: { timeout: 10000 },
          });
        } catch {
          log('[WA] Não carregou imagem, enviando só texto');
        }
        if (media) {
          await this.client.sendMessage(chatId, media, { caption: text });
        } else {
          await this.client.sendMessage(chatId, text);
        }
      } else {
        await this.client.sendMessage(chatId, text);
      }

      // Pausa pós-envio para reduzir pressão no protocolo
      await new Promise((r) => setTimeout(r, 2000));
      return { success: true };

    } catch (err) {
      const msg = err.message || '';
      error(`[WA] Erro ao enviar para ${chatId}: ${msg}`);

      if (
        msg.includes('Protocol error') ||
        msg.includes('Session closed') ||
        msg.includes('Target closed') ||
        msg.includes('browser has disconnected')
      ) {
        warn('[WA] Erro de protocolo — agendando reconexão');
        this._stopKeepAlive();
        if (this.status === 'ready') {
          this.status = 'disconnected';
          this.scheduleReconnect();
        }
        return { success: false, error: `Erro de protocolo: ${msg}` };
      }

      return { success: false, error: msg };
    }
  }

  // ── Grupos ───────────────────────────────────────────────────────────────────
  async getGroups() {
    if (this.status !== 'ready') throw new Error('WhatsApp não está conectado');
    try {
      const chats = await this.client.getChats();
      return chats
        .filter((c) => c.isGroup)
        .map((c) => ({
          id: c.id._serialized,
          name: c.name,
          participants: c.participants?.length || 0,
        }));
    } catch (err) {
      error(`[WA] Erro ao buscar grupos: ${err.message}`);
      throw err;
    }
  }

  // ── Status público ────────────────────────────────────────────────────────────
  getStatus() {
    const rl = getRateLimitStatus();
    return {
      status: this.status,
      phone: this.client?.info?.wid?.user || null,
      reconnectAttempts: this.reconnectAttempts,
      connectedSince: this.connectedSince || null,
      rateLimitedUntil: rl ? rl.until : null,
    };
  }

  // ── Logout ────────────────────────────────────────────────────────────────────
  async logout() {
    this._stopKeepAlive();
    try { await this.client?.logout(); } catch { /* ignore */ }
    this.status = 'disconnected';
    this.connectedSince = null;
    this.reconnectAttempts = 0;
    clearErrorState();
    this.emit('disconnected', 'LOGOUT');
  }
}

module.exports = new WhatsAppManager();
