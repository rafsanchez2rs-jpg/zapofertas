/**
 * PostgreSQL auth state para Baileys
 * Substitui useMultiFileAuthState (sistema de arquivos) por PostgreSQL
 * A sessão sobrevive a restarts/cold starts — QR escaneado só uma vez
 */
const { initAuthCreds, BufferJSON } = require('@whiskeysockets/baileys');

async function usePostgresAuthState(pool, sessionId = 'zapofertas') {
  async function readData(key) {
    try {
      const { rows } = await pool.query(
        'SELECT data FROM whatsapp_sessions WHERE session_id = $1 AND data_key = $2',
        [sessionId, key]
      );
      if (!rows.length) return null;
      return JSON.parse(rows[0].data, BufferJSON.reviver);
    } catch {
      return null;
    }
  }

  async function writeData(key, value) {
    const serialized = JSON.stringify(value, BufferJSON.replacer);
    await pool.query(
      `INSERT INTO whatsapp_sessions (session_id, data_key, data, updated_at)
       VALUES ($1, $2, $3, NOW())
       ON CONFLICT (session_id, data_key) DO UPDATE SET data = $3, updated_at = NOW()`,
      [sessionId, key, serialized]
    );
  }

  async function removeData(key) {
    await pool.query(
      'DELETE FROM whatsapp_sessions WHERE session_id = $1 AND data_key = $2',
      [sessionId, key]
    );
  }

  async function clearSession() {
    await pool.query(
      'DELETE FROM whatsapp_sessions WHERE session_id = $1',
      [sessionId]
    );
  }

  const creds = (await readData('creds')) || initAuthCreds();

  return {
    state: {
      creds,
      keys: {
        get: async (type, ids) => {
          const data = {};
          await Promise.all(
            ids.map(async (id) => {
              const val = await readData(`${type}:${id}`);
              if (val != null) data[id] = val;
            })
          );
          return data;
        },
        set: async (data) => {
          await Promise.all(
            Object.entries(data).flatMap(([type, values]) =>
              Object.entries(values).map(([id, value]) =>
                value != null
                  ? writeData(`${type}:${id}`, value)
                  : removeData(`${type}:${id}`)
              )
            )
          );
        },
      },
    },
    saveCreds: () => writeData('creds', creds),
    clearSession,
  };
}

module.exports = { usePostgresAuthState };
