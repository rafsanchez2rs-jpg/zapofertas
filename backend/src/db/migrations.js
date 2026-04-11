const { getDb } = require('./database');
const bcrypt = require('bcrypt');

async function runMigrations() {
  const pool = getDb();

  await pool.query(`
    CREATE TABLE IF NOT EXISTS users (
      id SERIAL PRIMARY KEY,
      email TEXT UNIQUE NOT NULL,
      password TEXT NOT NULL,
      name TEXT DEFAULT '',
      plan TEXT NOT NULL DEFAULT 'free',
      role TEXT NOT NULL DEFAULT 'user',
      active INTEGER NOT NULL DEFAULT 1,
      daily_sends INTEGER NOT NULL DEFAULT 0,
      last_send_date TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS collections (
      id SERIAL PRIMARY KEY,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      name TEXT NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS groups (
      id SERIAL PRIMARY KEY,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      wa_group_id TEXT NOT NULL,
      name TEXT NOT NULL,
      active INTEGER NOT NULL DEFAULT 0,
      collection_id INTEGER REFERENCES collections(id) ON DELETE SET NULL,
      participant_count INTEGER DEFAULT 0,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE(user_id, wa_group_id)
    )
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS campaigns (
      id SERIAL PRIMARY KEY,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      product_name TEXT NOT NULL,
      platform TEXT NOT NULL,
      original_price REAL,
      sale_price REAL,
      pix_price REAL,
      discount_percent REAL,
      coupon_value REAL,
      coupon_type TEXT DEFAULT 'fixed',
      coupon_link TEXT,
      coupon_code TEXT,
      image_url TEXT,
      product_url TEXT NOT NULL,
      message TEXT NOT NULL,
      has_headline INTEGER DEFAULT 0,
      headline TEXT,
      status TEXT NOT NULL DEFAULT 'pending',
      scheduled_at TIMESTAMPTZ,
      fired_at TIMESTAMPTZ,
      sent_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS campaign_groups (
      id SERIAL PRIMARY KEY,
      campaign_id INTEGER NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
      group_id INTEGER NOT NULL REFERENCES groups(id) ON DELETE CASCADE,
      wa_group_id TEXT NOT NULL,
      group_name TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'pending',
      sent_at TIMESTAMPTZ,
      error_message TEXT
    )
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS settings (
      id SERIAL PRIMARY KEY,
      user_id INTEGER UNIQUE NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      delay_between_sends INTEGER NOT NULL DEFAULT 3000,
      send_image INTEGER NOT NULL DEFAULT 1,
      auto_reconnect INTEGER NOT NULL DEFAULT 1,
      coupon_default_link TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS refresh_tokens (
      id SERIAL PRIMARY KEY,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      token TEXT UNIQUE NOT NULL,
      expires_at TIMESTAMPTZ NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS dashboard_reset (
      user_id INTEGER PRIMARY KEY,
      reset_at TIMESTAMPTZ
    )
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS invites (
      id SERIAL PRIMARY KEY,
      token TEXT UNIQUE NOT NULL,
      plan TEXT NOT NULL DEFAULT 'pro',
      created_by INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      used_by INTEGER REFERENCES users(id),
      used_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ DEFAULT NOW()
    )
  `);

  // Seed admin users
  const admins = [
    { email: 'pati_martel@hotmail.com', name: 'Patricia MARTEL' },
    { email: 'rafsanchez2@hotmail.com', name: 'Rafael' },
  ];

  for (const admin of admins) {
    const { rows } = await pool.query('SELECT id FROM users WHERE email = $1', [admin.email]);
    if (rows[0]) {
      await pool.query('UPDATE users SET role = $1, plan = $2 WHERE email = $3', ['admin', 'pro', admin.email]);
    } else {
      const hashed = await bcrypt.hash('Admin@123', 12);
      const { rows: inserted } = await pool.query(
        'INSERT INTO users (email, password, name, plan, role, active) VALUES ($1, $2, $3, $4, $5, $6) RETURNING id',
        [admin.email, hashed, admin.name, 'pro', 'admin', 1]
      );
      await pool.query(
        'INSERT INTO settings (user_id) VALUES ($1) ON CONFLICT (user_id) DO NOTHING',
        [inserted[0].id]
      );
      console.log(`[Admin] Criado: ${admin.email}`);
    }
  }

  // Grupos: muda default de active para 0 (usuário ativa manualmente)
  await pool.query(`
    ALTER TABLE groups ALTER COLUMN active SET DEFAULT 0
  `).catch(() => {}); // ignora se já estiver correto

  // Tabela para sessão Baileys (substitui Evolution API)
  await pool.query(`
    CREATE TABLE IF NOT EXISTS whatsapp_sessions (
      session_id VARCHAR(100) NOT NULL,
      data_key   VARCHAR(255) NOT NULL,
      data       TEXT NOT NULL,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      PRIMARY KEY (session_id, data_key)
    )
  `);

  console.log('[DB] Migrations executadas com sucesso');
}

module.exports = { runMigrations };
