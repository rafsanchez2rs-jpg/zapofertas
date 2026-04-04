const { Client, LocalAuth } = require('whatsapp-web.js');
const EventEmitter = require('events');
const path = require('path');

const SESSION_DIR = path.join(__dirname, '../../data/sessions');

class WhatsAppManager extends EventEmitter {
  constructor() {
    super();
    this.status           = 'disconnected';
    this.qrCode           = null;
    this.phone            = null;
    this.connectedSince   = null;
    this.reconnectAttempts = 0;
    this.isInitializing   = false;
    this.client           = null;
  }

  async initialize() {
    if (this.isInitializing) return;
    if (this.status === 'ready') return;

    this.isInitializing = true;
    this.status = 'connecting';

    this.client = new Client({
      authStrategy: new LocalAuth({ dataPath: SESSION_DIR }),
      puppeteer: {
        executablePath: process.env.PUPPETEER_EXECUTABLE_PATH || '/usr/bin/chromium',
        args: [
          '--no-sandbox',
          '--disable-setuid-sandbox',
          '--disable-dev-shm-usage',
          '--disable-accelerated-2d-canvas',
          '--no-first-run',
          '--no-zygote',
          '--single-process',
          '--disable-gpu',
        ],
      },
    });

    this.client.on('qr', (qr) => {
      this.qrCode  = qr;
      this.status  = 'qr';
      this.emit('qr', qr);
      console.log('[WA] QR Code gerado — aguardando escaneamento...');
    });

    this.client.on('authenticated', () => {
      this.status = 'connecting';
      this.emit('authenticated');
      console.log('[WA] Autenticado');
    });

    this.client.on('ready', async () => {
      this.status         = 'ready';
      this.qrCode         = null;
      this.connectedSince = new Date().toISOString();
      this.reconnectAttempts = 0;
      try {
        const info = this.client.info;
        this.phone = info?.wid?.user || null;
      } catch { /* não crítico */ }
      this.emit('ready');
      console.log(`[WA] Conectado! Número: ${this.phone}`);
    });

    this.client.on('auth_failure', (msg) => {
      this.status = 'disconnected';
      this.emit('auth_failure', msg);
      console.error('[WA] Falha de autenticação:', msg);
    });

    this.client.on('disconnected', async (reason) => {
      this.status         = 'disconnected';
      this.qrCode         = null;
      this.connectedSince = null;
      this.phone          = null;
      this.emit('disconnected', reason);
      console.warn('[WA] Desconectado:', reason);

      if (this.reconnectAttempts < 5) {
        this.reconnectAttempts++;
        console.log(`[WA] Reconectando (tentativa ${this.reconnectAttempts}/5)...`);
        setTimeout(() => {
          this.isInitializing = false;
          this.client = null;
          this.initialize();
        }, 10000);
      } else {
        this.emit('max_reconnect_reached', { message: 'Máximo de tentativas de reconexão atingido' });
      }
    });

    try {
      await this.client.initialize();
    } catch (err) {
      console.error('[WA] Erro ao inicializar cliente:', err.message);
      this.status = 'disconnected';
      this.emit('disconnected', 'init_error');
    }

    this.isInitializing = false;
  }

  async sendMessage(chatId, text, imageUrl = null) {
    if (this.status !== 'ready') {
      throw new Error('WhatsApp não está conectado');
    }
    try {
      if (imageUrl) {
        const { MessageMedia } = require('whatsapp-web.js');
        try {
          const media = await MessageMedia.fromUrl(imageUrl, { unsafeMime: true });
          await this.client.sendMessage(chatId, media, { caption: text });
        } catch {
          await this.client.sendMessage(chatId, text);
        }
      } else {
        await this.client.sendMessage(chatId, text);
      }
      await new Promise((r) => setTimeout(r, 2000));
      return { success: true };
    } catch (err) {
      console.error(`[WA] Erro ao enviar para ${chatId}:`, err.message);
      return { success: false, error: err.message };
    }
  }

  async getGroups() {
    if (this.status !== 'ready') throw new Error('WhatsApp não está conectado');
    try {
      const chats = await this.client.getChats();
      return chats
        .filter((c) => c.isGroup)
        .map((g) => ({
          id:           g.id._serialized,
          name:         g.name || 'Sem nome',
          participants: g.participants?.length || 0,
        }));
    } catch (err) {
      console.error('[WA] Erro ao buscar grupos:', err.message);
      throw err;
    }
  }

  getStatus() {
    return {
      status:           this.status,
      phone:            this.phone,
      reconnectAttempts: this.reconnectAttempts,
      connectedSince:   this.connectedSince,
      rateLimitedUntil: null,
    };
  }

  async logout() {
    try {
      if (this.client) await this.client.logout();
    } catch { /* ignore */ }
    this.status         = 'disconnected';
    this.connectedSince = null;
    this.phone          = null;
    this.qrCode         = null;
    this.reconnectAttempts = 0;
    this.client         = null;
    this.isInitializing = false;
    this.emit('disconnected', 'LOGOUT');
  }
}

module.exports = new WhatsAppManager();

