const jwt = require('jsonwebtoken');
const { getDb } = require('../db/database');
const PLANS = require('../config/plans');

const JWT_SECRET = process.env.JWT_SECRET || 'dev_secret';

function authenticate(req, res, next) {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Token de autenticação obrigatório' });
  }

  try {
    const token = authHeader.split(' ')[1];
    const payload = jwt.verify(token, JWT_SECRET);
    const db = getDb();
    const user = db
      .prepare('SELECT id, email, name, plan, role, active, daily_sends, last_send_date FROM users WHERE id = ?')
      .get(payload.userId);

    if (!user) return res.status(401).json({ error: 'Usuário não encontrado' });
    if (!user.active) return res.status(403).json({ error: 'Conta desativada' });

    req.user = user;
    next();
  } catch (err) {
    return res.status(401).json({ error: 'Token inválido ou expirado' });
  }
}

function requireAdmin(req, res, next) {
  if (req.user?.role !== 'admin') {
    return res.status(403).json({ error: 'Acesso restrito a administradores' });
  }
  next();
}

function planLimiter(req, res, next) {
  const user = req.user;

  // admin e pro: sem limites
  if (user.plan === 'pro' || user.plan === 'admin' || user.role === 'admin') return next();

  const plan = PLANS[user.plan] || PLANS.free;

  // Reset daily counter if last send was not today
  const today = new Date().toISOString().split('T')[0];
  const effectiveSends = user.last_send_date === today ? user.daily_sends : 0;

  if (effectiveSends >= plan.maxDailyFires) {
    return res.status(429).json({
      error: `Limite diário do plano ${plan.label} atingido (${plan.maxDailyFires} disparos/dia). Faça upgrade para Pro.`,
      limitType: 'daily',
      limit: plan.maxDailyFires,
    });
  }

  const { groupIds } = req.body;
  if (groupIds && groupIds.length > plan.maxGroups) {
    return res.status(429).json({
      error: `Plano ${plan.label} permite no máximo ${plan.maxGroups} grupos por disparo. Faça upgrade para Pro.`,
      limitType: 'groups',
      limit: plan.maxGroups,
    });
  }

  next();
}

module.exports = { authenticate, requireAdmin, planLimiter };
