// ============================================================================
// database.js — модуль работы с БД
// ----------------------------------------------------------------------------
// Создаёт файл базы, если его нет, применяет схему, справочники и демо-каталог.
// Экспортирует единственный объект db, через который работают все маршруты.
// ============================================================================

const Database = require('better-sqlite3');
const fs = require('fs');
const path = require('path');
const { seedDemoData } = require('./demo-data');

// Путь к файлу базы можно переопределить переменной окружения DB_PATH:
// на сервере база должна лежать на постоянном диске, а не рядом с кодом.
const DB_FILE = process.env.DB_PATH || path.join(__dirname, 'database.db');
fs.mkdirSync(path.dirname(DB_FILE), { recursive: true });
const SCHEMA_FILE = path.join(__dirname, 'schema.sql');
const SEED_FILE = path.join(__dirname, 'seed.sql');

// Создаём/открываем БД. Если файла нет, он создастся автоматически.
const db = new Database(DB_FILE);

// КРИТИЧНО: включаем поддержку внешних ключей.
// По умолчанию в SQLite она ВЫКЛЮЧЕНА — без этой строки CASCADE-удаление
// и проверка REFERENCES работать не будут.
db.pragma('foreign_keys = ON');

// При первом запуске (когда таблиц нет) — применяем схему и заливаем данные.
const tableExists = db
  .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='products'")
  .get();

if (!tableExists) {
  console.log('[database] Первый запуск: создание таблиц и начальное заполнение...');

  const schema = fs.readFileSync(SCHEMA_FILE, 'utf8');
  db.exec(schema);

  const seed = fs.readFileSync(SEED_FILE, 'utf8');
  db.exec(seed);
  seedDemoData(db);

  console.log('[database] БД успешно инициализирована.');
} else {
  console.log('[database] БД найдена, используем существующую.');
}

module.exports = db;
