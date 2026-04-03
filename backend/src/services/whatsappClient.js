const EventEmitter = require('events');
const path = require('path');
const fs = require('fs');
const axios = require('axios');

// ── Config ────────────────────────────────────────────────────────────────────
const EVO_URL      = process.env.EVOLUTION_API_URL  || 'http://localhost:8080';
const EVO_KEY      = process.env.EVOLUTION_API_KEY  || 'zapofertas123';
const INSTANCE     = process.env.EVOLUTION_INSTANCE || 'zapofertas';
const POLL_MS      = 4000; // intervalo de polling para estado de conexão

// ── Axios client para Evolution API ──────────────────────────────────────────
const evo = axios.create({
  baseURL: EVO_URL,
  headers:  { apikey: EVO_KEY },
  timeout:  15000,
});

// ── File logger ───────────────────────────────────────────────────────────────
const LOG_DIR  = path.join(__dirname, '../../logs');
const LOG_FILE = path.join(LOG_DIR, 'whatsapp.log');
if (!fs.existsSync(LOG_DIR)) fs.mkdirSync(LOG_DIR, { recursive: true });

function logToFile(level, message) {
  const line = `[${new Date().toISOString()}] [${level}] ${message}\n`;
  try { fs.appendFileSync(LOG_FILE, line); } catch { /* ignore */ }
}
function log(msg)   { console.log(msg);   logToFile('INFO',  msg); }
function warn(msg)  { console.warn(msg);  logToFile('WARN',  msg); }
function error(msg) { console.error(msg); logToFile('ERROR', msg); }

// ── WhatsAppManager via Evolution API ────────────────────────────────────────
class WhatsAppManager extends EventEmitter {
  constructor() {
    super();
    this.status           = 'disconnected';
    this.qrCode           = null; // raw QR string (para conversão em base64 no server.js)
    this.phone            = null;
    this.connectedSince   = null;
    this.reconnectAttempts = 0;
    this.isInitializing   = false;
    this._pollTimer       = null;
    this._lastQrCode      = null;
  }

  // ── Garante que a instância existe na Evolution API ───────────────────────
  async _ensureInstance() {
    try {
      const { data } = await evo.get('/instance/fetchInstances');
      const list = Array.isArray(data) ? data : [];
      // v2.x retorna { name, ... } no nível raiz
      const found = list.find((i) => (i.name || i.instanceName || i.instance?.instanceName) === INSTANCE);
      if (!found) {
        await evo.post('/instance/create', {
          instanceName: INSTANCE,
          integration:  'WHATSAPP-BAILEYS',
        });
        log(`[EVO] Instância "${INSTANCE}" criada`);
      }
    } catch (err) {
      throw new Error(`Falha ao verificar instância: ${err.message}`);
    }
  }

  // ── Retorna estado de conexão da instância ('open' | 'close' | 'connecting')
  async _getConnectionState() {
    try {
      const { data } = await evo.get(`/instance/connectionState/${INSTANCE}`);
      return data?.instance?.state || 'close';
    } catch {
      return 'close';
    }
  }

  // ── Busca QR Code da Evolution API ────────────────────────────────────────
  async _fetchQr() {
    try {
      const { data } = await evo.get(`/instance/connect/${INSTANCE}`);
      // Evolution API retorna o QR como string raw em `code` e base64 em `base64`
      return data?.code || null;
    } catch {
      return null;
    }
  }

  // ── Inicia polling para detectar quando conectar / novo QR ────────────────
  _startPolling() {
    this._stopPolling();
    this._pollTimer = setInterval(async () => {
      const state = await this._getConnectionState();

      if (state === 'open') {
        this._stopPolling();
        await this._setReady();
        return;
      }

      // Atualiza QR se mudou
      if (this.status === 'qr' || this.status === 'connecting') {
        const newQr = await this._fetchQr();
        if (newQr && newQr !== this._lastQrCode) {
          this._lastQrCode = newQr;
          this.qrCode      = newQr;
          this.status      = 'qr';
          this.emit('qr', newQr);
          log('[EVO] QR Code atualizado');
        }
      }
    }, POLL_MS);
  }

  _stopPolling() {
    if (this._pollTimer) {
      clearInterval(this._pollTimer);
      this._pollTimer = null;
    }
  }

