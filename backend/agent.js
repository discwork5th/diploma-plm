// ============================================================================
// agent.js — ИИ-помощник главного механика (function calling)
// ----------------------------------------------------------------------------
// В отличие от подбора (assistant.js), где мы сами заранее решаем, какие
// данные дать модели, здесь модель решает это сама. Ей описан набор функций
// («инструментов»): поиск по парку, план ТО, поиск замены в резерве,
// статистика, карточка изделия. Цикл такой:
//
//   1. Отправляем модели вопрос пользователя и описание инструментов.
//   2. Модель отвечает либо текстом (тогда это ответ), либо просьбой вызвать
//      инструмент с аргументами: maintenance_plan({ days: 30 }).
//   3. Код выполняет инструмент — обычный SQL-запрос к базе — и возвращает
//      модели результат. Шаг 2 повторяется, пока модель не ответит текстом
//      (не больше MAX_STEPS раз).
//
// Почему это безопасно и честно:
//   * Модель не видит базу и не пишет SQL. Она может только попросить один
//     из пяти инструментов, а каждый инструмент проверяет свои аргументы.
//   * Все инструменты только читают. Изменить данные модель не может.
//   * Ссылаться на изделия модель может только по id из результатов
//     инструментов: в ответе [#id] превращается в ссылку на карточку,
//     а id, которых не было в результатах, вырезаются.
//   * Ход работы (какие инструменты с какими аргументами вызывались)
//     возвращается на фронтенд и показывается пользователю.
// ============================================================================

const db = require('./database');
const { loadCatalog, searchCatalog, llmConfig, SEVERITY_LABELS } = require('./assistant');
const { evaluateProduct } = require('./expert-system');
const { RESERVE } = require('./demo-fleet');
const telemetry = require('./telemetry');

const MAX_STEPS = 6;            // сколько раз подряд модель может вызвать инструменты
const STEP_TIMEOUT_MS = 90000;  // локальная модель на одном шаге может думать долго
const MAX_ROWS = 15;            // сколько строк максимум отдаёт инструмент
const HISTORY_LIMIT = 10;       // сколько прошлых реплик разговора отправляем модели

const DAY_MS = 24 * 60 * 60 * 1000;
const daysFromToday = (iso) => Math.ceil((new Date(iso).getTime() - Date.now()) / DAY_MS);

// ---------------------------------------------------------------------------
// Вспомогательное: числа из характеристик («6,5 м³/ч» -> 6.5)
// ---------------------------------------------------------------------------
function specNumber(product, keyPart) {
  const key = Object.keys(product.specs).find(k => k.toLowerCase().includes(String(keyPart).toLowerCase()));
  if (!key) return null;
  const m = String(product.specs[key]).replace(',', '.').match(/-?\d+(\.\d+)?/);
  return m ? { key, value: Number(m[0]), text: product.specs[key] } : null;
}

// Компактное описание изделия для модели: ей не нужны картинки и лишние поля
function brief(p) {
  return {
    id: p.id,
    name: p.name,
    serial: p.serialNumber,
    location: p.location || '—',
    stage: p.stageName,
    condition: SEVERITY_LABELS[p.severity] || p.severity,
    specs: p.specs
  };
}

const lower = (s) => String(s || '').toLowerCase();
const matches = (value, filter) => !filter || lower(value).includes(lower(filter));

// Фильтр «состояние» модель может передать словами, приводим к коду
const CONDITION_CODES = {
  critical: 'critical', 'критическое': 'critical', 'критич': 'critical',
  warning: 'warning', 'внимание': 'warning', 'требует внимания': 'warning',
  info: 'info', 'замечания': 'info', normal: 'normal', 'норма': 'normal', 'в норме': 'normal'
};
const STAGE_CODES = {
  operation: 'operation', 'эксплуатация': 'operation', 'в работе': 'operation',
  storage: 'storage', 'резерв': 'storage', 'склад': 'storage',
  maintenance: 'maintenance', 'ремонт': 'maintenance', 'обслуживание': 'maintenance',
  disposal: 'disposal', 'списано': 'disposal', 'утилизация': 'disposal',
  design: 'design', 'проектирование': 'design', production: 'production', 'производство': 'production'
};
const toCode = (map, v) => (v ? map[lower(v).trim()] || null : null);

