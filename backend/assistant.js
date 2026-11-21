// ============================================================================
// assistant.js — ИИ-подбор оборудования по описанию задачи
// ----------------------------------------------------------------------------
// Схема RAG (retrieval-augmented generation) в два шага:
//
//   1. Поиск (retrieval). Из базы достаём каталог: изделия, характеристики,
//      этап ЖЦ и заключение экспертной системы. Ранжируем изделия по
//      совпадению слов запроса с их описанием.
//   2. Генерация. Лучших кандидатов вместе с запросом отдаём языковой модели.
//      Модель выбирает подходящие изделия ТОЛЬКО из переданного списка и
//      объясняет выбор. Так она опирается на реальные данные каталога,
//      а не придумывает оборудование, которого нет.
//
// Модель подключается через OpenAI-совместимый API. Так умеют и облачные
// сервисы (DeepSeek и другие), и локальные (Ollama, LM Studio), поэтому
// смена модели — это смена трёх переменных окружения, а не кода:
//   LLM_BASE_URL  например https://api.deepseek.com/v1 или http://localhost:11434/v1
//   LLM_API_KEY   ключ (для Ollama можно любой непустой)
//   LLM_MODEL     например deepseek-chat или qwen3:8b
//
// Если модель не настроена или недоступна, подбор работает в запасном
// режиме: возвращает результаты поиска без объяснений модели.
// ============================================================================

const db = require('./database');
const { evaluateProduct } = require('./expert-system');

const MAX_CANDIDATES = 8;      // сколько изделий максимум отдаём модели
const LLM_TIMEOUT_MS = 60000;  // локальная модель на процессоре может думать долго

const SEVERITY_LABELS = {
  normal: 'в норме',
  info: 'есть замечания',
  warning: 'требует внимания',
  critical: 'критическое состояние'
};

// ---------------------------------------------------------------------------
// Шаг 1. Поиск по каталогу
// ---------------------------------------------------------------------------

// Слова, которые ничего не говорят о самом оборудовании
const STOP_WORDS = new Set([
  'нужен', 'нужна', 'нужно', 'нужны', 'надо', 'для', 'под', 'чтобы', 'что', 'как', 'какой',
  'какая', 'какое', 'есть', 'или', 'это', 'мне', 'нам', 'нас', 'мы', 'на', 'в', 'с', 'и',
  'по', 'до', 'от', 'из', 'не', 'а', 'но', 'же', 'бы', 'ли', 'у', 'о', 'к', 'за', 'при',
  'подобрать', 'подберите', 'подбери', 'найти', 'найди', 'хочу', 'можно', 'нибудь',
  'оборудование', 'оборудования', 'час', 'метров', 'метра', 'около', 'примерно'
]);

// Предметные синонимы: слова из запросов -> слова, которые встречаются в каталоге.
// Пользователь пишет «качать воду из скважины», а в каталоге «насос скважинный».
const SYNONYMS = {
  вода: ['насос'], воду: ['насос'], воды: ['насос'], качать: ['насос'], перекачка: ['насос'],
  скважина: ['скважинный', 'эцв'], скважины: ['скважинный', 'эцв'], скважину: ['скважинный', 'эцв'],
  воздух: ['компрессор', 'вентилятор'], пневматика: ['компрессор'], пневмосеть: ['компрессор'],
  сжатый: ['компрессор'], вентиляция: ['вентилятор'], вытяжка: ['вентилятор'],
  отопление: ['теплообменник'], нагрев: ['теплообменник'], подогрев: ['теплообменник'], гвс: ['теплообменник'],
  транспортировка: ['конвейер'], перемещение: ['конвейер'], лента: ['конвейер'],
  мотор: ['электродвигатель'], двигатель: ['электродвигатель'],
  частота: ['преобразователь'], регулирование: ['преобразователь'], плавный: ['преобразователь'],
  реагенты: ['дозировочный'], дозирование: ['дозировочный'],
  привод: ['редуктор', 'электродвигатель']
};

// Грубый «стеммер»: приводим слово к началу в 5 букв, чтобы «насосы»,
// «насосом» и «насосный» совпадали. Для каталога из десятков позиций этого
// хватает; на большом каталоге здесь были бы векторные эмбеддинги.
const stem = (w) => (w.length > 5 ? w.slice(0, 5) : w);

