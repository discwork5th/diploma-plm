// ============================================================================
// expert-system.js — движок продукционной экспертной системы
// ----------------------------------------------------------------------------
// Экспертная система продукционного типа: проверяет данные изделия против
// набора правил формата "если <условие>, то <рекомендация>".
//
// База правил хранится в таблице expert_rules. Каждое правило имеет:
//   - condition_type: какое поле изделия проверять
//   - operator: оператор сравнения (>, <, >=, <=, =)
//   - threshold: пороговое значение
//   - severity: уровень критичности (info / warning / critical)
//   - recommendation: текстовая рекомендация при срабатывании
//
// Поддерживаемые типы условий (condition_type):
//   - operating_hours      — моточасы наработки
//   - working_days         — дней в работе
//   - remaining_resource   — остаток ресурса
//   - days_until_next_to   — дней до плановой даты ТО (отрицательное = просрочено)
//   - days_since_last_event— дней с последнего события ЖЦ
// ============================================================================

const db = require('./database');

// ----------------------------------------------------------------------------
// Извлечение числовых характеристик изделия для проверки правил.
// Возвращает объект { operating_hours, working_days, ... }
// со значениями, которые правила могут сравнивать со своими порогами.
// ----------------------------------------------------------------------------
function extractFacts(productId) {
  const facts = {};

  // Данные обслуживания
  const m = db.prepare('SELECT * FROM maintenance WHERE product_id = ?').get(productId);
  if (m) {
    facts.operating_hours = m.operating_hours || 0;
    facts.working_days = m.working_days || 0;
    facts.remaining_resource = m.remaining_resource || 0;

    // Дней до плановой даты ТО (отрицательное = ТО просрочено)
    if (m.next_to_date) {
      const target = new Date(m.next_to_date);
      const now = new Date();
      const diffMs = target.getTime() - now.getTime();
      facts.days_until_next_to = Math.ceil(diffMs / (1000 * 60 * 60 * 24));
    }
  }

  // Дней с последнего выполненного события жизненного цикла
  const lastEvent = db.prepare(`
    SELECT event_date FROM lifecycle_events
    WHERE product_id = ? AND status = 'completed'
    ORDER BY event_date DESC LIMIT 1
  `).get(productId);

  if (lastEvent && lastEvent.event_date) {
    const eventDate = new Date(lastEvent.event_date);
    const now = new Date();
    const diffMs = now.getTime() - eventDate.getTime();
    facts.days_since_last_event = Math.floor(diffMs / (1000 * 60 * 60 * 24));
  }

  return facts;
}

// ----------------------------------------------------------------------------
// Проверка одного оператора сравнения.
// ----------------------------------------------------------------------------
function checkOperator(value, operator, threshold) {
  switch (operator) {
    case '>':  return value >  threshold;
    case '<':  return value <  threshold;
    case '>=': return value >= threshold;
    case '<=': return value <= threshold;
    case '=':
    case '==': return value === threshold;
    case '!=': return value !== threshold;
    default:   return false;
  }
}

// ----------------------------------------------------------------------------
// Главная функция: применить все активные правила к изделию.
// Возвращает структуру с заключением:
//   {
//     overallSeverity: 'normal' | 'info' | 'warning' | 'critical',
//     triggeredRules: [{ name, severity, recommendation, conditionText, factValue }],
//     facts: { ... извлечённые факты ... },
//     totalRulesChecked: число,
//     evaluatedAt: ISO-дата
//   }
// ----------------------------------------------------------------------------
function evaluateProduct(productId) {
  // Проверим, что изделие существует
  const product = db.prepare('SELECT id, name FROM products WHERE id = ?').get(productId);
  if (!product) {
    return null;
  }

  // Извлекаем факты об изделии
  const facts = extractFacts(productId);

  // Загружаем активные правила
  const rules = db.prepare('SELECT * FROM expert_rules WHERE is_active = 1').all();

  const triggered = [];
  for (const rule of rules) {
    const factValue = facts[rule.condition_type];

    // Если для этого изделия нет факта, который проверяет правило, — пропускаем.
    // Это нормальная ситуация: например, если у изделия не задана дата ТО.
    if (factValue === undefined || factValue === null) continue;

    if (checkOperator(factValue, rule.operator, rule.threshold)) {
      triggered.push({
        ruleId: rule.id,
        name: rule.name,
        severity: rule.severity,
        recommendation: rule.recommendation,
        conditionText: `${rule.condition_type} ${rule.operator} ${rule.threshold}`,
        factValue: factValue
      });
    }
  }

  // Определяем общий уровень: берём максимальный из сработавших.
  // Иерархия: critical > warning > info > normal
  let overall = 'normal';
  for (const t of triggered) {
    if (t.severity === 'critical') { overall = 'critical'; break; }
    if (t.severity === 'warning' && overall !== 'critical') overall = 'warning';
    if (t.severity === 'info' && overall === 'normal') overall = 'info';
  }

  return {
    productId: product.id,
    productName: product.name,
    overallSeverity: overall,
    triggeredRules: triggered,
    facts: facts,
    totalRulesChecked: rules.length,
    evaluatedAt: new Date().toISOString()
  };
}

