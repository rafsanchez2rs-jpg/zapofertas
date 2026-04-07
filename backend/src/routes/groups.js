const express = require('express');
const { getDb } = require('../db/database');
const { authenticate } = require('../middleware/auth');
const waManager = require('../services/whatsappClient');

const router = express.Router();

// GET /api/groups/wa-status — lightweight WhatsApp connection status for polling
router.get('/wa-status', authenticate, (req, res) => {
  const isAdmin = req.user.role === 'admin';
  res.json(waManager.getStatus(req.user.id, isAdmin));
});

// GET /api/groups — list saved groups
router.get('/', authenticate, (req, res) => {
  const db = getDb();
  const groups = db
    .prepare(`
      SELECT g.*, c.name as collection_name
      FROM groups g
      LEFT JOIN collections c ON g.collection_id = c.id
      WHERE g.user_id = ?
      ORDER BY g.name ASC
    `)
    .all(req.user.id);

  res.json({ groups });
});

// GET /api/groups/wa-sync — sync groups from WhatsApp and return
router.get('/wa-sync', authenticate, async (req, res) => {
  try {
    const waGroups = await waManager.getGroups();
    const db = getDb();

    // Upsert each group
    const upsert = db.prepare(`
      INSERT INTO groups (user_id, wa_group_id, name, participant_count, active)
      VALUES (?, ?, ?, ?, 0)
      ON CONFLICT(user_id, wa_group_id) DO UPDATE SET
        name = excluded.name,
        participant_count = excluded.participant_count,
        updated_at = datetime('now')
    `);

    const upsertMany = db.transaction((groups) => {
      for (const g of groups) {
        upsert.run(req.user.id, g.id, g.name, g.participantCount || 0);
      }
    });

    upsertMany(waGroups);

    // Return saved groups
    const groups = db
      .prepare(`
        SELECT g.*, c.name as collection_name
        FROM groups g
        LEFT JOIN collections c ON g.collection_id = c.id
        WHERE g.user_id = ?
        ORDER BY g.name ASC
      `)
      .all(req.user.id);

    res.json({ groups, synced: waGroups.length });
  } catch (err) {
    console.error('[Groups] WA sync error:', err.message);
    const isConnectError = err.message?.includes('conectado') || err.message?.includes('Tempo esgotado');
    res.status(isConnectError ? 400 : 500).json({ error: err.message || 'Erro ao sincronizar grupos' });
  }
});

// PUT /api/groups/:id — update group (active status, collection)
router.put('/:id', authenticate, (req, res) => {
  const db = getDb();
  const group = db
    .prepare('SELECT * FROM groups WHERE id = ? AND user_id = ?')
    .get(req.params.id, req.user.id);

  if (!group) return res.status(404).json({ error: 'Grupo não encontrado' });

  const { active, collection_id, name } = req.body;

  db.prepare(`
    UPDATE groups
    SET active = COALESCE(?, active),
        collection_id = COALESCE(?, collection_id),
        name = COALESCE(?, name),
        updated_at = datetime('now')
    WHERE id = ? AND user_id = ?
  `).run(
    active !== undefined ? (active ? 1 : 0) : null,
    collection_id !== undefined ? collection_id : null,
    name || null,
    req.params.id,
    req.user.id
  );

  const updated = db.prepare('SELECT * FROM groups WHERE id = ?').get(req.params.id);
  res.json({ group: updated });
});

// DELETE /api/groups/:id
router.delete('/:id', authenticate, (req, res) => {
  const db = getDb();
  const group = db
    .prepare('SELECT * FROM groups WHERE id = ? AND user_id = ?')
    .get(req.params.id, req.user.id);

  if (!group) return res.status(404).json({ error: 'Grupo não encontrado' });

  db.prepare('DELETE FROM groups WHERE id = ?').run(req.params.id);
  res.json({ message: 'Grupo removido' });
});

// --- Collections ---

// GET /api/groups/collections
router.get('/collections', authenticate, (req, res) => {
  const db = getDb();
  const collections = db
    .prepare('SELECT * FROM collections WHERE user_id = ? ORDER BY name')
    .all(req.user.id);
  res.json({ collections });
});

// POST /api/groups/collections
router.post('/collections', authenticate, (req, res) => {
  const { name } = req.body;
  if (!name) return res.status(400).json({ error: 'Nome é obrigatório' });

  const db = getDb();
  const result = db
    .prepare('INSERT INTO collections (user_id, name) VALUES (?, ?)')
    .run(req.user.id, name);

  res.status(201).json({
    collection: { id: result.lastInsertRowid, user_id: req.user.id, name },
  });
});

// DELETE /api/groups/collections/:id
router.delete('/collections/:id', authenticate, (req, res) => {
  const db = getDb();
  db.prepare('DELETE FROM collections WHERE id = ? AND user_id = ?').run(
    req.params.id,
    req.user.id
  );
  res.json({ message: 'Coleção removida' });
});

module.exports = router;
