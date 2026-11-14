// ============================================================================
// routes/documents.js — работа с файлами документов
// Использует multer для приёма multipart/form-data.
// Файлы сохраняются в backend/uploads/products/<id>/, в БД пишется путь.
// ============================================================================

const express = require('express');
const multer = require('multer');
const fs = require('fs');
const path = require('path');
const db = require('../database');

const router = express.Router();

// Папка для всех загрузок
// На сервере папку можно вынести на постоянный диск переменной UPLOADS_DIR
const UPLOADS_DIR = process.env.UPLOADS_DIR || path.join(__dirname, '..', 'uploads');
if (!fs.existsSync(UPLOADS_DIR)) fs.mkdirSync(UPLOADS_DIR, { recursive: true });

// Настройка multer: каждое изделие — своя папка, имена файлов уникализируем timestamp'ом
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const productDir = path.join(UPLOADS_DIR, 'products', String(req.params.id));
    fs.mkdirSync(productDir, { recursive: true });
    cb(null, productDir);
  },
  filename: (req, file, cb) => {
    // Имя на диске: timestamp + оригинальное имя.
    // Исходное имя сохраняем в БД для отображения пользователю.
    // Декодируем имя в UTF-8 (multer по умолчанию приходит в latin1)
    const decoded = Buffer.from(file.originalname, 'latin1').toString('utf8');
    cb(null, Date.now() + '_' + decoded);
  }
});
const upload = multer({ storage, limits: { fileSize: 50 * 1024 * 1024 } }); // 50 МБ

// ----------------------------------------------------------------------------
// POST /api/products/:id/documents — загрузить файл
// ----------------------------------------------------------------------------
router.post('/products/:id/documents', upload.single('file'), (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'Файл не передан' });

  // Восстанавливаем оригинальное имя в UTF-8
  const originalName = Buffer.from(req.file.originalname, 'latin1').toString('utf8');
  // Путь от корня папки uploads — это то, что попадёт в БД
  const relPath = path.relative(UPLOADS_DIR, req.file.path).replace(/\\/g, '/');

  try {
    const info = db.prepare(`
      INSERT INTO documents (product_id, filename, file_path, file_type, file_size)
      VALUES (?, ?, ?, ?, ?)
    `).run(
      req.params.id,
      originalName,
      relPath,
      path.extname(originalName).slice(1).toUpperCase() || 'FILE',
      req.file.size
    );
    res.status(201).json({
      id: info.lastInsertRowid,
      name: originalName,
      type: path.extname(originalName).slice(1).toUpperCase() || 'FILE',
      size: (req.file.size / 1024 / 1024).toFixed(2) + ' MB',
      date: new Date().toLocaleDateString('ru-RU')
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ----------------------------------------------------------------------------
// GET /api/documents/:id/download — скачать файл
// ----------------------------------------------------------------------------
router.get('/documents/:id/download', (req, res) => {
  const doc = db.prepare('SELECT * FROM documents WHERE id = ?').get(req.params.id);
  if (!doc) return res.status(404).json({ error: 'Документ не найден' });

  const absPath = path.join(UPLOADS_DIR, doc.file_path);
  if (!fs.existsSync(absPath)) return res.status(404).json({ error: 'Файл отсутствует на диске' });

  res.download(absPath, doc.filename);
});

// ----------------------------------------------------------------------------
// DELETE /api/documents/:id — удалить документ (и файл с диска)
// ----------------------------------------------------------------------------
router.delete('/documents/:id', (req, res) => {
  const doc = db.prepare('SELECT * FROM documents WHERE id = ?').get(req.params.id);
  if (!doc) return res.status(404).json({ error: 'Документ не найден' });

  try {
    const absPath = path.join(UPLOADS_DIR, doc.file_path);
    if (fs.existsSync(absPath)) fs.unlinkSync(absPath);
    db.prepare('DELETE FROM documents WHERE id = ?').run(req.params.id);
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