// ----------------------------------------------------------------------------
// Наполнение базы правил начальным набором, если она пустая.
// Вызывается при старте сервера.
// ----------------------------------------------------------------------------
function seedRulesIfEmpty() {
  const count = db.prepare('SELECT COUNT(*) AS c FROM expert_rules').get().c;
  if (count > 0) return;

  console.log('[expert-system] База правил пустая — наполняем начальным набором...');

  const rules = [
    // ---- Правила по дате планового ТО ----
    {
      name: 'ТО просрочено',
      condition_type: 'days_until_next_to',
      operator: '<',
      threshold: 0,
      severity: 'critical',
      recommendation: 'Плановое техническое обслуживание просрочено. Требуется немедленное проведение ТО.'
    },
    {
      name: 'ТО приближается',
      condition_type: 'days_until_next_to',
      operator: '<=',
      threshold: 30,
      severity: 'warning',
      recommendation: 'До планового ТО осталось менее 30 дней. Запланируйте проведение работ и подготовьте необходимые комплектующие.'
    },

    // ---- Правила по наработке моточасов ----
    {
      name: 'Высокая наработка моточасов',
      condition_type: 'operating_hours',
      operator: '>',
      threshold: 2500,
      severity: 'warning',
      recommendation: 'Наработка превышает 2500 моточасов. Рекомендуется внеочередной осмотр подшипниковых узлов и проверка изоляции обмоток.'
    },
    {
      name: 'Критическая наработка моточасов',
      condition_type: 'operating_hours',
      operator: '>',
      threshold: 8000,
      severity: 'critical',
      recommendation: 'Наработка превышает 8000 моточасов. Изделие приближается к границе ресурса. Рассмотрите вопрос о замене или капитальном ремонте.'
    },

    // ---- Правила по остатку ресурса ----
    {
      name: 'Низкий остаток ресурса',
      condition_type: 'remaining_resource',
      operator: '<',
      threshold: 5000,
      severity: 'warning',
      recommendation: 'Остаток ресурса менее 5000 часов. Запланируйте процедуры по продлению ресурса или подготовку к замене.'
    },
    {
      name: 'Критически низкий остаток ресурса',
      condition_type: 'remaining_resource',
      operator: '<',
      threshold: 1000,
      severity: 'critical',
      recommendation: 'Остаток ресурса менее 1000 часов. Необходима плановая замена изделия в ближайшее время.'
    },

    // ---- Правила по дням с последнего события ----
    {
      name: 'Давно не было обслуживания',
      condition_type: 'days_since_last_event',
      operator: '>',
      threshold: 180,
      severity: 'info',
      recommendation: 'Более полугода с момента последнего зарегистрированного события. Проверьте актуальность данных и проведите осмотр.'
    },

    // ---- Информационное правило по дням в работе ----
    {
      name: 'Длительная эксплуатация',
      condition_type: 'working_days',
      operator: '>',
      threshold: 1825,  // 5 лет
      severity: 'info',
      recommendation: 'Изделие в эксплуатации более 5 лет. Рекомендуется углублённая диагностика технического состояния.'
    },
  ];

  const insert = db.prepare(`
    INSERT INTO expert_rules (name, condition_type, operator, threshold, severity, recommendation, is_active)
    VALUES (?, ?, ?, ?, ?, ?, 1)
  `);

  const insertMany = db.transaction((rules) => {
    for (const r of rules) {
      insert.run(r.name, r.condition_type, r.operator, r.threshold, r.severity, r.recommendation);
    }
  });
  insertMany(rules);

  console.log(`[expert-system] Загружено ${rules.length} правил.`);
}

module.exports = {
  evaluateProduct,
  seedRulesIfEmpty
};