// ============================================================================
// server.js — точка входа бэкенд-сервера
// ----------------------------------------------------------------------------
// Стек:  Node.js + Express + better-sqlite3
// Запуск: npm start  (или для разработки: npm run dev — с авто-перезапуском)
// ============================================================================

const express = require('express');
const cors = require('cors');
const path = require('path');

// Настройки из backend/.env (ключ модели, пути к данным). Файл не хранится в git,
// образец лежит в .env.example. Встроенная функция Node.js, без лишних пакетов.
const ENV_FILE = path.join(__dirname, '.env');
if (require('fs').existsSync(ENV_FILE)) process.loadEnvFile(ENV_FILE);

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
const assistantRouter = require('./routes/assistant');
const telemetryRouter = require('./routes/telemetry');

const { llmLimit, readOnly } = require('./guards');

const app = express();
// Сайт стоит за Caddy: настоящий IP посетителя приходит в заголовке
// X-Forwarded-For. trust proxy = 1 — доверять одному прокси перед нами
app.set('trust proxy', 1);

// ---- Middleware ----
// CORS разрешает фронту (например, на порту 5173 у Vite) обращаться к бэку (порт 4000).
// Без него браузер заблокирует запросы из-за same-origin policy.
app.use(cors());

// Парсинг JSON в теле POST/PUT запросов. Лимит увеличен для base64-картинок.
app.use(express.json({ limit: '10mb' }));

// ---- Статика для загруженных файлов ----
// Чтобы можно было открыть документ по прямой ссылке /uploads/products/1/file.pdf.
app.use('/uploads', express.static(process.env.UPLOADS_DIR || path.join(__dirname, 'uploads')));

// ---- Защита публичного демо (см. guards.js) ----
app.use('/api', readOnly);
app.use('/api/assistant/recommend', llmLimit);
app.use('/api/assistant/chat', llmLimit);

// ---- API маршруты ----
app.use('/api/products', productsRouter);
app.use('/api/lifecycle-stages', stagesRouter);
app.use('/api', documentsRouter); // маршруты документов начинаются с /products/:id/documents
app.use('/api', expertSystemRouter); // экспертная система: /products/:id/evaluate и /expert-rules
app.use('/api', assistantRouter);    // ИИ-подбор: /assistant/status и /assistant/recommend
app.use('/api', dashboardRouter);    // дашборд: /dashboard/summary
app.use('/api', telemetryRouter);    // телеметрия: /telemetry/snapshot, /telemetry/stream, /products/:id/health



// ---- Корневой эндпоинт ----
// ---- Раздача собранного фронтенда (для онлайн-развёртывания) ----
// Vite собирает фронт в ../frontend/dist. Отдаём эти файлы статикой,
// а на все «не-API» запросы возвращаем index.html (для работы SPA).
const frontendDist = path.join(__dirname, '..', 'frontend', 'dist');
app.use(express.static(frontendDist));
app.get('*', (req, res) => {
  res.sendFile(path.join(frontendDist, 'index.html'));
});
// ---- Запуск сервера ----
const PORT = process.env.PORT || 4000;
app.listen(PORT, '0.0.0.0', () => {
  console.log(`[server] Сервер запущен: http://localhost:${PORT}`);
  console.log(`[server] Список эндпоинтов: http://localhost:${PORT}/`);
});