// ============================================================================
// telemetry.js — демо-телеметрия и прогноз остаточного ресурса
// ----------------------------------------------------------------------------
// Настоящих датчиков у демо-завода нет, поэтому показания считает модель.
// Она не случайная «пила»: всё выводится из данных паспорта изделия.
//
//  1. Степень износа D (0 — новое, 1 — отказ) — из наработки с последнего ТО,
//     остатка ресурса и того, просрочено ли ТО. Здоровье H = 100·(1 − D).
//  2. Датчики сейчас:
//       вибрация, мм/с   v = 1.1 + 7·D^1.5 + колебания
//       температура, °C T = 30 + 28·нагрузка + 22·D
//       нагрузка, %      по графику смен (днём выше, ночью ниже)
//     Вибрация оценивается по зонам ГОСТ ISO 10816-3 для машин средней
//     мощности: до 2.8 — хорошо, до 4.5 — допустимо, до 7.1 — ограниченно
//     допустимо, выше — недопустимо.
//  3. История здоровья за 120 дней: между ТО износ растёт экспоненциально,
//     плановое ТО из истории изделия возвращает его почти к исходному уровню.
//  4. Прогноз: по точкам за последние 45 дней после ТО строится линейный
//     тренд здоровья (метод наименьших квадратов) и продлевается до порога
//     H = 30 — это остаточный ресурс (RUL); интервал — из ошибки наклона.
//
// Генератор детерминированный: одно и то же изделие в один и тот же момент
// всегда показывает одно и то же, сколько бы вкладок ни было открыто.
// Раз в несколько минут у одного агрегата разыгрывается «скачок вибрации» —
// чтобы в демо было видно, как система ловит тревогу в реальном времени.
// ============================================================================

const db = require('./database');

const DAY = 86400000;
const ZONES = [
  { max: 2.8, code: 'A', label: 'хорошо' },
  { max: 4.5, code: 'B', label: 'допустимо' },
  { max: 7.1, code: 'C', label: 'ограниченно допустимо' },
  { max: Infinity, code: 'D', label: 'недопустимо' }
];
const H_CRITICAL = 30;      // порог здоровья, при котором нужен ремонт
const ACTIVE = ['operation', 'maintenance'];

// Детерминированный «шум»: одинаковый для одинаковых аргументов
function hash(...args) {
  let h = 2166136261;
  for (const ch of args.join('|')) { h ^= ch.charCodeAt(0); h = Math.imul(h, 16777619); }
  return ((h >>> 0) % 100000) / 100000;
}
const noise = (id, k, t) => hash(id, k, Math.floor(t)) * 2 - 1;

// Загрузка по графику смен: две смены с 7 до 23, ночью вполовину
function shiftLoad(id, now) {
  const hour = new Date(now).getHours() + new Date(now).getMinutes() / 60;
  const base = hour >= 7 && hour < 23 ? 0.78 : 0.42;
  return Math.min(1, Math.max(0.1, base + 0.12 * Math.sin(now / 600000 + hash(id, 'ph') * 6) + 0.04 * noise(id, 'ld', now / 5000)));
}

// ---------------------------------------------------------------------------
// Износ сейчас — из паспорта
// ---------------------------------------------------------------------------
function wearNow(p) {
  let d = 0.08 + 0.42 * Math.min(1, (p.operating_hours || 0) / 9000);
  if (p.remaining_resource != null) {
    if (p.remaining_resource < 5000) d += 0.15;
    if (p.remaining_resource < 1000) d += 0.22;
  }
  if (p.next_to_date && new Date(p.next_to_date) < new Date()) d += 0.12;
  return Math.min(0.9, d + 0.04 * hash(p.id, 'w'));
}

// Активный «скачок вибрации»: каждые 4 минуты выбирается один агрегат,
// у которого вибрация полторы минуты держится в недопустимой зоне
function spikeFor(ids, now) {
  if (!ids.length) return null;
  const slot = Math.floor(now / 240000);
  const phase = (now % 240000) / 1000;          // секунд с начала окна
  const id = ids[Math.floor(hash('spike', slot) * ids.length)];
  if (phase < 20 || phase > 110) return null;
  const k = phase < 40 ? (phase - 20) / 20 : phase > 90 ? (110 - phase) / 20 : 1;
  return { id, k };
}

