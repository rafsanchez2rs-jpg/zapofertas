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
    if (this.isInitializing) {
      console.log('[WA] Já está inicializando...');
      return;
    }
    if (this.status === 'ready' && this.sock?.ws?.readyState === 1) return;

    this.isInitializing = true;
    this.status = 'connecting';
    if (userId) this.ownerId = userId;

    console.log(`[WA] Iniciando cliente... (tentativa ${this.reconnectAttempts})`);

    try {
      if (!fs.existsSync(SESSION_DIR)) {
        fs.mkdirSync(SESSION_DIR, { recursive: true });
      }

      const {
        default: makeWASocket,
        useMultiFileAuthState,
        DisconnectReason,
      } = await import('@whiskeysockets/baileys');

      const pino = require('pino');
      const logger = pino({ level: 'silent' });

      const { state, saveCreds } = await useMultiFileAuthState(SESSION_DIR);

      // === FIX IMPORTANTE: Não usar fetchLatestBaileysVersion (muitas vezes trava) ===
      this.sock = makeWASocket({
        version: [2, 3000, 1015901307],     // versão estável recente
        auth: state,
        printQRInTerminal: false,
        logger,
        browser: ['Mac OS', 'Chrome', '132.0.0'],   // User-agent mais aceito
        connectTimeoutMs: 180000,
        defaultQueryTimeoutMs: 180000,
        keepAliveIntervalMs: 40000,
        retryRequestDelayMs: 10000,
        qrTimeout: 60000,
      });

      console.log('[WA] Socket criado com sucesso. Aguardando eventos...');

      this.sock.ev.on('creds.update', saveCreds);

      this.sock.ev.on('connection.update', async (update) => {
        const { connection, lastDisconnect, qr } = update;

        console.log(`[WA] connection.update → connection: ${connection} | qr: ${!!qr}`);

        if (qr) {
          this.qrCode = qr;
          this.status = 'qr';
          this.emit('qr', qr);
          console.log('[WA] ✅ QR CODE GERADO E ENVIADO PARA O FRONTEND');
          return;
        }

        if (connection === 'open') {
          this.status = 'ready';
          this.qrCode = null;
          this.connectedSince = new Date().toISOString();
          this.reconnectAttempts = 0;
          this.phone = this.sock.user?.id?.split(':')[0] || null;

          console.log(`[WA] 🎉 CONECTADO COM SUCESSO! Número: ${this.phone}`);
          this.emit('authenticated');
          this.emit('ready');
        }

        if (connection === 'close') {
          const statusCode = lastDisconnect?.error?.output?.statusCode;
          console.warn(`[WA] Conexão fechada | Código: ${statusCode}`);

          this.status = 'disconnected';
          this.sock = null;
          this.emit('disconnected');

          if (statusCode === DisconnectReason.restartRequired) {
            console.log('[WA] Restart required → reconectando...');
            setTimeout(() => this.initialize(this.ownerId), 3000);
          } else if (statusCode !== DisconnectReason.loggedOut && this.reconnectAttempts < 5) {
            this.reconnectAttempts++;
            setTimeout(() => this.initialize(this.ownerId), 8000);
          }
        }
      });

    } catch (err) {
      console.error('[WA] ❌ ERRO CRÍTICO NA INICIALIZAÇÃO:', err.message);
      console.error(err);
      this.status = 'disconnected';
      this.emit('disconnected', 'init_error');
    } finally {
      this.isInitializing = false;
    }
  }

  isReallyConnected() {
    return !!(this.sock && this.sock.ws?.readyState === 1 && this.status === 'ready');
  }

  // ... (mantenha os métodos sendMessage, getGroups, getStatus e logout iguais à versão anterior)
  async sendMessage(chatId, text, imageUrl = null) {
    if (!this.isReallyConnected()) {
      throw new Error('WhatsApp não está conectado. Vá em Configurações e escaneie o QR Code.');
    }
    // (coloque aqui o código de envio que você já tem)
  }

  // ... resto dos métodos
}

module.exports = new WhatsAppManager();
