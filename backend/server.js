// ============================================================================
// server.js — точка входа бэкенд-сервера
// ----------------------------------------------------------------------------
// Стек:  Node.js + Express + better-sqlite3
// Запуск: npm start  (или для разработки: npm run dev — с авто-перезапуском)
// ============================================================================

const express = require('express');
const cors = require('cors');
const path = require('path');

// Импорт database.js здесь же запускает инициализацию БД при первом старте
require('./database');

// Наполняем базу правил экспертной системы (только при первом запуске после обновления)
const { seedRulesIfEmpty } = require('./expert-system');
seedRulesIfEmpty();

// Маршруты
const productsRouter = require('./routes/products');
const stagesRouter = require('./routes/lifecycle-stages');
const documentsRouter = require('./routes/documents');
const expertSystemRouter = require('./routes/expert-system');
const dashboardRouter = require('./routes/dashboard');

const app = express();

// ---- Middleware ----
// CORS разрешает фронту (например, на порту 5173 у Vite) обращаться к бэку (порт 4000).
// Без него браузер заблокирует запросы из-за same-origin policy.
app.use(cors());

// Парсинг JSON в теле POST/PUT запросов. Лимит увеличен для base64-картинок.
app.use(express.json({ limit: '10mb' }));

// ---- Статика для загруженных файлов ----
// Чтобы можно было открыть документ по прямой ссылке /uploads/products/1/file.pdf.
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// ---- API маршруты ----
app.use('/api/products', productsRouter);
app.use('/api/lifecycle-stages', stagesRouter);
app.use('/api', documentsRouter); // маршруты документов начинаются с /products/:id/documents
app.use('/api', expertSystemRouter); // экспертная система: /products/:id/evaluate и /expert-rules
app.use('/api', dashboardRouter);    // дашборд: /dashboard/summary

// ---- Корневой эндпоинт ----
app.get('/', (req, res) => {
  res.json({
    name: 'Digital Passport PLM API',
    version: '1.1.0',
    endpoints: [
      'GET    /api/products',
      'GET    /api/products/:id',
      'POST   /api/products',
      'PUT    /api/products/:id',
      'DELETE /api/products/:id',
      'GET    /api/lifecycle-stages',
      'POST   /api/products/:id/documents',
      'GET    /api/documents/:id/download',
      'DELETE /api/documents/:id',
      'GET    /api/products/:id/evaluate',
      'GET    /api/expert-rules',
      'GET    /api/dashboard/summary'
    ]
  });
});

// ---- Запуск сервера ----
const PORT = process.env.PORT || 4000;
app.listen(PORT, () => {
  console.log(`[server] Сервер запущен: http://localhost:${PORT}`);
  console.log(`[server] Список эндпоинтов: http://localhost:${PORT}/`);
});