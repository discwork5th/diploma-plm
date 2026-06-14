-- ============================================================================
-- Начальные данные для БД (запускается один раз при создании)
-- ============================================================================

-- ----- Этапы жизненного цикла -----
INSERT OR IGNORE INTO lifecycle_stages (id, name, color, order_num) VALUES
  ('design',      'Проектирование', 'blue',   1),
  ('production',  'Производство',   'purple', 2),
  ('operation',   'Эксплуатация',   'green',  3),
  ('maintenance', 'Обслуживание',   'yellow', 4),
  ('disposal',    'Утилизация',     'red',    5);

-- ----- Демо-изделие №1 -----
INSERT INTO products (
  id, name, type, manufacturer, serial_number,
  manufacture_date, commissioning_date, current_stage_id, image_path
) VALUES (
  1,
  'Электродвигатель асинхронный АИР 132M4',
  'Электрооборудование',
  'ООО "Саратовский электромашиностроительный завод"',
  'АИР-132M4-2024-0847',
  '2024-03-15',
  '2024-03-28',
  'operation',
  NULL
);

INSERT INTO specifications (product_id, key, value, order_num) VALUES
  (1, 'Мощность',          '11 кВт',              1),
  (1, 'Напряжение',        '380 В',               2),
  (1, 'Частота вращения',  '1500 об/мин',         3),
  (1, 'КПД',               '87.5%',               4),
  (1, 'Масса',             '85 кг',               5),
  (1, 'Степень защиты',    'IP55',                6),
  (1, 'Класс изоляции',    'F',                   7),
  (1, 'Режим работы',      'S1 (продолжительный)', 8);

INSERT INTO lifecycle_events (product_id, event_date, event_name, status, description) VALUES
  (1, '2024-03-15', 'Производство',         'completed', 'Изготовлен на участке №3'),
  (1, '2024-03-22', 'Приемочные испытания', 'completed', 'Протокол №ПИ-2024-0847'),
  (1, '2024-03-28', 'Ввод в эксплуатацию',  'completed', 'Установлен на линии А-12'),
  (1, '2024-06-15', 'Плановое ТО',          'completed', 'Замена подшипников'),
  (1, '2024-09-15', 'Плановое ТО',          'completed', 'Проверка изоляции'),
  (1, '2026-06-15', 'Плановое ТО',          'scheduled', 'Запланировано');

INSERT INTO maintenance (product_id, next_to_date, operating_hours, working_days, remaining_resource)
VALUES (1, '2026-06-15', 2847, 267, 47153);

INSERT INTO performance_data (product_id, period, value) VALUES
  (1, 'Март',     98),
  (1, 'Апрель',   97),
  (1, 'Май',      96),
  (1, 'Июнь',     95),
  (1, 'Июль',     96),
  (1, 'Август',   97),
  (1, 'Сентябрь', 98),
  (1, 'Октябрь',  97),
  (1, 'Ноябрь',   98),
  (1, 'Декабрь',  96);

-- ----- Демо-изделие №2 -----
INSERT INTO products (
  id, name, type, manufacturer, serial_number,
  manufacture_date, commissioning_date, current_stage_id, image_path
) VALUES (
  2,
  'Электродвигатель асинхронный АИР 132M4',
  'Электрооборудование',
  'ООО "Саратовский электромашиностроительный завод"',
  'АИР-132M4-2024-0848',
  '2024-04-20',
  '2024-05-15',
  'operation',
  NULL
);

INSERT INTO specifications (product_id, key, value, order_num) VALUES
  (2, 'Мощность',         '11 кВт',      1),
  (2, 'Напряжение',       '380 В',       2),
  (2, 'Частота вращения', '1500 об/мин', 3),
  (2, 'КПД',              '87.5%',       4),
  (2, 'Масса',            '85 кг',       5);

INSERT INTO lifecycle_events (product_id, event_date, event_name, status, description) VALUES
  (2, '2024-04-20', 'Производство',         'completed', 'Изготовлен на участке №5'),
  (2, '2024-04-28', 'Приемочные испытания', 'completed', 'Протокол №ПИ-2024-0848'),
  (2, '2024-05-15', 'Ввод в эксплуатацию',  'completed', 'Установлен на линии B-7'),
  (2, '2024-08-15', 'Плановое ТО',          'completed', 'Замена смазки'),
  (2, '2024-11-15', 'Плановое ТО',          'completed', 'Проверка подшипников');

INSERT INTO maintenance (product_id, next_to_date, operating_hours, working_days, remaining_resource)
VALUES (2, '2026-08-15', 1840, 184, 48160);

INSERT INTO performance_data (product_id, period, value) VALUES
  (2, 'Май',      97),
  (2, 'Июнь',     98),
  (2, 'Июль',     96),
  (2, 'Август',   95),
  (2, 'Сентябрь', 97),
  (2, 'Октябрь',  98),
  (2, 'Ноябрь',   97),
  (2, 'Декабрь',  96);

-- ----- Стартовый набор правил экспертной системы -----
-- (используется позже, в следующей итерации проекта)
INSERT INTO expert_rules (name, condition_type, operator, threshold, severity, recommendation) VALUES
  ('Превышение наработки',        'operating_hours',    '>',  5000,  'warning',  'Рекомендуется внеплановое ТО'),
  ('Низкий остаток ресурса',      'remaining_resource', '<',  5000,  'critical', 'Запланировать замену изделия'),
  ('ТО просрочено',               'days_until_to',      '<',  0,     'critical', 'Срочно провести ТО'),
  ('ТО скоро потребуется',        'days_until_to',      '<=', 14,    'warning',  'Подготовиться к плановому ТО'),
  ('Длительная эксплуатация',     'working_days',       '>',  365,   'info',     'Рекомендуется углубленная диагностика');
