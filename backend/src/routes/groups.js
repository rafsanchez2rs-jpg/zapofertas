const express = require('express');
const { getDb } = require('../db/database');
const { authenticate } = require('../middleware/auth');
const waManager = require('../services/whatsappClient');

const router = express.Router();

// GET /api/groups/wa-status
router.get('/wa-status', authenticate, (req, res) => {
  res.json(waManager.getStatus());
});

// GET /api/groups
router.get('/', authenticate, async (req, res) => {
  try {
    const pool = getDb();
    const { rows: groups } = await pool.query(`
      SELECT g.*, c.name as collection_name
      FROM groups g
      LEFT JOIN collections c ON g.collection_id = c.id
      WHERE g.user_id = $1
      ORDER BY g.name ASC
    `, [req.user.id]);
    res.json({ groups });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/groups/wa-sync
router.get('/wa-sync', authenticate, async (req, res) => {
  try {
    const waGroups = await waManager.getGroups();
    const pool = getDb();

    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      for (const g of waGroups) {
        await client.query(`
          INSERT INTO groups (user_id, wa_group_id, name, participant_count)
          VALUES ($1, $2, $3, $4)
          ON CONFLICT(user_id, wa_group_id) DO UPDATE SET
            name = EXCLUDED.name,
            participant_count = EXCLUDED.participant_count,
            updated_at = NOW()
        `, [req.user.id, g.id, g.name, g.participantCount || 0]);
      }
      await client.query('COMMIT');
    } catch (e) {
      await client.query('ROLLBACK');
      throw e;
    } finally {
      client.release();
    }

    const { rows: groups } = await pool.query(`
      SELECT g.*, c.name as collection_name
      FROM groups g
      LEFT JOIN collections c ON g.collection_id = c.id
      WHERE g.user_id = $1
      ORDER BY g.name ASC
    `, [req.user.id]);

    res.json({ groups, synced: waGroups.length });
  } catch (err) {
    console.error('[Groups] WA sync error:', err.message);
    const isConnectError = err.message?.includes('conectado') || err.message?.includes('Tempo esgotado');
    res.status(isConnectError ? 400 : 500).json({ error: err.message || 'Erro ao sincronizar grupos' });
  }
});

// PUT /api/groups/:id
router.put('/:id', authenticate, async (req, res) => {
  try {
    const pool = getDb();
    const { rows } = await pool.query(
      'SELECT * FROM groups WHERE id = $1 AND user_id = $2',
      [req.params.id, req.user.id]
    );
    if (!rows[0]) return res.status(404).json({ error: 'Grupo não encontrado' });

    const { active, collection_id, name } = req.body;
    await pool.query(`
      UPDATE groups SET
        active = COALESCE($1, active),
        collection_id = COALESCE($2, collection_id),
        name = COALESCE($3, name),
        updated_at = NOW()
      WHERE id = $4 AND user_id = $5
    `, [
      active !== undefined ? (active ? 1 : 0) : null,
      collection_id !== undefined ? collection_id : null,
      name || null,
      req.params.id,
      req.user.id,
    ]);

    const { rows: updated } = await pool.query('SELECT * FROM groups WHERE id = $1', [req.params.id]);
    res.json({ group: updated[0] });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE /api/groups/:id
router.delete('/:id', authenticate, async (req, res) => {
  try {
    const pool = getDb();
    const { rows } = await pool.query(
      'SELECT id FROM groups WHERE id = $1 AND user_id = $2',
      [req.params.id, req.user.id]
    );
    if (!rows[0]) return res.status(404).json({ error: 'Grupo não encontrado' });
    await pool.query('DELETE FROM groups WHERE id = $1', [req.params.id]);
    res.json({ message: 'Grupo removido' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/groups/collections
router.get('/collections', authenticate, async (req, res) => {
  try {
    const pool = getDb();
    const { rows: collections } = await pool.query(
      'SELECT * FROM collections WHERE user_id = $1 ORDER BY name',
      [req.user.id]
    );
    res.json({ collections });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/groups/collections
router.post('/collections', authenticate, async (req, res) => {
  try {
    const { name } = req.body;
    if (!name) return res.status(400).json({ error: 'Nome é obrigatório' });
    const pool = getDb();
    const { rows } = await pool.query(
      'INSERT INTO collections (user_id, name) VALUES ($1, $2) RETURNING id',
      [req.user.id, name]
    );
    res.status(201).json({ collection: { id: rows[0].id, user_id: req.user.id, name } });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE /api/groups/collections/:id
router.delete('/collections/:id', authenticate, async (req, res) => {
  try {
    const pool = getDb();
    await pool.query('DELETE FROM collections WHERE id = $1 AND user_id = $2', [req.params.id, req.user.id]);
    res.json({ message: 'Coleção removida' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
