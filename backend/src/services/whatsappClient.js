const EventEmitter = require('events');
const path = require('path');
const fs = require('fs');

const SESSION_DIR = path.join(__dirname, '../../data/sessions');

class WhatsAppManager extends EventEmitter {
  constructor() {
    super();
    this.status            = 'disconnected';
    this.qrCode            = null;
    this.phone             = null;
    this.connectedSince    = null;
    this.reconnectAttempts = 0;
    this.isInitializing    = false;
    this.sock              = null;
    this.ownerId           = null; // userId dono da sessão atual
  }

  async initialize(userId = null) {
    if (this.isInitializing) return;
    if (this.status === 'ready') return;
    if (this.status === 'qr' && this.sock) return;
    if (this.status === 'connecting' && this.sock) return;

    this.isInitializing = true;
    this.status = 'connecting';
    if (userId) this.ownerId = userId;

    try {
      if (!fs.existsSync(SESSION_DIR)) {
        fs.mkdirSync(SESSION_DIR, { recursive: true });
      }

      // Baileys é ESM — usamos import() dinâmico
      const {
        default: makeWASocket,
        useMultiFileAuthState,
        DisconnectReason,
        fetchLatestBaileysVersion,
      } = await import('@whiskeysockets/baileys');

      const pino = require('pino');
      const logger = pino({ level: 'silent' });

      const { state, saveCreds } = await useMultiFileAuthState(SESSION_DIR);
      const { version } = await fetchLatestBaileysVersion();

      this.sock = makeWASocket({
        version,
        auth: state,
        printQRInTerminal: false,
        logger,
        browser: ['ZapOfertas', 'Chrome', '1.0.0'],
        connectTimeoutMs: 60000,
        defaultQueryTimeoutMs: 60000,
        keepAliveIntervalMs: 25000,
      });

      this.sock.ev.on('creds.update', saveCreds);

      this.sock.ev.on('connection.update', async ({ connection, lastDisconnect, qr }) => {
        if (qr) {
          this.qrCode = qr;
          this.status = 'qr';
          this.emit('qr', qr);
          console.log('[WA] QR Code gerado — aguardando escaneamento...');
        }

        if (connection === 'open') {
          this.status         = 'ready';
          this.qrCode         = null;
          this.connectedSince = new Date().toISOString();
          this.reconnectAttempts = 0;
          try {
            this.phone = this.sock.user?.id?.split(':')[0] || null;
          } catch { /* não crítico */ }
          this.emit('authenticated');
          this.emit('ready');
          console.log(`[WA] Conectado! Número: ${this.phone}`);
        }

        if (connection === 'close') {
          const statusCode = lastDisconnect?.error?.output?.statusCode;
          const loggedOut  = statusCode === DisconnectReason.loggedOut;

          console.warn(`[WA] Conexão fechada. Código: ${statusCode}. Logout: ${loggedOut}`);

          this.status         = 'disconnected';
          this.qrCode         = null;
          this.connectedSince = null;
          this.sock           = null;
          this.isInitializing = false;
          this.emit('disconnected', lastDisconnect?.error?.message || 'closed');

          if (loggedOut) {
            console.log('[WA] Sessão encerrada (logout). Limpando credenciais...');
            this.ownerId = null;
            try { fs.rmSync(SESSION_DIR, { recursive: true, force: true }); } catch { /* ok */ }
            fs.mkdirSync(SESSION_DIR, { recursive: true });
          } else if (this.reconnectAttempts < 5) {
            this.reconnectAttempts++;
            console.log(`[WA] Reconectando (tentativa ${this.reconnectAttempts}/5)...`);
            setTimeout(() => this.initialize(this.ownerId), 8000);
          } else {
            this.emit('max_reconnect_reached', { message: 'Máximo de tentativas atingido' });
          }
        }
      });

    } catch (err) {
      console.error('[WA] Erro ao inicializar:', err.message);
      this.status         = 'disconnected';
      this.sock           = null;
      this.isInitializing = false;
      this.emit('disconnected', 'init_error');
      return;
    }

    this.isInitializing = false;
  }

  async sendMessage(chatId, text, imageUrl = null) {
  if (this.status !== 'ready' || !this.sock || !this.sock.ws || this.sock.ws.readyState !== 1) {
    throw new Error('WhatsApp não está conectado. Vá em Configurações e escaneie o QR Code.');
  }

  try {
    if (imageUrl) {
      try {
        const response = await fetch(imageUrl);
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const arrayBuffer = await response.arrayBuffer();
        const imageBuffer = Buffer.from(arrayBuffer);
        const contentType = response.headers.get('content-type') || 'image/jpeg';
        const mimetype = contentType.startsWith('image/') ? contentType.split(';')[0] : 'image/jpeg';

        await this.sock.sendMessage(chatId, { image: imageBuffer, caption: text, mimetype });
      } catch {
        await this.sock.sendMessage(chatId, { text });
      }
    } else {
      await this.sock.sendMessage(chatId, { text });
    }

    await new Promise(r => setTimeout(r, 1800));
    return { success: true };
  } catch (err) {
    console.error(`[WA] Erro ao enviar para ${chatId}:`, err.message);
    throw new Error('WhatsApp não está conectado. Vá em Configurações e escaneie o QR Code.');
  }
}
    await new Promise(r => setTimeout(r, 1800));
    return { success: true };
  } catch (err) {
    console.error(`[WA] Erro ao enviar para ${chatId}:`, err.message);
    throw new Error('WhatsApp não está conectado. Vá em Configurações e escaneie o QR Code.');
  }
}

  async getGroups() {
    if (this.status !== 'ready' || !this.sock) {
      throw new Error('WhatsApp não está conectado');
    }
    try {
      const groups = await this.sock.groupFetchAllParticipating();
      return Object.values(groups).map((g) => ({
        id:           g.id,
        name:         g.subject || 'Sem nome',
        participants: g.participants?.length || 0,
      }));
    } catch (err) {
      console.error('[WA] Erro ao buscar grupos:', err.message);
      throw err;
    }
  }

  // Retorna true se o usuário pode interagir com esta sessão
  isOwner(userId, isAdmin = false) {
    return isAdmin || !this.ownerId || this.ownerId === userId;
  }

  getStatus(requestingUserId = null, isAdmin = false) {
    // Admin e dono da sessão vêem o status real
    if (isAdmin || !this.ownerId || this.ownerId === requestingUserId) {
      return {
        status:            this.status,
        phone:             this.phone,
        reconnectAttempts: this.reconnectAttempts,
        connectedSince:    this.connectedSince,
        rateLimitedUntil:  null,
      };
    }
    // Outros usuários vêem desconectado — não expõe sessão alheia
    return {
      status:            'disconnected',
      phone:             null,
      reconnectAttempts: 0,
      connectedSince:    null,
      rateLimitedUntil:  null,
    };
  }

  async logout() {
    try {
      if (this.sock) await this.sock.logout();
    } catch { /* ignore */ }
    this.status         = 'disconnected';
    this.connectedSince = null;
    this.phone          = null;
    this.qrCode         = null;
    this.ownerId        = null;
    this.reconnectAttempts = 0;
    this.sock           = null;
    this.isInitializing = false;
    try { fs.rmSync(SESSION_DIR, { recursive: true, force: true }); } catch { /* ok */ }
    fs.mkdirSync(SESSION_DIR, { recursive: true });
    this.emit('disconnected', 'LOGOUT');
  }
}

module.exports = new WhatsAppManager();
