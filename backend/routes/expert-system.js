// ============================================================================
// routes/expert-system.js — REST-маршруты экспертной системы
// ----------------------------------------------------------------------------
// Применение правил:
//   GET /api/products/:id/evaluate — применить правила к изделию
//
// Управление базой правил (CRUD):
//   GET    /api/expert-rules         — список всех правил
//   POST   /api/expert-rules         — создать правило
//   PUT    /api/expert-rules/:id     — изменить правило
//   DELETE /api/expert-rules/:id     — удалить правило
//   PATCH  /api/expert-rules/:id/toggle — включить/выключить (is_active)
// ============================================================================

const express = require('express');
const db = require('../database');
const { evaluateProduct } = require('../expert-system');

const router = express.Router();

// Допустимые значения для валидации
const VALID_CONDITION_TYPES = [
  'operating_hours',
  'working_days',
  'remaining_resource',
  'days_until_next_to',
  'days_since_last_event'
];
const VALID_OPERATORS = ['>', '<', '>=', '<=', '=', '!='];
const VALID_SEVERITIES = ['info', 'warning', 'critical'];

// Проверка корректности данных правила (для POST и PUT)
function validateRule(body) {
  if (!body.name || typeof body.name !== 'string' || !body.name.trim()) {
    return 'Поле "Название" обязательно';
  }
  if (!VALID_CONDITION_TYPES.includes(body.condition_type)) {
    return `Тип условия должен быть одним из: ${VALID_CONDITION_TYPES.join(', ')}`;
  }
  if (!VALID_OPERATORS.includes(body.operator)) {
    return `Оператор должен быть одним из: ${VALID_OPERATORS.join(', ')}`;
  }
  if (typeof body.threshold !== 'number' || isNaN(body.threshold)) {
    return 'Поле "Порог" должно быть числом';
  }
  if (!VALID_SEVERITIES.includes(body.severity)) {
    return `Уровень должен быть одним из: ${VALID_SEVERITIES.join(', ')}`;
  }
  if (!body.recommendation || typeof body.recommendation !== 'string' || !body.recommendation.trim()) {
    return 'Поле "Рекомендация" обязательно';
  }
  return null;
}

// --------------- Применение правил к изделию ---------------
router.get('/products/:id/evaluate', (req, res) => {
  try {
    const productId = parseInt(req.params.id, 10);
    if (isNaN(productId)) {
      return res.status(400).json({ error: 'Некорректный идентификатор изделия' });
    }

    const result = evaluateProduct(productId);
    if (!result) {
      return res.status(404).json({ error: 'Изделие не найдено' });
    }

    res.json(result);
  } catch (err) {
    console.error('[expert-system] Ошибка оценки:', err);
    res.status(500).json({ error: err.message });
  }
});

// --------------- CRUD по правилам ---------------

// Получить список всех правил
router.get('/expert-rules', (req, res) => {
  try {
    const rules = db.prepare(`
      SELECT id, name, condition_type, operator, threshold, severity, recommendation, is_active
      FROM expert_rules
      ORDER BY id ASC
    `).all();
    res.json(rules);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Создать новое правило
router.post('/expert-rules', (req, res) => {
  try {
    const error = validateRule(req.body);
    if (error) return res.status(400).json({ error });

    const result = db.prepare(`
      INSERT INTO expert_rules (name, condition_type, operator, threshold, severity, recommendation, is_active)
      VALUES (?, ?, ?, ?, ?, ?, 1)
    `).run(
      req.body.name.trim(),
      req.body.condition_type,
      req.body.operator,
      req.body.threshold,
      req.body.severity,
      req.body.recommendation.trim()
    );

    const created = db.prepare('SELECT * FROM expert_rules WHERE id = ?').get(result.lastInsertRowid);
    res.status(201).json(created);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Изменить существующее правило
router.put('/expert-rules/:id', (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (isNaN(id)) {
      return res.status(400).json({ error: 'Некорректный идентификатор правила' });
    }
    const existing = db.prepare('SELECT id FROM expert_rules WHERE id = ?').get(id);
    if (!existing) {
      return res.status(404).json({ error: 'Правило не найдено' });
    }

    const error = validateRule(req.body);
    if (error) return res.status(400).json({ error });

    db.prepare(`
      UPDATE expert_rules
      SET name = ?, condition_type = ?, operator = ?, threshold = ?, severity = ?, recommendation = ?
      WHERE id = ?
    `).run(
      req.body.name.trim(),
      req.body.condition_type,
      req.body.operator,
      req.body.threshold,
      req.body.severity,
      req.body.recommendation.trim(),
      id
    );

    const updated = db.prepare('SELECT * FROM expert_rules WHERE id = ?').get(id);
    res.json(updated);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Переключить активность правила (включить/выключить)
router.patch('/expert-rules/:id/toggle', (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (isNaN(id)) {
      return res.status(400).json({ error: 'Некорректный идентификатор правила' });
    }
    const existing = db.prepare('SELECT is_active FROM expert_rules WHERE id = ?').get(id);
    if (!existing) {
      return res.status(404).json({ error: 'Правило не найдено' });
    }
    const newValue = existing.is_active ? 0 : 1;
    db.prepare('UPDATE expert_rules SET is_active = ? WHERE id = ?').run(newValue, id);
    const updated = db.prepare('SELECT * FROM expert_rules WHERE id = ?').get(id);
    res.json(updated);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Удалить правило
router.delete('/expert-rules/:id', (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (isNaN(id)) {
      return res.status(400).json({ error: 'Некорректный идентификатор правила' });
    }
    const result = db.prepare('DELETE FROM expert_rules WHERE id = ?').run(id);
    if (result.changes === 0) {
      return res.status(404).json({ error: 'Правило не найдено' });
    }
    res.json({ deleted: id });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;