function tokenize(text) {
  return String(text || '')
    .toLowerCase()
    .replace(/ё/g, 'е')
    .split(/[^a-zа-я0-9]+/)
    .filter(w => w.length > 1 && !STOP_WORDS.has(w));
}

function expandQuery(text) {
  const words = tokenize(text);
  const expanded = new Set(words);
  for (const w of words) {
    for (const [key, extra] of Object.entries(SYNONYMS)) {
      if (stem(key) === stem(w)) extra.forEach(e => expanded.add(e));
    }
  }
  return [...expanded].map(stem);
}

// Каталог в виде, удобном и для поиска, и для передачи модели
function loadCatalog() {
  const products = db.prepare(`
    SELECT p.id, p.name, p.type, p.manufacturer, p.serial_number AS serialNumber,
           p.current_stage_id AS stageId, s.name AS stageName, p.image_path AS image, p.location
    FROM products p JOIN lifecycle_stages s ON s.id = p.current_stage_id
  `).all();
  const specsStmt = db.prepare('SELECT key, value FROM specifications WHERE product_id = ? ORDER BY order_num, id');

  return products.map(p => {
    const specs = Object.fromEntries(specsStmt.all(p.id).map(r => [r.key, r.value]));
    const evaluation = evaluateProduct(p.id);
    return { ...p, specs, severity: evaluation ? evaluation.overallSeverity : 'normal',
             triggered: evaluation ? evaluation.triggeredRules.map(r => r.name) : [] };
  });
}

// Насколько изделие подходит под запрос: совпадения в названии и типе весят
// больше, чем в характеристиках. Списанное и проектируемое оборудование
// подобрать «в работу» нельзя, поэтому оно опускается вниз.
function scoreProduct(product, queryStems) {
  const strong = new Set(tokenize(`${product.name} ${product.type}`).map(stem));
  const weak = new Set(tokenize(`${product.manufacturer} ${Object.entries(product.specs).flat().join(' ')}`).map(stem));
  let score = 0;
  const matched = [];
  for (const q of new Set(queryStems)) {
    if (strong.has(q)) { score += 3; matched.push(q); }
    else if (weak.has(q)) { score += 1; matched.push(q); }
  }
  if (score > 0 && (product.stageId === 'disposal' || product.stageId === 'design')) score -= 2;
  return { score, matched };
}

function searchCatalog(query, catalog) {
  const queryStems = expandQuery(query);
  return catalog
    .map(p => ({ product: p, ...scoreProduct(p, queryStems) }))
    .filter(r => r.score > 0)
    .sort((a, b) => b.score - a.score);
}

// ---------------------------------------------------------------------------
// Шаг 2. Генерация ответа моделью
// ---------------------------------------------------------------------------

function llmConfig() {
  const { LLM_BASE_URL, LLM_API_KEY, LLM_MODEL } = process.env;
  if (!LLM_BASE_URL || !LLM_MODEL) return null;
  return { baseUrl: LLM_BASE_URL.replace(/\/+$/, ''), apiKey: LLM_API_KEY || 'none', model: LLM_MODEL };
}

const SYSTEM_PROMPT = `Ты инженер по подбору промышленного оборудования. Тебе дают запрос пользователя
и список изделий из каталога предприятия. Выбирай изделия ТОЛЬКО из этого списка, ничего не выдумывай.
Сравнивай требования из запроса с характеристиками изделий (подача, напор, давление, мощность и т.д.).
Учитывай состояние: изделие в критическом состоянии, в ремонте, на этапе проектирования или списанное
рекомендовать в работу нельзя, но можно упомянуть с оговоркой.
Если подходящего изделия нет, честно скажи об этом и объясни, чего не хватает.
Если в запросе мало данных для подбора, задай один уточняющий вопрос.
Отвечай по-русски, кратко и по делу.
Верни строго JSON без пояснений вокруг:
{"summary": "общий вывод в 1-2 предложения",
 "recommendations": [{"id": <id изделия из списка>, "fit": "high" | "medium" | "low", "reason": "почему подходит или чем не подходит"}],
 "clarifyingQuestion": "уточняющий вопрос или null"}`;

