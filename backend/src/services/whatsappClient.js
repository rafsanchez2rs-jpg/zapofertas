const EventEmitter = require('events');
const path = require('path');
const fs = require('fs');
 main
    }

    this.isInitializing = false;
  }

      throw new Error('WhatsApp não está conectado');
    }
    try {
      if (imageUrl) {
        try {
      await new Promise((r) => setTimeout(r, 2000));
      return { success: true };
    } catch (err) {
      return { success: false, error: err.message };
    }
  }

  async getGroups() {
    if (this.status !== 'ready' || !this.sock) {
      throw new Error('WhatsApp não está conectado');
    }
    try {
      throw err;
    }
  }

  getStatus() {
    return {
      status:            this.status,
      phone:             this.phone,
      reconnectAttempts: this.reconnectAttempts,
      connectedSince:    this.connectedSince,
    } catch { /* ignore */ }
    this.status         = 'disconnected';
    this.connectedSince = null;
    this.phone          = null;
    this.qrCode         = null;
    this.emit('disconnected', 'LOGOUT');
  }
}

module.exports = new WhatsAppManager();
