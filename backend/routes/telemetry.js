// ============================================================================
// Маршруты телеметрии
//   GET /api/telemetry/snapshot      — показания всех агрегатов сейчас
//   GET /api/telemetry/stream        — то же потоком (Server-Sent Events) раз в 2 с
//   GET /api/products/:id/health     — история здоровья и прогноз ресурса
//
// Server-Sent Events: браузер открывает одно долгое HTTP-соединение, а сервер
// пишет в него строки «data: {...}» по мере готовности. Проще WebSocket и
// работает через обычный обратный прокси (Caddy) без настройки.
// ============================================================================
const express = require('express');
const telemetry = require('../telemetry');

const router = express.Router();
const INTERVAL_MS = 2000;

router.get('/telemetry/snapshot', (req, res) => {
  res.json(telemetry.snapshot());
});

router.get('/telemetry/stream', (req, res) => {
  res.set({
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache, no-transform',
    Connection: 'keep-alive',
    'X-Accel-Buffering': 'no'
  });
  res.flushHeaders();
  // Браузер переподключится сам; подсказываем ему паузу 3 с
  res.write('retry: 3000\n\n');
  const send = () => res.write(`data: ${JSON.stringify(telemetry.snapshot())}\n\n`);
  send();
  const timer = setInterval(send, INTERVAL_MS);
  req.on('close', () => clearInterval(timer));
});

router.get('/products/:id/health', (req, res) => {
  const report = telemetry.healthReport(req.params.id);
  if (!report) return res.status(404).json({ error: 'Изделие не найдено' });
  res.json(report);
});

module.exports = router;
