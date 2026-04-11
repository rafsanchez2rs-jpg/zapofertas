/**
 * Gerenciador de sessões WhatsApp por usuário
 * Cada usuário tem sua própria instância Baileys e sessão separada no PostgreSQL
 */
const WhatsAppManager = require('./whatsappClient');

// Map de userId (number) → WhatsAppManager
const sessions = new Map();

/**
 * Retorna (ou cria) a sessão WhatsApp do usuário
 */
function getSession(userId) {
  if (!sessions.has(userId)) {
    const sessionId = `user_${userId}`;
    sessions.set(userId, new WhatsAppManager(sessionId));
  }
  return sessions.get(userId);
}

/**
 * Remove e desconecta a sessão do usuário (ex: ao fazer logout)
 */
async function destroySession(userId) {
  const session = sessions.get(userId);
  if (session) {
    try { await session.logout(); } catch { /* ignore */ }
    sessions.delete(userId);
  }
}

module.exports = { getSession, destroySession };
