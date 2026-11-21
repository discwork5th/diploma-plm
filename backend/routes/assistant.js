// ============================================================================
// Маршруты ИИ-подбора оборудования
//   GET  /api/assistant/status     — подключена ли языковая модель
//   POST /api/assistant/recommend  — { query: "описание задачи" } -> рекомендации
//   POST /api/assistant/chat       — { messages: [{role, content}] } -> ответ помощника
// ============================================================================
const express = require('express');
const assistant = require('../assistant');
const agent = require('../agent');

const router = express.Router();

router.get('/assistant/status', (req, res) => {
  res.json(assistant.status());
});

router.post('/assistant/recommend', async (req, res) => {
  const query = String(req.body?.query || '').trim();
  if (query.length < 3) {
    return res.status(400).json({ error: 'Опишите задачу хотя бы в нескольких словах.' });
  }
  if (query.length > 1000) {
    return res.status(400).json({ error: 'Слишком длинный запрос: уложитесь в 1000 символов.' });
  }
  try {
    res.json(await assistant.recommend(query));
  } catch (err) {
    console.error('[assistant] Ошибка подбора:', err);
    res.status(500).json({ error: 'Не удалось выполнить подбор.' });
  }
});

router.post('/assistant/chat', async (req, res) => {
  const raw = Array.isArray(req.body?.messages) ? req.body.messages : [];
  // Принимаем только реплики пользователя и помощника: системные инструкции
  // задаёт сервер, а не браузер
  const messages = raw
    .filter(m => m && (m.role === 'user' || m.role === 'assistant') && typeof m.content === 'string')
    .map(m => ({ role: m.role, content: m.content.trim().slice(0, 2000) }))
    .filter(m => m.content);
  if (!messages.length || messages[messages.length - 1].role !== 'user') {
    return res.status(400).json({ error: 'Последней репликой должен быть вопрос пользователя.' });
  }
  try {
    res.json(await agent.chat(messages));
  } catch (err) {
    console.error('[agent] Ошибка:', err);
    res.status(500).json({ error: 'Помощник не смог ответить.' });
  }
});

module.exports = router;