function zoneOf(v) {
  return ZONES.find(z => v <= z.max);
}

// ---------------------------------------------------------------------------
// Снимок всех активных агрегатов
// ---------------------------------------------------------------------------
let cache = { at: 0, rows: null };
function loadRows() {
  // Паспортные данные меняются редко — перечитываем раз в 30 секунд
  if (cache.rows && Date.now() - cache.at < 30000) return cache.rows;
  cache.rows = db.prepare(`
    SELECT p.id, p.name, p.type, p.location, p.serial_number AS serialNumber, p.current_stage_id AS stageId,
           m.operating_hours, m.remaining_resource, m.next_to_date
    FROM products p LEFT JOIN maintenance m ON m.product_id = p.id`).all();
  cache.at = Date.now();
  return cache.rows;
}

function readSensors(p, now, spike) {
  const d = wearNow(p);
  const load = p.stageId === 'maintenance' ? 0 : shiftLoad(p.id, now);
  let v = 1.1 + 7 * Math.pow(d, 1.5) + 0.25 * Math.sin(now / 9000 + hash(p.id, 'v') * 6) + 0.15 * noise(p.id, 'v', now / 2000);
  if (spike && spike.id === p.id) v += 5.2 * spike.k;
  v = Math.max(0.3, v * (0.55 + 0.45 * load));
  const temp = 30 + 28 * load + 22 * d + 1.2 * noise(p.id, 't', now / 4000);
  return {
    vibration: Math.round(v * 10) / 10,
    temperature: Math.round(temp),
    load: Math.round(load * 100),
    health: Math.round(100 * (1 - d)),
    zone: zoneOf(v).code
  };
}

function snapshot(now = Date.now()) {
  const rows = loadRows().filter(p => ACTIVE.includes(p.stageId));
  const spike = spikeFor(rows.filter(p => p.stageId === 'operation').map(p => p.id), now);
  const units = [];
  const buildings = {};
  for (const p of rows) {
    const s = readSensors(p, now, spike);
    units.push({ id: p.id, ...s });
    const b = buildings[p.location] || (buildings[p.location] = { location: p.location, units: 0, load: 0, alarms: 0, warnings: 0 });
    b.units++;
    b.load += s.load;
    if (s.zone === 'D') b.alarms++;
    else if (s.zone === 'C') b.warnings++;
  }
  for (const b of Object.values(buildings)) b.load = Math.round(b.load / b.units);

  const byId = new Map(rows.map(p => [p.id, p]));
  const alarms = units
    .filter(u => u.zone === 'D' || u.zone === 'C')
    .sort((a, b) => b.vibration - a.vibration)
    .slice(0, 12)
    .map(u => ({ id: u.id, name: byId.get(u.id).name, location: byId.get(u.id).location,
                 vibration: u.vibration, zone: u.zone, spike: spike?.id === u.id }));

  const totalLoad = units.length ? Math.round(units.reduce((s, u) => s + u.load, 0) / units.length) : 0;
  return { at: now, totalLoad, units, buildings: Object.values(buildings), alarms };
}

