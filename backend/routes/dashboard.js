// ============================================================================
// routes/dashboard.js — сводная статистика для дашборда
// ----------------------------------------------------------------------------
// GET /api/dashboard/summary — все данные для главного экрана за один запрос
// ============================================================================

const express = require('express');
const db = require('../database');
const { evaluateProduct } = require('../expert-system');

const router = express.Router();

router.get('/dashboard/summary', (req, res) => {
  try {
    // ---- Общее количество изделий ----
    const totalProducts = db.prepare('SELECT COUNT(*) AS c FROM products').get().c;

    // ---- Распределение по этапам ЖЦ ----
    // JOIN со справочником, чтобы получить читаемые названия и цвета этапов
    const byStage = db.prepare(`
      SELECT
        s.id,
        s.name,
        s.color,
        s.order_num,
        COUNT(p.id) AS count
      FROM lifecycle_stages s
      LEFT JOIN products p ON p.current_stage_id = s.id
      GROUP BY s.id
      ORDER BY s.order_num
    `).all();

    // ---- Распределение по типам оборудования ----
    const byType = db.prepare(`
      SELECT type, COUNT(*) AS count
      FROM products
      WHERE type IS NOT NULL AND type != ''
      GROUP BY type
      ORDER BY count DESC
    `).all();

    // ---- Изделия с ТО в ближайшие 30 дней или просроченным ----
    // SQLite вычисляет разницу дат через julianday()
    const upcomingTO = db.prepare(`
      SELECT
        p.id,
        p.name,
        p.serial_number AS serialNumber,
        p.type,
        m.next_to_date AS nextTO,
        CAST(julianday(m.next_to_date) - julianday('now') AS INTEGER) AS daysUntilTO
      FROM products p
      JOIN maintenance m ON m.product_id = p.id
      WHERE m.next_to_date IS NOT NULL
        AND julianday(m.next_to_date) - julianday('now') <= 30
      ORDER BY m.next_to_date ASC
      LIMIT 10
    `).all();

    // ---- Прогон экспертной оценки по всем изделиям ----
    // Не самый дешёвый запрос, но для прототипа на десятках изделий — норм.
    // В промышленной системе на тысячах записей это вынесли бы в фоновый процесс
    // с кешированием результатов.
    const allProducts = db.prepare('SELECT id, name, type, serial_number AS serialNumber FROM products').all();
    const evaluations = allProducts.map(p => {
      const ev = evaluateProduct(p.id);
      return {
        product: p,
        severity: ev ? ev.overallSeverity : 'normal',
        triggeredCount: ev ? ev.triggeredRules.length : 0
      };
    });

    // Подсчёт изделий по уровню заключения
    const bySeverity = {
      normal:   evaluations.filter(e => e.severity === 'normal').length,
      info:     evaluations.filter(e => e.severity === 'info').length,
      warning:  evaluations.filter(e => e.severity === 'warning').length,
      critical: evaluations.filter(e => e.severity === 'critical').length,
    };

    // Список изделий с критической оценкой (для блока "требуют внимания")
    const criticalProducts = evaluations
      .filter(e => e.severity === 'critical')
      .map(e => ({ ...e.product, triggeredCount: e.triggeredCount }))
      .slice(0, 10);

    // Изделия с предупреждениями
    const warningProducts = evaluations
      .filter(e => e.severity === 'warning')
      .map(e => ({ ...e.product, triggeredCount: e.triggeredCount }))
      .slice(0, 10);

    res.json({
      totalProducts,
      byStage,
      byType,
      bySeverity,
      criticalProducts,
      warningProducts,
      upcomingTO,
      generatedAt: new Date().toISOString()
    });
  } catch (err) {
    console.error('[dashboard] Ошибка:', err);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;