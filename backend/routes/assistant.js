// ============================================================================
// Маршруты ИИ-подбора оборудования
//   GET  /api/assistant/status     — подключена ли языковая модель
//   POST /api/assistant/recommend  — { query: "описание задачи" } -> рекомендации
// ============================================================================
const express = require('express');
const assistant = require('../assistant');

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

module.exports = router;
