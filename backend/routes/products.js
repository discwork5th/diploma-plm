// ============================================================================
// routes/products.js — REST API для изделий
// ----------------------------------------------------------------------------
// Эндпоинты:
//   GET    /api/products           - список всех изделий (без вложенных данных)
//   GET    /api/products/:id       - одно изделие СО ВСЕМИ вложенными данными
//   POST   /api/products           - создать изделие
//   PUT    /api/products/:id       - обновить изделие
//   DELETE /api/products/:id       - удалить изделие (cascade удалит всё связанное)
// ============================================================================

const express = require('express');
const db = require('../database');
const { evaluateProduct } = require('../expert-system');

const router = express.Router();

// ----------------------------------------------------------------------------
// Вспомогательная функция: достаёт изделие со всеми связанными данными.
// Возвращает объект в формате, удобном для фронтенда (как было в localStorage).
// ----------------------------------------------------------------------------
function loadProductWithRelations(productId) {
  const product = db
    .prepare('SELECT * FROM products WHERE id = ?')
    .get(productId);

  if (!product) return null;

  // Характеристики -> в объект { "Мощность": "11 кВт", ... }
  const specsRows = db
    .prepare('SELECT key, value FROM specifications WHERE product_id = ? ORDER BY order_num, id')
    .all(productId);
  const specifications = {};
  for (const row of specsRows) specifications[row.key] = row.value;

  // События жизненного цикла
  const lifecycleHistory = db
    .prepare(`SELECT event_date as date, event_name as event, status, description
              FROM lifecycle_events WHERE product_id = ? ORDER BY event_date`)
    .all(productId);

  // Документы
  const documents = db
    .prepare(`SELECT id, filename as name, file_type as type, file_size as size, uploaded_at as date
              FROM documents WHERE product_id = ?`)
    .all(productId)
    .map(d => ({
      ...d,
      size: d.size ? (d.size / 1024 / 1024).toFixed(2) + ' MB' : '—'
    }));

  // Данные обслуживания (1:1)
  const maintenanceRow = db
    .prepare(`SELECT next_to_date as nextTO, operating_hours as operatingHours,
                     working_days as workingDays, remaining_resource as remainingResource
              FROM maintenance WHERE product_id = ?`)
    .get(productId);

  // Показатели технического состояния по периодам (для графика)
  const performanceData = db
    .prepare('SELECT period as month, value FROM performance_data WHERE product_id = ? ORDER BY id')
    .all(productId);

  // Собираем единый объект для фронтенда
  return {
    id: product.id,
    name: product.name,
    type: product.type,
    manufacturer: product.manufacturer,
    serialNumber: product.serial_number,
    manufactureDate: product.manufacture_date,
    commissioningDate: product.commissioning_date,
    currentStage: product.current_stage_id,
    image: product.image_path || '',
    location: product.location || '',
    specifications,
    lifecycleHistory,
    documents,
    maintenance: maintenanceRow || {},
    performanceData
  };
}

