const EventEmitter = require('events');
const makeWASocket = require('@whiskeysockets/baileys').default;
const { DisconnectReason, fetchLatestBaileysVersion } = require('@whiskeysockets/baileys');
const { Boom } = require('@hapi/boom');
const QRCode = require('qrcode');
const { getDb } = require('../db/database');
const { usePostgresAuthState } = require('./waAuthStore');

class WhatsAppManager extends EventEmitter {
  constructor(sessionId) {
    super();
    this.sessionId = sessionId;
    this.status = 'disconnected'; // disconnected | connecting | qr | ready
    this.qrCode = null;           // raw QR string
    this.qrBase64 = null;         // base64 image para o frontend
    this.phone = null;
    this.connectedSince = null;
    this.sock = null;
    this.isInitializing = false;
    this.reconnectAttempts = 0;
    this._authStore = null;
  }

  async initialize() {
    if (this.isInitializing) return;
    if (this.status === 'ready') return;

    this.isInitializing = true;
    this.status = 'connecting';
    console.log('[WA] Inicializando Baileys...');

    try {
      const db = getDb();
      const authStore = await usePostgresAuthState(db, this.sessionId);
      this._authStore = authStore;
      const { state, saveCreds } = authStore;

      const { version } = await fetchLatestBaileysVersion();
      console.log(`[WA] Usando Baileys v${version.join('.')}`);

      this.sock = makeWASocket({
        version,
        auth: state,
        printQRInTerminal: false,
        browser: ['ZapOfertas', 'Chrome', '120.0.0'],
        // Sem logs verbosos
        logger: require('pino')({ level: 'silent' }),
        getMessage: async () => ({ conversation: '' }),
      });

      this.sock.ev.on('creds.update', saveCreds);

      this.sock.ev.on('connection.update', async (update) => {
        const { connection, lastDisconnect, qr } = update;

        if (qr) {
          this.qrCode = qr;
          this.qrBase64 = await QRCode.toDataURL(qr);
          this.status = 'qr';
          console.log('[WA] QR Code gerado — aguardando escaneamento');
          this.emit('qr', qr);
        }

        if (connection === 'close') {
          const statusCode = new Boom(lastDisconnect?.error)?.output?.statusCode;
          const loggedOut = statusCode === DisconnectReason.loggedOut;
          console.log(`[WA] Conexão fechada. statusCode=${statusCode} loggedOut=${loggedOut}`);

          this.status = 'disconnected';
          this.qrCode = null;
          this.qrBase64 = null;
          this.sock = null;
          this.isInitializing = false;

          if (loggedOut) {
            // Limpa sessão para forçar novo QR no próximo initialize()
            const db = getDb();
            await db.query('DELETE FROM whatsapp_sessions WHERE session_id = $1', [this.sessionId]);
            console.log('[WA] Sessão removida — novo QR necessário');
            this.emit('disconnected', 'LOGOUT');
          } else {
            // Reconecta com backoff
            this.reconnectAttempts++;
            const delay = Math.min(this.reconnectAttempts * 4000, 30000);
            console.log(`[WA] Reconectando em ${delay / 1000}s (tentativa ${this.reconnectAttempts})`);
            setTimeout(() => this.initialize(), delay);
          }
        } else if (connection === 'open') {
          this.status = 'ready';
          this.qrCode = null;
          this.qrBase64 = null;
          this.reconnectAttempts = 0;
          this.connectedSince = new Date().toISOString();
          this.phone = this.sock?.user?.id?.split(':')[0] || null;
          console.log(`[WA] Conectado! Número: ${this.phone}`);
          this.emit('authenticated');
          this.emit('ready');
        }
      });

    } catch (err) {
      console.error('[WA] Erro ao inicializar:', err.message);
      this.status = 'disconnected';
      this.isInitializing = false;
      setTimeout(() => this.initialize(), 5000);
    }

    this.isInitializing = false;
  }

  // ── Pairing code (para app mobile — sem QR code) ──────────────────────────
  async requestPairingCode(phoneNumber) {
    if (!this.sock) {
      throw new Error('WhatsApp não inicializado. Chame initialize() primeiro.');
    }

    // Formatar número: remover +, espaços, traços
    const phone = phoneNumber.replace(/[\s\-\+\(\)]/g, '');

    try {
      const code = await this.sock.requestPairingCode(phone);
      console.log(`[WA] Pairing code gerado para ${phone}: ${code}`);
      return code;
    } catch (err) {
      console.error('[WA] Erro ao gerar pairing code:', err.message);
      throw new Error('Erro ao gerar código de pareamento. Verifique o número.');
    }
  }

  // ── Envio de mensagem ─────────────────────────────────────────────────────
  async sendMessage(chatId, text, imageUrl = null) {
    if (this.status !== 'ready' || !this.sock) {
      throw new Error('WhatsApp não está conectado');
    }

    // Normaliza JID
    const jid = chatId.includes('@') ? chatId : `${chatId}@s.whatsapp.net`;

    try {
      if (imageUrl) {
        try {
          await this.sock.sendMessage(jid, { image: { url: imageUrl }, caption: text });
        } catch {
          // Fallback: só texto se imagem falhar
          await this.sock.sendMessage(jid, { text });
        }
      } else {
        await this.sock.sendMessage(jid, { text });
      }
      await new Promise((r) => setTimeout(r, 1000));
      return { success: true };
    } catch (err) {
      console.error(`[WA] Erro ao enviar para ${chatId}:`, err.message);
      return { success: false, error: err.message };
    }
  }

  // ── Buscar grupos ─────────────────────────────────────────────────────────
  async getGroups() {
    if (this.status !== 'ready' || !this.sock) {
      throw new Error('WhatsApp não está conectado');
    }
    const groups = await this.sock.groupFetchAllParticipating();
    return Object.values(groups).map((g) => ({
      id: g.id,
      name: g.subject || 'Sem nome',
      participants: g.participants?.length || 0,
    }));
  }

  // ── Status público ────────────────────────────────────────────────────────
  getStatus() {
    return {
      status: this.status,
      phone: this.phone,
      reconnectAttempts: this.reconnectAttempts,
      connectedSince: this.connectedSince,
      rateLimitedUntil: null,
    };
  }

  // ── Logout ────────────────────────────────────────────────────────────────
  async logout() {
    try {
      if (this.sock) await this.sock.logout();
    } catch { /* ignore */ }

    // Limpa sessão do banco
    try {
      const db = getDb();
      await db.query('DELETE FROM whatsapp_sessions WHERE session_id = $1', [this.sessionId]);
    } catch { /* ignore */ }

    this.status = 'disconnected';
    this.sock = null;
    this.qrCode = null;
    this.qrBase64 = null;
    this.phone = null;
    this.connectedSince = null;
    this.reconnectAttempts = 0;
    this.isInitializing = false;
    this.emit('disconnected', 'LOGOUT');
  }
}

module.exports = WhatsAppManager;
