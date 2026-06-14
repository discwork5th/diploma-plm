-- ============================================================================
-- Схема базы данных для системы управления жизненным циклом изделия
-- СУБД: SQLite 3
-- ============================================================================
-- Включаем поддержку внешних ключей (по умолчанию в SQLite она выключена)
PRAGMA foreign_keys = ON;

-- ----------------------------------------------------------------------------
-- Справочник этапов жизненного цикла
-- Заполняется один раз начальными данными (см. seed.sql).
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS lifecycle_stages (
  id        TEXT PRIMARY KEY,         -- символьный идентификатор: design, production, ...
  name      TEXT NOT NULL,            -- отображаемое название на русском
  color     TEXT NOT NULL,            -- цвет бейджа в UI (blue, green, yellow, ...)
  order_num INTEGER NOT NULL          -- порядок отображения
);

-- ----------------------------------------------------------------------------
-- Изделия (центральная таблица)
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS products (
  id                 INTEGER PRIMARY KEY AUTOINCREMENT,
  name               TEXT    NOT NULL,
  type               TEXT    NOT NULL,
  manufacturer       TEXT,
  serial_number      TEXT    UNIQUE,             -- два изделия не могут иметь одинаковый S/N
  manufacture_date   TEXT,                       -- формат YYYY-MM-DD
  commissioning_date TEXT,
  current_stage_id   TEXT    NOT NULL DEFAULT 'design'
                     REFERENCES lifecycle_stages(id),
  image_path         TEXT,                       -- относительный путь к фото
  created_at         TEXT    DEFAULT (datetime('now')),
  updated_at         TEXT    DEFAULT (datetime('now'))
);

-- ----------------------------------------------------------------------------
-- Технические характеристики (1 изделие -> много характеристик)
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS specifications (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  product_id INTEGER NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  key        TEXT    NOT NULL,                   -- "Мощность", "КПД", ...
  value      TEXT,                               -- "11 кВт", "87.5%", ...
  order_num  INTEGER DEFAULT 0                   -- порядок отображения
);

-- ----------------------------------------------------------------------------
-- События жизненного цикла (история изделия)
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS lifecycle_events (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  product_id  INTEGER NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  event_date  TEXT    NOT NULL,                  -- дата события YYYY-MM-DD
  event_name  TEXT    NOT NULL,                  -- "Плановое ТО", "Ввод в эксплуатацию"
  status      TEXT    NOT NULL DEFAULT 'completed'
              CHECK (status IN ('completed', 'scheduled')),
  description TEXT
);

-- ----------------------------------------------------------------------------
-- Документы изделия (паспорта, чертежи, протоколы)
-- В БД хранятся только метаданные, сами файлы лежат на диске в backend/uploads/.
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS documents (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  product_id  INTEGER NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  filename    TEXT    NOT NULL,                  -- оригинальное имя файла
  file_path   TEXT    NOT NULL,                  -- относительный путь на диске
  file_type   TEXT,                              -- расширение/MIME
  file_size   INTEGER,                           -- размер в байтах
  uploaded_at TEXT    DEFAULT (datetime('now'))
);

-- ----------------------------------------------------------------------------
-- Данные обслуживания (1:1 с изделием)
-- product_id одновременно и первичный, и внешний ключ — это говорит:
-- "у одного изделия не более одной записи обслуживания".
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS maintenance (
  product_id          INTEGER PRIMARY KEY REFERENCES products(id) ON DELETE CASCADE,
  next_to_date        TEXT,                      -- дата следующего ТО
  operating_hours     INTEGER,                   -- наработка в часах
  working_days        INTEGER,                   -- дней в работе
  remaining_resource  INTEGER                    -- остаток ресурса
);

-- ----------------------------------------------------------------------------
-- Показатели технического состояния по периодам (для графика)
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS performance_data (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  product_id INTEGER NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  period     TEXT    NOT NULL,                   -- "Март", "Апрель" или дата
  value      REAL    NOT NULL                    -- значение в процентах
);

-- ----------------------------------------------------------------------------
-- База правил экспертной системы
-- Каждое правило — это условие "если X (operator) Y, то рекомендация Z".
-- Заполняется и редактируется отдельно; правила можно отключать через is_active.
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS expert_rules (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  name            TEXT    NOT NULL,
  condition_type  TEXT    NOT NULL,              -- поле, проверяемое в правиле
  operator        TEXT    NOT NULL,              -- >, <, >=, <=, =
  threshold       REAL    NOT NULL,              -- пороговое значение
  severity        TEXT    NOT NULL               -- уровень: info, warning, critical
                  CHECK (severity IN ('info', 'warning', 'critical')),
  recommendation  TEXT    NOT NULL,              -- что система рекомендует сделать
  is_active       INTEGER NOT NULL DEFAULT 1     -- 1 = активно, 0 = отключено
);

-- ----------------------------------------------------------------------------
-- Индексы для ускорения частых запросов
-- ----------------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_products_stage          ON products(current_stage_id);
CREATE INDEX IF NOT EXISTS idx_specs_product           ON specifications(product_id);
CREATE INDEX IF NOT EXISTS idx_events_product          ON lifecycle_events(product_id);
CREATE INDEX IF NOT EXISTS idx_documents_product       ON documents(product_id);
CREATE INDEX IF NOT EXISTS idx_performance_product     ON performance_data(product_id);
