// Тесты ИИ-помощника: инструменты на демо-базе и цикл вызовов с моделью-заглушкой.
// Сеть и настоящая модель не нужны. Запуск: npm test
const test = require('node:test');
const assert = require('node:assert');
const os = require('os');
const path = require('path');
const fs = require('fs');

// Отдельная временная база с демо-парком
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'plm-'));
process.env.DB_PATH = path.join(dir, 'test.db');
process.env.LLM_BASE_URL = 'http://model.test/v1';
process.env.LLM_MODEL = 'fake';

const { seedRulesIfEmpty } = require('../expert-system');
seedRulesIfEmpty();
const agent = require('../agent');
const { loadCatalog } = require('../assistant');
const catalog = loadCatalog();

test('демо-парк большой и в нём есть резерв', () => {
  assert.ok(catalog.length > 200);
  assert.ok(catalog.some(p => p.stageId === 'storage'));
});

test('find_reserve: только склад, требование по характеристике, ближайшие первыми', () => {
  const r = agent.TOOLS.find_reserve.run({ query: 'насос', spec: 'Подача', min: 8 }, catalog);
  assert.ok(r.total > 0);
  const values = r.items.map(i => agent.specNumber({ specs: i.specs }, 'Подача').value);
  assert.ok(values.every(v => v >= 8));
  assert.deepStrictEqual(values, [...values].sort((a, b) => a - b));
  assert.ok(r.items.every(i => i.stage.startsWith('Резерв')));
});

test('maintenance_plan: отсортировано по сроку, просроченные считаются', () => {
  const r = agent.TOOLS.maintenance_plan.run({ days: 30 }, catalog);
  const d = r.items.map(i => i.days_until_to);
  assert.deepStrictEqual(d, [...d].sort((a, b) => a - b));
  assert.ok(r.items.filter(i => i.days_until_to < 0).every(i => i.to_text.startsWith('просрочено')));
});

test('чужие id из ответа модели вырезаются', () => {
  assert.strictEqual(agent.cleanAnswer('<think>x</think>Насос [#5] и [#777]', new Set([5])), 'Насос [#5] и');
});

test('цикл: модель вызывает инструмент, потом отвечает', async () => {
  const calls = [];
  global.fetch = async (url, opts) => {
    const body = JSON.parse(opts.body);
    calls.push(body);
    const last = body.messages[body.messages.length - 1];
    const message = last.role === 'user'
      ? { role: 'assistant', content: '', tool_calls: [{ id: 't1', type: 'function',
          function: { name: 'fleet_stats', arguments: '{"group_by":"stage"}' } }] }
      : { role: 'assistant', content: 'Всего ' + JSON.parse(last.content).total };
    return { ok: true, json: async () => ({ choices: [{ message }] }) };
  };
  const res = await agent.chat([{ role: 'user', content: 'Сколько оборудования?' }]);
  assert.strictEqual(res.mode, 'llm');
  assert.strictEqual(res.trace[0].tool, 'fleet_stats');
  assert.strictEqual(res.answer, `Всего ${catalog.length}`);
  assert.ok(calls[0].tools.length === 5);            // модели описаны все инструменты
  assert.strictEqual(calls[1].messages.at(-1).role, 'tool');
});

test('модель недоступна — отвечаем обычным поиском', async () => {
  global.fetch = async () => { throw new Error('ECONNREFUSED'); };
  const res = await agent.chat([{ role: 'user', content: 'насос скважинный' }]);
  assert.strictEqual(res.mode, 'search');
  assert.ok(res.products.length > 0);
});