// ----------------------------------------------------------------------------
// GET /api/products — список изделий (упрощённый, для каталога)
// ----------------------------------------------------------------------------
router.get('/', (req, res) => {
  try {
    const rows = db
      .prepare(`SELECT id, name, type, manufacturer, serial_number as serialNumber,
                       manufacture_date as manufactureDate,
                       current_stage_id as currentStage, image_path as image, location
                FROM products ORDER BY id`)
      .all();
    // Состояние по экспертной системе — для фильтра и цветной метки в каталоге
    for (const r of rows) {
      const e = evaluateProduct(r.id);
      r.severity = e ? e.overallSeverity : 'normal';
    }
    res.json(rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

// ----------------------------------------------------------------------------
// GET /api/products/:id — полная карточка изделия со всеми вложениями
// ----------------------------------------------------------------------------
router.get('/:id', (req, res) => {
  try {
    const product = loadProductWithRelations(req.params.id);
    if (!product) return res.status(404).json({ error: 'Изделие не найдено' });
    res.json(product);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

// ----------------------------------------------------------------------------
// POST /api/products — создать новое изделие
// Принимает тот же "большой объект", что использовал фронтенд раньше.
// Все вставки выполняются в одной транзакции — либо всё, либо ничего.
// ----------------------------------------------------------------------------
router.post('/', (req, res) => {
  const p = req.body;

  if (!p.name || !p.type) {
    return res.status(400).json({ error: 'Поля name и type обязательны' });
  }

  const insertProduct = db.prepare(`
    INSERT INTO products (name, type, manufacturer, serial_number,
                          manufacture_date, commissioning_date, current_stage_id, image_path, location)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  const insertSpec = db.prepare(`
    INSERT INTO specifications (product_id, key, value, order_num) VALUES (?, ?, ?, ?)
  `);
  const insertEvent = db.prepare(`
    INSERT INTO lifecycle_events (product_id, event_date, event_name, status, description)
    VALUES (?, ?, ?, ?, ?)
  `);
  const insertMaintenance = db.prepare(`
    INSERT INTO maintenance (product_id, next_to_date, operating_hours, working_days, remaining_resource)
    VALUES (?, ?, ?, ?, ?)
  `);

  // Транзакция: либо все INSERT выполнятся, либо ни одного.
  const createAll = db.transaction((p) => {
    const info = insertProduct.run(
      p.name, p.type, p.manufacturer || null, p.serialNumber || null,
      p.manufactureDate || null, p.commissioningDate || null,
      p.currentStage || 'design', p.image || null, p.location || null
    );
    const newId = info.lastInsertRowid;

    // Характеристики (объект -> строки)
    let order = 1;
    for (const [key, value] of Object.entries(p.specifications || {})) {
      if (key && key.trim()) insertSpec.run(newId, key, value || '', order++);
    }

    // События ЖЦ
    for (const ev of p.lifecycleHistory || []) {
      insertEvent.run(newId, ev.date, ev.event, ev.status || 'completed', ev.description || '');
    }

    // Обслуживание (если переданы поля)
    const m = p.maintenance || {};
    if (m.nextTO || m.operatingHours || m.workingDays || m.remainingResource) {
      insertMaintenance.run(
        newId,
        m.nextTO || null,
        m.operatingHours || null,
        m.workingDays || null,
        m.remainingResource || null
      );
    }
    return newId;
  });

  try {
    const newId = createAll(p);
    const full = loadProductWithRelations(newId);
    res.status(201).json(full);
  } catch (err) {
    console.error(err);
    // Уникальное ограничение на serial_number даёт читаемую ошибку
    if (err.message.includes('UNIQUE')) {
      return res.status(409).json({ error: 'Изделие с таким серийным номером уже существует' });
    }
    res.status(500).json({ error: err.message });
  }
});

// ----------------------------------------------------------------------------
// PUT /api/products/:id — обновить изделие
// Стратегия: удаляем все связанные строки и записываем заново.
// Это проще, чем считать, что добавили / что удалили / что изменили.
// ----------------------------------------------------------------------------
router.put('/:id', (req, res) => {
  const id = req.params.id;
  const p = req.body;

  if (!p.name || !p.type) {
    return res.status(400).json({ error: 'Поля name и type обязательны' });
  }

  const updateProduct = db.prepare(`
    UPDATE products SET
      name = ?, type = ?, manufacturer = ?, serial_number = ?,
      manufacture_date = ?, commissioning_date = ?, current_stage_id = ?,
      image_path = ?, location = ?, updated_at = datetime('now')
    WHERE id = ?
  `);
  const delSpecs = db.prepare('DELETE FROM specifications WHERE product_id = ?');
  const delEvents = db.prepare('DELETE FROM lifecycle_events WHERE product_id = ?');
  const delMaintenance = db.prepare('DELETE FROM maintenance WHERE product_id = ?');

  const insertSpec = db.prepare(`
    INSERT INTO specifications (product_id, key, value, order_num) VALUES (?, ?, ?, ?)
  `);
  const insertEvent = db.prepare(`
    INSERT INTO lifecycle_events (product_id, event_date, event_name, status, description)
    VALUES (?, ?, ?, ?, ?)
  `);
  const insertMaintenance = db.prepare(`
    INSERT INTO maintenance (product_id, next_to_date, operating_hours, working_days, remaining_resource)
    VALUES (?, ?, ?, ?, ?)
  `);

  const updateAll = db.transaction((id, p) => {
    const info = updateProduct.run(
      p.name, p.type, p.manufacturer || null, p.serialNumber || null,
      p.manufactureDate || null, p.commissioningDate || null,
      p.currentStage || 'design', p.image || null, p.location || null, id
    );
    if (info.changes === 0) {
      throw new Error('Изделие не найдено');
    }

    delSpecs.run(id);
    delEvents.run(id);
    delMaintenance.run(id);

    let order = 1;
    for (const [key, value] of Object.entries(p.specifications || {})) {
      if (key && key.trim()) insertSpec.run(id, key, value || '', order++);
    }
    for (const ev of p.lifecycleHistory || []) {
      insertEvent.run(id, ev.date, ev.event, ev.status || 'completed', ev.description || '');
    }
    const m = p.maintenance || {};
    if (m.nextTO || m.operatingHours || m.workingDays || m.remainingResource) {
      insertMaintenance.run(
        id,
        m.nextTO || null,
        m.operatingHours || null,
        m.workingDays || null,
        m.remainingResource || null
      );
    }
  });

  try {
    updateAll(id, p);
    const full = loadProductWithRelations(id);
    res.json(full);
  } catch (err) {
    console.error(err);
    if (err.message.includes('UNIQUE')) {
      return res.status(409).json({ error: 'Изделие с таким серийным номером уже существует' });
    }
    if (err.message === 'Изделие не найдено') {
      return res.status(404).json({ error: err.message });
    }
    res.status(500).json({ error: err.message });
  }
});

// ----------------------------------------------------------------------------
// DELETE /api/products/:id — удалить изделие
// ON DELETE CASCADE автоматически удалит все связанные записи
// (характеристики, события, документы, обслуживание, данные графика).
// ----------------------------------------------------------------------------
router.delete('/:id', (req, res) => {
  try {
    const info = db.prepare('DELETE FROM products WHERE id = ?').run(req.params.id);
    if (info.changes === 0) {
      return res.status(404).json({ error: 'Изделие не найдено' });
    }
    res.json({ ok: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
