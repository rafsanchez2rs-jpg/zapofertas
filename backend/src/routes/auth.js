cconst express = require('express');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const { v4: uuidv4 } = require('uuid');
const { getDb } = require('../db/database');

const router = express.Router();

const JWT_SECRET = process.env.JWT_SECRET || 'dev_secret';
const ACCESS_EXPIRES = '30d';

function generateToken(userId) {
  return jwt.sign({ userId }, JWT_SECRET, { expiresIn: ACCESS_EXPIRES });
}

// ─────────────────────────────────────────────
// SETUP (cria admin se não existir)
// ─────────────────────────────────────────────
router.post('/setup', async (req, res) => {
  try {
    const db = getDb();

    const countResult = await db.query('SELECT COUNT(*) FROM users');
    const count = parseInt(countResult.rows[0].count);

    if (count > 0) {
      return res.status(400).json({ error: 'Setup já realizado' });
    }

    const { email, password, name } = req.body;

    const hashedPassword = await bcrypt.hash(password, 10);

    const result = await db.query(
      `INSERT INTO users (email, password, name, role)
       VALUES ($1, $2, $3, $4)
       RETURNING *`,
      [email.toLowerCase(), hashedPassword, name || '', 'admin']
    );

    const user = result.rows[0];

    const token = generateToken(user.id);

    res.json({
      token,
      user,
    });
  } catch (err) {
    console.error('Setup error:', err);
    res.status(500).json({ error: 'Erro no setup' });
  }
});

// ─────────────────────────────────────────────
// REGISTER
// ─────────────────────────────────────────────
router.post('/register', async (req, res) => {
  try {
    const db = getDb();
    const { email, password, name } = req.body;

    const existing = await db.query(
      'SELECT id FROM users WHERE email = $1',
      [email.toLowerCase()]
    );

    if (existing.rows.length > 0) {
      return res.status(400).json({ error: 'Email já cadastrado' });
    }

    const hashedPassword = await bcrypt.hash(password, 10);

    const result = await db.query(
      `INSERT INTO users (email, password, name)
       VALUES ($1, $2, $3)
       RETURNING *`,
      [email.toLowerCase(), hashedPassword, name || '']
    );

    const user = result.rows[0];

    const token = generateToken(user.id);

    res.json({
      token,
      user,
    });
  } catch (err) {
    console.error('Register error:', err);
    res.status(500).json({ error: 'Erro no registro' });
  }
});

// ─────────────────────────────────────────────
// LOGIN
// ─────────────────────────────────────────────
router.post('/login', async (req, res) => {
  try {
    const db = getDb();
    const { email, password } = req.body;

    const result = await db.query(
      'SELECT * FROM users WHERE email = $1',
      [email.toLowerCase()]
    );

    const user = result.rows[0];

    if (!user) {
      return res.status(401).json({ error: 'Credenciais inválidas' });
    }

    const valid = await bcrypt.compare(password, user.password);

    if (!valid) {
      return res.status(401).json({ error: 'Credenciais inválidas' });
    }

    const token = generateToken(user.id);

    res.json({
      token,
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.role,
      },
    });
  } catch (err) {
    console.error('Login error:', err);
    res.status(500).json({ error: 'Erro no login' });
  }
});

// ─────────────────────────────────────────────
// ME
// ─────────────────────────────────────────────
router.get('/me', async (req, res) => {
  try {
    const authHeader = req.headers.authorization;

    if (!authHeader?.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'Token obrigatório' });
    }

    const token = authHeader.split(' ')[1];
    const payload = jwt.verify(token, JWT_SECRET);

    const db = getDb();

    const result = await db.query(
      'SELECT id, email, name, role FROM users WHERE id = $1',
      [payload.userId]
    );

    const user = result.rows[0];

    if (!user) {
      return res.status(404).json({ error: 'Usuário não encontrado' });
    }

    res.json({ user });
  } catch (err) {
    res.status(401).json({ error: 'Token inválido' });
  }
});

module.exports = router;