// ---------------------------------------------------------------------------
// Инструменты. Описание (для модели) и реализация (для кода) рядом.
// ---------------------------------------------------------------------------
const TOOLS = {
  search_equipment: {
    description: 'Поиск оборудования в парке предприятия по описанию и фильтрам. '
      + 'Используй для вопросов «какие у нас есть…», «где стоит…», «найди…».',
    parameters: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'Слова для поиска: «насос скважинный», «вентилятор окрасочная»' },
        type: { type: 'string', description: 'Тип: насосное, компрессорное, электрооборудование, приводная техника, вентиляционное, теплообменное, транспортное' },
        location: { type: 'string', description: 'Часть названия места: «Цех №2», «Котельная», «Водозабор»' },
        stage: { type: 'string', description: 'Этап: эксплуатация, резерв, ремонт, списано' },
        condition: { type: 'string', description: 'Состояние: критическое, требует внимания, в норме' }
      }
    },
    run(args, catalog) {
      let items = args.query ? searchCatalog(args.query, catalog).map(r => r.product) : catalog;
      const stage = toCode(STAGE_CODES, args.stage);
      const condition = toCode(CONDITION_CODES, args.condition);
      items = items.filter(p => matches(p.type, args.type) && matches(p.location, args.location)
        && (!stage || p.stageId === stage) && (!condition || p.severity === condition));
      return { total: items.length, items: items.slice(0, MAX_ROWS).map(brief),
               note: items.length > MAX_ROWS ? `показаны первые ${MAX_ROWS} из ${items.length}` : undefined };
    }
  },

  maintenance_plan: {
    description: 'Оборудование, у которого плановое ТО просрочено или наступает в ближайшие N дней. '
      + 'Отсортировано по дате ТО. Используй для вопросов про ТО, график работ, что обслужить.',
    parameters: {
      type: 'object',
      properties: {
        days: { type: 'integer', description: 'Горизонт в днях, по умолчанию 30' },
        location: { type: 'string', description: 'Ограничить местом установки' },
        type: { type: 'string', description: 'Ограничить типом оборудования' }
      }
    },
    run(args, catalog) {
      const days = Math.min(Math.max(parseInt(args.days, 10) || 30, 1), 365);
      const rows = db.prepare('SELECT product_id, next_to_date FROM maintenance WHERE next_to_date IS NOT NULL').all();
      const due = new Map(rows.map(r => [r.product_id, daysFromToday(r.next_to_date)]));
      const items = catalog
        .filter(p => due.has(p.id) && due.get(p.id) <= days && ['operation', 'maintenance'].includes(p.stageId))
        .filter(p => matches(p.location, args.location) && matches(p.type, args.type))
        .sort((a, b) => due.get(a.id) - due.get(b.id));
      return {
        total: items.length,
        overdue: items.filter(p => due.get(p.id) < 0).length,
        items: items.slice(0, MAX_ROWS).map(p => ({
          ...brief(p), days_until_to: due.get(p.id),
          to_text: due.get(p.id) < 0 ? `просрочено на ${-due.get(p.id)} дн.` : due.get(p.id) === 0 ? 'сегодня' : `через ${due.get(p.id)} дн.`
        })),
        note: items.length > MAX_ROWS ? `показаны первые ${MAX_ROWS} из ${items.length}` : undefined
      };
    }
  },

  find_reserve: {
    description: `Поиск замены в резерве на складе («${RESERVE}»). Можно задать требование к характеристике: `
      + 'например spec="Подача", min=8 — подача не меньше 8. Используй, когда спрашивают про замену или резерв.',
    parameters: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'Что ищем: «насос», «электродвигатель», «преобразователь частоты»' },
        spec: { type: 'string', description: 'Название характеристики: Подача, Напор, Мощность, Давление…' },
        min: { type: 'number', description: 'Минимальное значение характеристики' },
        max: { type: 'number', description: 'Максимальное значение характеристики' }
      },
      required: ['query']
    },
    run(args, catalog) {
      const reserve = catalog.filter(p => p.stageId === 'storage');
      let items = args.query ? searchCatalog(args.query, reserve).map(r => r.product) : reserve;
      if (args.spec && (args.min != null || args.max != null)) {
        items = items.filter(p => {
          const s = specNumber(p, args.spec);
          if (!s) return false;
          return (args.min == null || s.value >= Number(args.min)) && (args.max == null || s.value <= Number(args.max));
        });
        // Ближайшие к требованию — первыми: не ставим насос на 290 м³/ч вместо 8
        items.sort((a, b) => specNumber(a, args.spec).value - specNumber(b, args.spec).value);
      }
      return { total: items.length, items: items.slice(0, MAX_ROWS).map(brief),
               note: items.length ? undefined : 'В резерве подходящего нет.' };
    }
  },

  fleet_stats: {
    description: 'Сводка по парку: сколько единиц по типам, местам установки, этапам или состоянию.',
    parameters: {
      type: 'object',
      properties: {
        group_by: { type: 'string', enum: ['type', 'location', 'stage', 'condition'] },
        type: { type: 'string', description: 'Ограничить типом' },
        location: { type: 'string', description: 'Ограничить местом' }
      },
      required: ['group_by']
    },
    run(args, catalog) {
      const items = catalog.filter(p => matches(p.type, args.type) && matches(p.location, args.location));
      const key = {
        type: p => p.type, location: p => p.location || '—', stage: p => p.stageName,
        condition: p => SEVERITY_LABELS[p.severity] || p.severity
      }[args.group_by] || (p => p.type);
      const counts = {};
      for (const p of items) counts[key(p)] = (counts[key(p)] || 0) + 1;
      return { total: items.length, groups: Object.entries(counts).sort((a, b) => b[1] - a[1]).map(([name, count]) => ({ name, count })) };
    }
  },

  get_equipment: {
    description: 'Полная карточка одного изделия по id: характеристики, место, наработка, ресурс, '
      + 'дата ТО, последние события и выводы экспертной системы.',
    parameters: {
      type: 'object',
      properties: { id: { type: 'integer' } },
      required: ['id']
    },
    run(args, catalog) {
      const p = catalog.find(x => x.id === Number(args.id));
      if (!p) return { error: 'Изделия с таким id нет' };
      const m = db.prepare('SELECT * FROM maintenance WHERE product_id = ?').get(p.id);
      const events = db.prepare(`SELECT event_date AS date, event_name AS event, status, description
        FROM lifecycle_events WHERE product_id = ? ORDER BY event_date DESC LIMIT 5`).all(p.id);
      const evaluation = evaluateProduct(p.id);
      return {
        ...brief(p),
        manufacturer: p.manufacturer,
        maintenance: m ? {
          operating_hours_since_to: m.operating_hours, remaining_resource_h: m.remaining_resource,
          next_to_date: m.next_to_date, days_until_to: m.next_to_date ? daysFromToday(m.next_to_date) : null
        } : null,
        recent_events: events,
        expert_conclusions: evaluation ? evaluation.triggeredRules.map(r => `${r.name}: ${r.recommendation}`) : []
      };
    }
  }
};

