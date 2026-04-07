const EventEmitter = require('events');
const path = require('path');
const fs = require('fs');

const SESSION_DIR = path.join(__dirname, '../../data/sessions');

class WhatsAppManager extends EventEmitter {
  constructor() {
    super();
    this.status = 'disconnected';
    this.qrCode = null;
    this.phone = null;
    this.connectedSince = null;
    this.reconnectAttempts = 0;
    this.isInitializing = false;
    this.sock = null;
    this.ownerId = null;
  }

  async initialize(userId = null) {
    if (this.isInitializing) return;
    if (this.status === 'ready' && this.sock) return;

    this.isInitializing = true;
    this.status = 'connecting';

    if (userId) this.ownerId = userId;

    try {
      if (!fs.existsSync(SESSION_DIR)) {
        fs.mkdirSync(SESSION_DIR, { recursive: true });
      }

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
        keepAliveIntervalMs: 30000,
        retryRequestDelayMs: 5000,
      });

      this.sock.ev.on('creds.update', saveCreds);

      this.sock.ev.on('connection.update', async ({ connection, lastDisconnect, qr }) => {
        if (qr) {
          this.qrCode = qr;
          this.status = 'qr';
          this.emit('qr', qr);
          console.log('[WA] QR Code gerado');
          return;
        }

        if (connection === 'open') {
          this.status = 'ready';
          this.qrCode = null;
          this.connectedSince = new Date().toISOString();
          this.reconnectAttempts = 0;
          this.phone = this.sock.user?.id?.split(':')[0] || null;

          console.log(`[WA] ✅ Conectado! Número: ${this.phone}`);
          this.emit('authenticated');
          this.emit('ready');
        }

        if (connection === 'close') {
          const statusCode = lastDisconnect?.error?.output?.statusCode;
          const loggedOut = statusCode === DisconnectReason.loggedOut;

          console.warn(`[WA] Conexão fechada. Código: ${statusCode} | Logout: ${loggedOut}`);

          this.status = 'disconnected';
          this.connectedSince = null;
          this.sock = null;                    // Limpa o socket

          this.emit('disconnected', lastDisconnect?.error?.message || 'closed');

          if (loggedOut) {
            console.log('[WA] Sessão encerrada (logout). Limpando credenciais...');
            this.ownerId = null;
            try { fs.rmSync(SESSION_DIR, { recursive: true, force: true }); } catch {}
            fs.mkdirSync(SESSION_DIR, { recursive: true });
          } 
          else if (this.reconnectAttempts < 6) {
            this.reconnectAttempts++;
            const delay = 5000 + (this.reconnectAttempts * 2000); // backoff
            console.log(`[WA] Reconectando em ${delay/1000}s (tentativa ${this.reconnectAttempts}/6)...`);
            setTimeout(() => this.initialize(this.ownerId), delay);
          } else {
            console.error('[WA] Máximo de tentativas de reconexão atingido.');
            this.emit('max_reconnect_reached');
          }
        }
      });

    } catch (err) {
      console.error('[WA] Erro ao inicializar Baileys:', err.message);
      this.status = 'disconnected';
      this.sock = null;
      this.emit('disconnected', 'init_error');
    } finally {
      this.isInitializing = false;
    }
  }

  // ====================== VERIFICAÇÃO REAL DE CONEXÃO ======================
  isReallyConnected() {
    return !!(
      this.sock &&
      this.sock.ws?.readyState === 1 &&     // 1 = OPEN
      this.status === 'ready'
    );
  }

  // ====================== ENVIO DE MENSAGEM ======================
  async sendMessage(chatId, text, imageUrl = null) {
    if (!this.isReallyConnected()) {
      throw new Error('WhatsApp não está conectado. Vá em Configurações e escaneie o QR Code.');
    }

    try {
      if (imageUrl) {
        const response = await fetch(imageUrl);
        if (!response.ok) throw new Error(`HTTP ${response.status}`);

        const arrayBuffer = await response.arrayBuffer();
        const imageBuffer = Buffer.from(arrayBuffer);
        const contentType = response.headers.get('content-type') || 'image/jpeg';
        const mimetype = contentType.startsWith('image/') ? contentType.split(';')[0] : 'image/jpeg';

        await this.sock.sendMessage(chatId, {
          image: imageBuffer,
          caption: text,
          mimetype,
        });
      } else {
        await this.sock.sendMessage(chatId, { text });
      }

      // Delay pequeno para evitar flood
      await new Promise(r => setTimeout(r, 1500));
      return { success: true };
    } catch (err) {
      console.error(`[WA] Erro ao enviar para ${chatId}:`, err.message);

      // Se for erro de conexão, marca como desconectado
      if (err.message?.toLowerCase().includes('connection') || 
          err.output?.statusCode) {
        this.status = 'disconnected';
        this.sock = null;
      }

      throw err;
    }
  }

  // ====================== BUSCAR GRUPOS ======================
  async getGroups() {
    if (!this.isReallyConnected()) {
      throw new Error('WhatsApp não está conectado. Vá em Configurações e escaneie o QR Code.');
    }

    try {
      const groups = await this.sock.groupFetchAllParticipating();
      return Object.values(groups).map(g => ({
        id: g.id,
        name: g.subject || 'Sem nome',
        participants: g.participants?.length || 0,
      }));
    } catch (err) {
      console.error('[WA] Erro ao buscar grupos:', err.message);
      throw err;
    }
  }

  // ====================== STATUS ======================
  getStatus(requestingUserId = null, isAdmin = false) {
    const realStatus = this.isReallyConnected() ? 'ready' : this.status;

    if (isAdmin || !this.ownerId || this.ownerId === requestingUserId) {
      return {
        status: realStatus,
        phone: this.phone,
        reconnectAttempts: this.reconnectAttempts,
        connectedSince: this.connectedSince,
      };
    }

    // Usuários comuns não veem informação da sessão
    return {
      status: 'disconnected',
      phone: null,
      reconnectAttempts: 0,
      connectedSince: null,
    };
  }

  async logout() {
    try {
      if (this.sock) await this.sock.logout();
    } catch {}

    this.status = 'disconnected';
    this.connectedSince = null;
    this.phone = null;
    this.qrCode = null;
    this.ownerId = null;
    this.reconnectAttempts = 0;
    this.sock = null;

    try { fs.rmSync(SESSION_DIR, { recursive: true, force: true }); } catch {}
    fs.mkdirSync(SESSION_DIR, { recursive: true });

    this.emit('disconnected', 'LOGOUT');
  }
}

module.exports = new WhatsAppManager();