// ---------------------------------------------------------------------------
// История здоровья и прогноз остаточного ресурса одного изделия
// ---------------------------------------------------------------------------
function healthReport(productId, now = Date.now()) {
  const p = loadRows().find(r => r.id === Number(productId));
  if (!p) return null;
  const active = ACTIVE.includes(p.stageId);
  if (!active) return { id: p.id, active: false };

  // Даты плановых ТО и ремонтов из истории изделия — на них износ сбрасывается
  const resets = db.prepare(`SELECT event_date FROM lifecycle_events
    WHERE product_id = ? AND status = 'completed'
      AND (event_name LIKE '%ТО%' OR event_name LIKE '%емонт%' OR event_name LIKE 'Ввод%')
    ORDER BY event_date`).all(p.id).map(r => new Date(r.event_date).getTime());
  const lastReset = resets.filter(t => t <= now).pop() ?? now - 200 * DAY;

  const dNow = wearNow(p);
  const floor = 0.06 + 0.06 * hash(p.id, 'f');        // остаточный износ сразу после ТО
  const since = Math.max(1, (now - lastReset) / DAY);
  // Износ после ТО: D(t) = floor + a·(e^(b·t) − 1); b задаём по изделию,
  // a подбираем так, чтобы сегодня D совпал с износом из паспорта
  const b = 0.006 + 0.01 * hash(p.id, 'b');
  const a = Math.max(0.0005, (dNow - floor) / (Math.exp(b * since) - 1));

  const wearAt = (t) => {
    if (t >= lastReset) return Math.min(0.95, floor + a * (Math.exp(b * (t - lastReset) / DAY) - 1));
    // Прошлые интервалы между ТО: тот же экспоненциальный рост износа,
    // к моменту очередного ТО агрегат доходил до типичного «предремонтного» уровня
    const prev = resets.filter(r => r <= t).pop() ?? (t - 150 * DAY);
    const next = resets.find(r => r > t) ?? lastReset;
    const L = Math.max(1, (next - prev) / DAY), dt = (t - prev) / DAY;
    const dEnd = 0.42 + 0.2 * hash(p.id, next);
    return floor + (dEnd - floor) * (Math.exp(b * dt) - 1) / (Math.exp(b * L) - 1);
  };

  const history = [];
  for (let i = 120; i >= 0; i--) {
    const t = now - i * DAY;
    const d = wearAt(t) + 0.012 * noise(p.id, 'h', t / DAY);
    history.push({ t: new Date(t).toISOString().slice(0, 10), health: Math.round(1000 * (1 - d)) / 10 });
  }

  // Прогноз: линейный тренд здоровья по последним 45 дням после ТО.
  // Наклон и его стандартная ошибка дают срок до порога H = 30 и интервал
  // (±2 стандартные ошибки наклона). Износ на деле растёт с ускорением,
  // поэтому линейный прогноз скорее оптимистичен — так и подписано в интерфейсе.
  const pts = history
    .map((h, i) => ({ x: i - 120, y: h.health }))
    .filter(q => q.x >= -45 && now + q.x * DAY >= lastReset + 3 * DAY);
  let forecast = [], rul = null, trend = 'stable';
  if (pts.length >= 7) {
    const n = pts.length;
    const mx = pts.reduce((s, q) => s + q.x, 0) / n, my = pts.reduce((s, q) => s + q.y, 0) / n;
    const sxx = pts.reduce((s, q) => s + (q.x - mx) ** 2, 0);
    const slope = pts.reduce((s, q) => s + (q.x - mx) * (q.y - my), 0) / sxx;   // % здоровья в день
    const icpt = my - slope * mx;                                                 // здоровье «сегодня» по тренду
    const resid = Math.sqrt(pts.reduce((s, q) => s + (q.y - (icpt + slope * q.x)) ** 2, 0) / Math.max(1, n - 2));
    const se = resid / Math.sqrt(sxx);
    if (slope < -0.02) {
      trend = 'degrading';
      const days = (icpt - H_CRITICAL) / -slope;
      const fast = Math.min(-0.001, slope - 2 * se), slow = Math.min(-0.001, slope + 2 * se);
      const left = Math.max(0, icpt - H_CRITICAL);   // уже ниже порога — ресурс исчерпан
      const est = Math.round(left / -slope);
      rul = {
        days: est,
        low: Math.min(est, Math.round(left / -fast)),
        high: Math.max(est, Math.round(left / -slow)),
        ratePerMonth: Math.round(-slope * 30 * 10) / 10,
        exhausted: left === 0
      };
      for (let x = 0; x <= Math.min(365, Math.max(30, days + 15)); x += 5) {
        forecast.push({ t: new Date(now + x * DAY).toISOString().slice(0, 10), health: Math.max(0, Math.round((icpt + slope * x) * 10) / 10) });
      }
    }
  }

  const sensors = readSensors(p, now, spikeFor(loadRows().filter(r => r.stageId === 'operation').map(r => r.id), now));
  return {
    id: p.id, active: true, sensors, zones: ZONES.map(z => ({ code: z.code, max: Number.isFinite(z.max) ? z.max : null, label: z.label })),
    healthCritical: H_CRITICAL, lastMaintenance: new Date(lastReset).toISOString().slice(0, 10),
    history, forecast, rul, trend
  };
}

module.exports = { snapshot, healthReport, ZONES, zoneOf };
