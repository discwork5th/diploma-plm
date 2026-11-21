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
    const allProducts = db.prepare(`
      SELECT p.id, p.name, p.type, p.serial_number AS serialNumber, p.location, p.current_stage_id AS stageId,
             CAST(julianday(m.next_to_date) - julianday('now') AS INTEGER) AS daysUntilTO
      FROM products p LEFT JOIN maintenance m ON m.product_id = p.id`).all();
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

    // ---- Сводка по местам установки: для карты предприятия ----
    // По каждому корпусу: сколько оборудования, сколько в плохом состоянии,
    // у скольких ТО в ближайшие 30 дней, и самые проблемные единицы
    const RANK = { critical: 3, warning: 2, info: 1, normal: 0 };
    const locations = new Map();
    for (const e of evaluations) {
      const loc = e.product.location;
      if (!loc) continue;
      if (!locations.has(loc)) locations.set(loc, { location: loc, total: 0, critical: 0, warning: 0, dueTO: 0, items: [] });
      const L = locations.get(loc);
      L.total++;
      if (e.severity === 'critical') L.critical++;
      if (e.severity === 'warning') L.warning++;
      const active = ['operation', 'maintenance'].includes(e.product.stageId);
      if (active && e.product.daysUntilTO !== null && e.product.daysUntilTO <= 30) L.dueTO++;
      L.items.push({ id: e.product.id, name: e.product.name, serialNumber: e.product.serialNumber,
                     severity: e.severity, daysUntilTO: active ? e.product.daysUntilTO : null });
    }
    const byLocation = [...locations.values()].map(L => ({
      ...L,
      items: L.items
        .filter(i => i.severity === 'critical' || i.severity === 'warning')
        .sort((a, b) => RANK[b.severity] - RANK[a.severity] || (a.daysUntilTO ?? 999) - (b.daysUntilTO ?? 999))
        .slice(0, 6)
    }));

    res.json({
      totalProducts,
      byLocation,
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