// Телеметрия: два инструмента поверх демо-датчиков (telemetry.js)
TOOLS.live_status = {
  description: 'Показания датчиков прямо сейчас: общая нагрузка, тревоги по вибрации (зоны ГОСТ ISO 10816-3: '
    + 'C — ограниченно допустимо, D — недопустимо) и сводка по корпусам. Используй для вопросов «что сейчас», '
    + '«есть ли тревоги», «вибрация», «нагрузка».',
  parameters: { type: 'object', properties: { location: { type: 'string', description: 'Ограничить местом установки' } } },
  run(args, catalog) {
    const snap = telemetry.snapshot();
    const byId = new Map(catalog.map(p => [p.id, p]));
    const alarms = snap.alarms.filter(a => matches(a.location, args.location)).map(a => ({
      ...brief(byId.get(a.id)), vibration_mm_s: a.vibration, zone: a.zone
    }));
    return {
      total: alarms.length,
      plant_load_percent: snap.totalLoad,
      buildings: snap.buildings.filter(b => matches(b.location, args.location)),
      items: alarms
    };
  }
};
TOOLS.health_forecast = {
  description: 'Прогноз остаточного ресурса изделия по id: индекс здоровья, темп износа, через сколько дней '
    + 'дойдёт до порога ремонта (с интервалом). Используй для вопросов «сколько ещё проработает», «прогноз».',
  parameters: { type: 'object', properties: { id: { type: 'integer' } }, required: ['id'] },
  run(args, catalog) {
    const p = catalog.find(x => x.id === Number(args.id));
    if (!p) return { error: 'Изделия с таким id нет' };
    const r = telemetry.healthReport(p.id);
    if (!r.active) return { ...brief(p), note: 'изделие не в работе — прогноза нет' };
    return { ...brief(p), sensors: r.sensors, last_maintenance: r.lastMaintenance, trend: r.trend,
             remaining_days_to_repair_threshold: r.rul };
  }
};

const TOOL_SPECS = Object.entries(TOOLS).map(([name, t]) => ({
  type: 'function',
  function: { name, description: t.description, parameters: t.parameters }
}));

