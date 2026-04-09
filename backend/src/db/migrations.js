const { getDb } = require('./database');
const bcrypt = require('bcrypt');

function runMigrations() {
  const db = getDb();

  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      email TEXT UNIQUE NOT NULL,
      password TEXT NOT NULL,
      name TEXT,
      plan TEXT NOT NULL DEFAULT 'free',
      daily_sends INTEGER NOT NULL DEFAULT 0,
      last_send_date TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS collections (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      name TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS groups (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      wa_group_id TEXT NOT NULL,
      name TEXT NOT NULL,
      active INTEGER NOT NULL DEFAULT 1,
      collection_id INTEGER,
      participant_count INTEGER DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
      FOREIGN KEY (collection_id) REFERENCES collections(id) ON DELETE SET NULL,
      UNIQUE(user_id, wa_group_id)
    );

    CREATE TABLE IF NOT EXISTS campaigns (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      product_name TEXT NOT NULL,
      platform TEXT NOT NULL,
      original_price REAL,
      sale_price REAL,
      pix_price REAL,
      discount_percent REAL,
      coupon_value REAL,
      image_url TEXT,
      product_url TEXT NOT NULL,
      message TEXT NOT NULL,
      has_headline INTEGER DEFAULT 0,
      headline TEXT,
      status TEXT NOT NULL DEFAULT 'pending',
      scheduled_at TEXT,
      sent_at TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS campaign_groups (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      campaign_id INTEGER NOT NULL,
      group_id INTEGER NOT NULL,
      wa_group_id TEXT NOT NULL,
      group_name TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'pending',
      sent_at TEXT,
      error_message TEXT,
      FOREIGN KEY (campaign_id) REFERENCES campaigns(id) ON DELETE CASCADE,
      FOREIGN KEY (group_id) REFERENCES groups(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS settings (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER UNIQUE NOT NULL,
      delay_between_sends INTEGER NOT NULL DEFAULT 3000,
      send_image INTEGER NOT NULL DEFAULT 1,
      auto_reconnect INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS refresh_tokens (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      token TEXT UNIQUE NOT NULL,
      expires_at TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    );
  `);

  // Tabela de reset de métricas do dashboard
  db.exec(`
    CREATE TABLE IF NOT EXISTS dashboard_reset (
      user_id INTEGER PRIMARY KEY,
      reset_at DATETIME
    );
  `);

  // Tabela de convites
  db.exec(`
    CREATE TABLE IF NOT EXISTS invites (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      token TEXT UNIQUE NOT NULL,
      plan TEXT NOT NULL DEFAULT 'pro',
      created_by INTEGER NOT NULL,
      used_by INTEGER,
      used_at DATETIME,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE CASCADE
    );
  `);

  // Migrations incrementais (ALTER TABLE é seguro via try/catch no SQLite)
  const alterations = [
    `ALTER TABLE campaigns ADD COLUMN coupon_type TEXT DEFAULT 'fixed'`,
    `ALTER TABLE campaigns ADD COLUMN coupon_link TEXT`,
    `ALTER TABLE campaigns ADD COLUMN coupon_code TEXT`,
    `ALTER TABLE settings ADD COLUMN coupon_default_link TEXT`,
    `ALTER TABLE users ADD COLUMN role TEXT NOT NULL DEFAULT 'user'`,
    `ALTER TABLE users ADD COLUMN active INTEGER NOT NULL DEFAULT 1`,
    `ALTER TABLE campaigns ADD COLUMN scheduled_at DATETIME`,
    `ALTER TABLE campaigns ADD COLUMN fired_at DATETIME`,
  ];
  for (const sql of alterations) {
    try { db.exec(sql); } catch { /* coluna já existe */ }
  }

  // Garantir admins fixos por email — atualizar se existir, ignorar se não existir ainda
  const admins = [
    { email: 'pati_martel@hotmail.com', name: 'Patricia MARTEL' },
    { email: 'rafsanchez2@hotmail.com', name: 'Rafael' },
  ];

  for (const admin of admins) {
    const existing = db.prepare('SELECT id FROM users WHERE email = ?').get(admin.email);
    if (existing) {
      db.prepare('UPDATE users SET role = ?, plan = ? WHERE email = ?').run('admin', 'pro', admin.email);
    } else {
      // Criar admin com senha padrão se não existe
      const defaultPassword = admin.email === 'pati_martel@hotmail.com' ? 'Admin@123' : 'Admin@123';
      const hashedPassword = bcrypt.hashSync(defaultPassword, 12);
      const result = db.prepare(
        'INSERT INTO users (email, password, name, plan, role, active) VALUES (?, ?, ?, ?, ?, ?)'
      ).run(admin.email, hashedPassword, admin.name, 'pro', 'admin', 1);
      db.prepare('INSERT INTO settings (user_id) VALUES (?)').run(result.lastInsertRowid);
      console.log(`[Admin] Criado admin: ${admin.email}`);
    }
  }

  const rafael = db.prepare(`SELECT role FROM users WHERE email = 'rafsanchez2@hotmail.com'`).get();
  console.log('[Admin] Rafael role:', rafael?.role ?? 'usuário não criado ainda');

  console.log('[DB] Migrations executed successfully');
}

module.exports = { runMigrations };