function describeForModel(p) {
  const specs = Object.entries(p.specs).map(([k, v]) => `${k}: ${v}`).join('; ');
  return `id=${p.id} | ${p.name} | тип: ${p.type} | этап ЖЦ: ${p.stageName} | состояние: ${SEVERITY_LABELS[p.severity] || p.severity} | ${specs}`;
}

// Модели иногда оборачивают JSON в ```json ... ``` или добавляют текст вокруг
function extractJson(text) {
  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  if (start === -1 || end <= start) throw new Error('Модель вернула ответ не в формате JSON');
  return JSON.parse(text.slice(start, end + 1));
}

async function askModel(cfg, query, candidates) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), LLM_TIMEOUT_MS);
  try {
    const response = await fetch(`${cfg.baseUrl}/chat/completions`, {
      method: 'POST',
      signal: controller.signal,
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${cfg.apiKey}` },
      body: JSON.stringify({
        model: cfg.model,
        temperature: 0.2,
        response_format: { type: 'json_object' },
        messages: [
          { role: 'system', content: SYSTEM_PROMPT },
          {
            role: 'user',
            content: `Запрос: ${query}\n\nИзделия из каталога:\n${candidates.map(describeForModel).join('\n')}`
          }
        ]
      })
    });
    if (!response.ok) {
      const body = await response.text().catch(() => '');
      throw new Error(`API модели ответил ${response.status}: ${body.slice(0, 200)}`);
    }
    const data = await response.json();
    return extractJson(data.choices?.[0]?.message?.content || '');
  } finally {
    clearTimeout(timer);
  }
}

// ---------------------------------------------------------------------------
// Публичная функция: запрос -> рекомендации
// ---------------------------------------------------------------------------

const toCard = (p) => ({
  id: p.id, name: p.name, type: p.type, serialNumber: p.serialNumber,
  stageId: p.stageId, stageName: p.stageName, severity: p.severity, image: p.image, specs: p.specs
});

async function recommend(query) {
  const catalog = loadCatalog();
  const found = searchCatalog(query, catalog);
  const cfg = llmConfig();

  // Кандидаты для модели: найденные поиском, а если поиск ничего не нашёл
  // (запрос сформулирован необычно), то весь рабочий каталог, пока он небольшой.
  const pool = found.length
    ? found.map(r => r.product)
    : catalog.filter(p => p.stageId !== 'disposal');
  const candidates = pool.slice(0, MAX_CANDIDATES);

  if (cfg && candidates.length) {
    try {
      const answer = await askModel(cfg, query, candidates);
      const byId = new Map(candidates.map(p => [p.id, p]));
      const recommendations = (answer.recommendations || [])
        .filter(r => byId.has(Number(r.id)))   // отбрасываем id, которых не было в списке
        .map(r => ({ ...toCard(byId.get(Number(r.id))), fit: r.fit || 'medium', reason: r.reason || '' }));
      return {
        mode: 'llm',
        model: cfg.model,
        summary: answer.summary || '',
        clarifyingQuestion: answer.clarifyingQuestion || null,
        recommendations
      };
    } catch (err) {
      console.warn('[assistant] Модель недоступна, отвечаем поиском:', err.message);
      return fallback(found, 'Языковая модель сейчас недоступна. Показаны результаты поиска по каталогу без объяснений.');
    }
  }

  return fallback(found, cfg ? null : 'Языковая модель не подключена. Показаны результаты поиска по каталогу без объяснений.');
}

function fallback(found, notice) {
  return {
    mode: 'search',
    notice,
    summary: found.length
      ? `Найдено подходящих изделий: ${found.length}.`
      : 'По запросу ничего не нашлось. Попробуйте описать задачу другими словами: что нужно перекачивать, перемещать или приводить в движение.',
    clarifyingQuestion: null,
    recommendations: found.slice(0, MAX_CANDIDATES).map(r => ({
      ...toCard(r.product),
      fit: r.score >= 6 ? 'high' : r.score >= 3 ? 'medium' : 'low',
      reason: ''
    }))
  };
}

function status() {
  const cfg = llmConfig();
  return { llm: Boolean(cfg), model: cfg ? cfg.model : null };
}

module.exports = { recommend, status, searchCatalog, loadCatalog, llmConfig, SEVERITY_LABELS };