const SYSTEM_PROMPT = `Ты помощник главного механика завода. У тебя есть инструменты для работы с базой
оборудования предприятия. Отвечай ТОЛЬКО на основе результатов инструментов — не придумывай
оборудование, цифры и даты. Если данных не хватает, вызови ещё инструмент или так и скажи.

Правила:
- Когда упоминаешь изделие, ставь после названия его id в формате [#123] — это станет ссылкой.
  Используй только id из результатов инструментов.
- При подборе замены сравнивай характеристики с требованием и предупреждай о сильном запасе
  (насос на 290 м³/ч вместо 8 — плохая замена).
- Если изделие в критическом состоянии или ТО просрочено — скажи об этом прямо.
- Отвечай по-русски, коротко: вывод, затем список. Без лишних вступлений.
- Если спрашивают «что сейчас», про вибрацию или тревоги — это live_status; про срок службы — health_forecast.
Сегодня ${new Date().toISOString().slice(0, 10)}.`;

// ---------------------------------------------------------------------------
// Запрос к модели (OpenAI-совместимый /chat/completions с tools)
// ---------------------------------------------------------------------------
async function callModel(cfg, messages) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), STEP_TIMEOUT_MS);
  try {
    const response = await fetch(`${cfg.baseUrl}/chat/completions`, {
      method: 'POST',
      signal: controller.signal,
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${cfg.apiKey}` },
      body: JSON.stringify({ model: cfg.model, temperature: 0.1, messages, tools: TOOL_SPECS, tool_choice: 'auto' })
    });
    if (!response.ok) {
      const body = await response.text().catch(() => '');
      throw new Error(`API модели ответил ${response.status}: ${body.slice(0, 200)}`);
    }
    const data = await response.json();
    const message = data.choices?.[0]?.message;
    if (!message) throw new Error('Пустой ответ модели');
    return message;
  } finally {
    clearTimeout(timer);
  }
}

// Аргументы инструмента приходят строкой JSON; модель может ошибиться в формате
function parseArgs(raw) {
  if (raw && typeof raw === 'object') return raw;
  try { return JSON.parse(raw || '{}') || {}; } catch { return {}; }
}

// Убрать рассуждения модели (<think>…</think> у Qwen) и чужие id из ответа
function cleanAnswer(text, knownIds) {
  return String(text || '')
    .replace(/<think>[\s\S]*?<\/think>/g, '')
    .replace(/\[#(\d+)\]/g, (whole, id) => (knownIds.has(Number(id)) ? whole : ''))
    .trim();
}

// Собрать id всех изделий, встретившихся в результате инструмента
function collectIds(result, into) {
  const walk = (v) => {
    if (Array.isArray(v)) v.forEach(walk);
    else if (v && typeof v === 'object') {
      if (Number.isInteger(v.id) && v.serial !== undefined) into.add(v.id);
      Object.values(v).forEach(walk);
    }
  };
  walk(result);
}

// ---------------------------------------------------------------------------
// Главная функция: история разговора -> ответ + ход работы
// ---------------------------------------------------------------------------
async function chat(history) {
  const cfg = llmConfig();
  const catalog = loadCatalog();
  const lastQuestion = history.filter(m => m.role === 'user').pop()?.content || '';

  if (!cfg) return fallback(lastQuestion, catalog, 'Языковая модель не подключена: показан обычный поиск по парку.');

  const messages = [
    { role: 'system', content: SYSTEM_PROMPT },
    ...history.slice(-HISTORY_LIMIT).map(m => ({ role: m.role, content: String(m.content).slice(0, 2000) }))
  ];
  const trace = [];
  const knownIds = new Set();

  try {
    for (let step = 0; step < MAX_STEPS; step++) {
      const message = await callModel(cfg, messages);
      const calls = message.tool_calls || [];
      if (!calls.length) {
        const answer = cleanAnswer(message.content, knownIds);
        return { mode: 'llm', model: cfg.model, answer: answer || 'Модель не дала ответа.', trace, products: cardsFor(knownIds, catalog, answer) };
      }
      messages.push({ role: 'assistant', content: message.content || '', tool_calls: calls });
      for (const call of calls) {
        const name = call.function?.name;
        const args = parseArgs(call.function?.arguments);
        const tool = TOOLS[name];
        let result;
        try {
          result = tool ? tool.run(args, catalog) : { error: `Инструмента ${name} нет` };
        } catch (err) {
          result = { error: `Ошибка инструмента: ${err.message}` };
        }
        collectIds(result, knownIds);
        trace.push({ tool: name, args, total: result.total ?? (result.error ? 0 : 1), error: result.error || null });
        messages.push({ role: 'tool', tool_call_id: call.id, name, content: JSON.stringify(result) });
      }
    }
    return { mode: 'llm', model: cfg.model, answer: 'Не удалось уложиться в отведённое число шагов. Переформулируйте вопрос точнее.', trace, products: [] };
  } catch (err) {
    console.warn('[agent] Модель недоступна:', err.message);
    return fallback(lastQuestion, catalog, 'Языковая модель сейчас недоступна: показан обычный поиск по парку.');
  }
}

// Карточки изделий для фронтенда: те, на которые модель сослалась в ответе
function cardsFor(knownIds, catalog, answer) {
  const mentioned = new Set([...String(answer).matchAll(/\[#(\d+)\]/g)].map(m => Number(m[1])));
  return catalog.filter(p => mentioned.has(p.id) && knownIds.has(p.id)).map(p => ({
    id: p.id, name: p.name, serialNumber: p.serialNumber, location: p.location,
    stageId: p.stageId, stageName: p.stageName, severity: p.severity, image: p.image
  }));
}

// Без модели: простые правила по ключевым словам выбирают тот же инструмент,
// который выбрала бы модель. Не так гибко, но на сервере без модели помощник
// всё равно отвечает по делу на типовые вопросы.
function fallback(question, catalog, notice) {
  const q = lower(question);
  const toCard = (p) => ({ id: p.id, name: p.name, serialNumber: p.serialNumber, location: p.location,
    stageId: p.stageId, stageName: p.stageName, severity: p.severity, image: p.image });
  const byIds = (items) => items.map(i => catalog.find(p => p.id === i.id)).filter(Boolean).map(toCard);
  const run = (tool, args, answer) => {
    const result = TOOLS[tool].run(args, catalog);
    return { mode: 'search', notice, answer: answer(result),
             trace: [{ tool, args, total: result.total, error: null }], products: byIds(result.items.slice(0, 8)) };
  };

  if (/вибрац|датчик|тревог|нагрузк|сейчас/.test(q)) {
    return run('live_status', {}, r => `Сейчас нагрузка завода ${r.plant_load_percent}%. Тревог по вибрации: ${r.total}.`);
  }
  if (/резерв|склад|замен/.test(q)) {
    // Требование вида «подачей от 8», «мощностью не меньше 15»
    const SPEC_WORDS = { подач: 'Подача', напор: 'Напор', мощн: 'Мощность', давлен: 'давление', производ: 'Производительность' };
    const req = q.match(/(подач|напор|мощн|давлен|производ)[а-яё]*\s+(?:от|не меньше|не менее|>=?)\s*(\d+(?:[.,]\d+)?)/);
    const args = { query: question.split(/\s+/).filter(w => !/^(резерв|склад|замен)/i.test(w) && !/^(есть|ли|на|в|с|от|для)$/i.test(w)).join(' ') };
    if (req) Object.assign(args, { spec: SPEC_WORDS[req[1]], min: Number(req[2].replace(',', '.')) });
    return run('find_reserve', args, r => r.total
      ? `В резерве подходящих по словам запроса: ${r.total}. Характеристики сравните в карточках.`
      : 'В резерве по словам запроса ничего не нашлось.');
  }
  if (/(^|[^а-яё])то([^а-яё]|$)|обслуживан/.test(q)) {
    const days = /недел/.test(q) ? (/две|2/.test(q) ? 14 : 7) : /месяц/.test(q) ? 30 : 30;
    return run('maintenance_plan', { days }, r => `ТО в ближайшие ${days} дней или уже просрочено: ${r.total}, из них просрочено ${r.overdue}.`);
  }
  if (/критич|авари/.test(q)) {
    const num = (q.match(/цех[а-яё]*\s*№?\s*(\d+)/) || [])[1];
    const loc = num ? `Цех №${num}` : undefined;
    return run('search_equipment', { condition: 'критическое', location: loc },
      r => `В критическом состоянии${loc ? ` (${loc})` : ''}: ${r.total}.`);
  }

  const group = /по мест|где стоит|по цех/.test(q) ? 'location' : /по тип/.test(q) ? 'type' : /по этап/.test(q) ? 'stage' : /по состоян/.test(q) ? 'condition' : null;
  if (group) {
    const result = TOOLS.fleet_stats.run({ group_by: group }, catalog);
    return { mode: 'search', notice, products: [], trace: [{ tool: 'fleet_stats', args: { group_by: group }, total: result.total, error: null }],
      answer: `Всего: ${result.total}.\n` + result.groups.map(g => `- ${g.name}: ${g.count}`).join('\n') };
  }

  const found = searchCatalog(question, catalog).slice(0, 8).map(r => r.product);
  return {
    mode: 'search', notice, trace: [],
    answer: found.length ? `Найдено по словам запроса: ${found.length}.` : 'По словам запроса ничего не нашлось.',
    products: found.map(toCard)
  };
}

module.exports = { chat, TOOLS, TOOL_SPECS, cleanAnswer, specNumber };
