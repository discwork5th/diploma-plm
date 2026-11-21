// ============================================================================
// guards.js — защита публичного демо
// ----------------------------------------------------------------------------
// Сайт открыт в интернет без входа, поэтому:
//
// 1. llmLimit — ограничение запросов к ИИ. Каждый вопрос помощнику стоит
//    денег на балансе RouterAI/DeepSeek. Без лимита любой (или бот) может
//    отправлять запросы в цикле и сжечь баланс. Два ограничения:
//      * на один IP-адрес: LLM_LIMIT_PER_HOUR в час (по умолчанию 30);
//      * на весь сайт: LLM_LIMIT_PER_DAY в сутки (по умолчанию 400).
//    Счётчики в памяти: после перезапуска обнуляются, для демо этого хватает.
//
// 2. readOnly — режим «только просмотр» (DEMO_READONLY=true в .env):
//    запросы, меняющие данные (POST/PUT/PATCH/DELETE), кроме вопросов
//    ИИ-помощнику, отклоняются. Чтобы случайный посетитель не удалил каталог.
// ============================================================================

const HOUR = 3600000;
const perIp = new Map();     // ip -> [время запроса, ...] за последний час
let day = { start: Date.now(), count: 0 };

function llmLimit(req, res, next) {
  const perHour = Number(process.env.LLM_LIMIT_PER_HOUR) || 30;
  const perDay = Number(process.env.LLM_LIMIT_PER_DAY) || 400;
  const now = Date.now();
  if (now - day.start > 24 * HOUR) day = { start: now, count: 0 };
  const recent = (perIp.get(req.ip) || []).filter(t => now - t < HOUR);
  if (recent.length >= perHour) {
    return res.status(429).json({ error: `Слишком много вопросов с вашего адреса: не больше ${perHour} в час. Попробуйте позже.` });
  }
  if (day.count >= perDay) {
    return res.status(429).json({ error: 'Дневной лимит вопросов к ИИ на этом демо исчерпан. Попробуйте завтра.' });
  }
  recent.push(now);
  perIp.set(req.ip, recent);
  day.count++;
  // Чистим старые записи, чтобы карта не росла бесконечно
  if (perIp.size > 5000) for (const [ip, list] of perIp) if (!list.some(t => now - t < HOUR)) perIp.delete(ip);
  next();
}

const WRITE = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);
function readOnly(req, res, next) {
  if (process.env.DEMO_READONLY !== 'true' || !WRITE.has(req.method)) return next();
  if (req.path.startsWith('/assistant/')) return next();     // вопросы помощнику — это чтение
  res.status(403).json({ error: 'Демо-режим «только просмотр»: изменять данные на этом сайте нельзя.' });
}

module.exports = { llmLimit, readOnly, _reset: () => { perIp.clear(); day = { start: Date.now(), count: 0 }; } };