  // ── Marca como pronto e emite evento ─────────────────────────────────────
  async _setReady() {
    this.status        = 'ready';
    this.qrCode        = null;
    this._lastQrCode   = null;
    this.connectedSince = new Date().toISOString();
    this.reconnectAttempts = 0;

    // Busca número conectado
    try {
      const { data } = await evo.get('/instance/fetchInstances');
      const list = Array.isArray(data) ? data : [];
      const inst = list.find((i) => (i.name || i.instanceName || i.instance?.instanceName) === INSTANCE);
      this.phone = inst?.ownerJid?.split('@')[0] || inst?.number || inst?.instance?.owner?.split('@')[0] || null;
    } catch { /* não crítico */ }

    this.emit('authenticated');
    this.emit('ready');
    log(`[EVO] Conectado! Número: ${this.phone}`);
  }

  // ── initialize() — mantém mesma assinatura do whatsapp-web.js ────────────
  async initialize() {
    if (this.isInitializing) return;
    if (this.status === 'ready') return;
    if (this.status === 'qr' && this._pollTimer) return;

    this.isInitializing = true;
    this.status = 'connecting';

    try {
      await this._ensureInstance();

      const state = await this._getConnectionState();
      if (state === 'open') {
        await this._setReady();
        this.isInitializing = false;
        return;
      }

      // Já conectando ou aguardando QR
      const qrCode = await this._fetchQr();
      if (qrCode) {
        this._lastQrCode = qrCode;
        this.qrCode = qrCode;
        this.status = 'qr';
        this.emit('qr', qrCode);
        log('[EVO] QR Code obtido — aguardando escaneamento...');
      }

      this._startPolling();
    } catch (err) {
      error(`[EVO] Erro ao inicializar: ${err.message}`);
      this.status = 'disconnected';
      this.emit('disconnected', 'init_error');
    }

    this.isInitializing = false;
  }

  // ── Envio de mensagem ─────────────────────────────────────────────────────
  async sendMessage(chatId, text, imageUrl = null) {
    if (this.status !== 'ready') {
      throw new Error('WhatsApp não está conectado');
    }

    try {
      if (imageUrl) {
        try {
          await evo.post(`/message/sendMedia/${INSTANCE}`, {
            number:    chatId,
            mediatype: 'image',
            media:     imageUrl,
            caption:   text,
          });
        } catch {
          // Se falhar com imagem, envia só texto
          log('[EVO] Falha ao enviar imagem — enviando só texto');
          await evo.post(`/message/sendText/${INSTANCE}`, {
            number: chatId,
            text,
          });
        }
      } else {
        await evo.post(`/message/sendText/${INSTANCE}`, {
          number: chatId,
          text,
        });
      }

      // Pausa pós-envio para reduzir pressão
      await new Promise((r) => setTimeout(r, 2000));
      return { success: true };

    } catch (err) {
      error(`[EVO] Erro ao enviar para ${chatId}: ${err.message}`);
      return { success: false, error: err.message };
    }
  }

  // ── Buscar grupos ─────────────────────────────────────────────────────────
  async getGroups() {
    if (this.status !== 'ready') throw new Error('WhatsApp não está conectado');
    try {
      const { data } = await evo.get(
        `/group/fetchAllGroups/${INSTANCE}?getParticipants=false`
      );
      return (Array.isArray(data) ? data : []).map((g) => ({
        id:           g.id,
        name:         g.subject || g.name || 'Sem nome',
        participants: g.size || g.participants?.length || 0,
      }));
    } catch (err) {
      error(`[EVO] Erro ao buscar grupos: ${err.message}`);
      throw err;
    }
  }

  // ── Status público — mesma interface do whatsapp-web.js ──────────────────
  getStatus() {
    return {
      status:            this.status,
      phone:             this.phone,
      reconnectAttempts: this.reconnectAttempts,
      connectedSince:    this.connectedSince,
      rateLimitedUntil:  null, // Evolution API não usa este mecanismo
    };
  }

  // ── Logout ────────────────────────────────────────────────────────────────
  async logout() {
    this._stopPolling();
    try {
      await evo.delete(`/instance/logout/${INSTANCE}`);
    } catch { /* ignore */ }
    this.status         = 'disconnected';
    this.connectedSince = null;
    this.phone          = null;
    this.qrCode         = null;
    this._lastQrCode    = null;
    this.reconnectAttempts = 0;
    this.emit('disconnected', 'LOGOUT');
  }
}

module.exports = new WhatsAppManager();
