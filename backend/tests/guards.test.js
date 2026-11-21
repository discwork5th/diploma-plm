// Тесты защиты демо: лимит запросов к ИИ и режим «только просмотр»
const test = require('node:test');
const assert = require('node:assert');
const guards = require('../guards');

const run = (mw, req) => {
  let status = 200, nexted = false;
  const res = { status(c) { status = c; return this; }, json() { return this; } };
  mw(req, res, () => { nexted = true; });
  return nexted ? 'next' : status;
};

test('лимит запросов к ИИ с одного адреса', () => {
  guards._reset();
  process.env.LLM_LIMIT_PER_HOUR = '3';
  const req = { ip: '1.2.3.4' };
  assert.deepStrictEqual([1, 2, 3, 4].map(() => run(guards.llmLimit, req)), ['next', 'next', 'next', 429]);
  assert.strictEqual(run(guards.llmLimit, { ip: '5.6.7.8' }), 'next');   // у другого адреса свой счёт
  delete process.env.LLM_LIMIT_PER_HOUR;
});

test('только просмотр: запись запрещена, чтение и вопросы помощнику — нет', () => {
  process.env.DEMO_READONLY = 'true';
  assert.strictEqual(run(guards.readOnly, { method: 'DELETE', path: '/products/5' }), 403);
  assert.strictEqual(run(guards.readOnly, { method: 'GET', path: '/products' }), 'next');
  assert.strictEqual(run(guards.readOnly, { method: 'POST', path: '/assistant/chat' }), 'next');
  delete process.env.DEMO_READONLY;
  assert.strictEqual(run(guards.readOnly, { method: 'DELETE', path: '/products/5' }), 'next');
});
