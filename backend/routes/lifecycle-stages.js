// ============================================================================
// routes/lifecycle-stages.js — справочник этапов ЖЦ
// Простой read-only маршрут: фронтенду нужно знать список этапов для UI.
// ============================================================================

const express = require('express');
const db = require('../database');

const router = express.Router();

router.get('/', (req, res) => {
  try {
    const stages = db
      .prepare('SELECT id, name, color FROM lifecycle_stages ORDER BY order_num')
      .all();
    res.json(stages);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
