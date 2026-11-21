// Тесты демо-телеметрии: детерминированность, зоны ISO 10816, прогноз ресурса
const test = require('node:test');
const assert = require('node:assert');
const os = require('os');
const path = require('path');
const fs = require('fs');

process.env.DB_PATH = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'plm-tel-')), 'test.db');
const telemetry = require('../telemetry');

test('один и тот же момент — одни и те же показания', () => {
  const t = Date.UTC(2026, 10, 21, 12, 0, 0);
  assert.deepStrictEqual(telemetry.snapshot(t), telemetry.snapshot(t));
});

test('зона вибрации соответствует границам ISO 10816-3', () => {
  assert.strictEqual(telemetry.zoneOf(2.8).code, 'A');
  assert.strictEqual(telemetry.zoneOf(4.4).code, 'B');
  assert.strictEqual(telemetry.zoneOf(7.1).code, 'C');
  assert.strictEqual(telemetry.zoneOf(7.2).code, 'D');
});

test('в снимке только работающее оборудование, сводка по корпусам сходится', () => {
  const s = telemetry.snapshot();
  assert.ok(s.units.length > 150);
  const sum = s.buildings.reduce((n, b) => n + b.units, 0);
  assert.strictEqual(sum, s.units.length);
  for (const u of s.units) assert.ok(u.vibration > 0 && u.load >= 0 && u.load <= 100);
});

test('за 4 минуты хотя бы раз случается скачок вибрации', () => {
  const t0 = Date.UTC(2026, 10, 21, 12, 0, 0);
  let seen = false;
  for (let s = 0; s < 240 && !seen; s += 5) seen = telemetry.snapshot(t0 + s * 1000).alarms.some(a => a.spike);
  assert.ok(seen);
});

test('прогноз: интервал вокруг оценки, у работающего изделия есть история', () => {
  const ids = telemetry.snapshot().units.map(u => u.id);
  const withRul = ids.map(id => telemetry.healthReport(id)).filter(r => r.rul);
  assert.ok(withRul.length > 20);
  for (const r of withRul) {
    assert.strictEqual(r.history.length, 121);
    assert.ok(r.rul.low <= r.rul.days && r.rul.days <= r.rul.high);
  }
});
