// ============================================================================
// Слой работы с API.
// Все обращения к бэкенду вынесены в отдельные функции, чтобы UI-код их вызывал
// единообразно (не разводя fetch'ы по всем компонентам).
// ============================================================================

export const API_BASE = import.meta.env.VITE_API_BASE || '';

async function apiRequest(path, options = {}) {
  let response;
  try {
    response = await fetch(`${API_BASE}${path}`, options);
  } catch (err) {
    throw new Error('SERVER_UNAVAILABLE', { cause: err });
  }
  if (!response.ok) {
    let message = `Ошибка ${response.status}`;
    try {
      const body = await response.json();
      if (body.error) message = body.error;
    } catch { /* тело не JSON — оставляем дефолтное сообщение */ }
    throw new Error(message);
  }
  const text = await response.text();
  return text ? JSON.parse(text) : null;
}

export const api = {
  getProducts: () => apiRequest('/api/products'),
  getProduct: (id) => apiRequest(`/api/products/${id}`),
  createProduct: (product) => apiRequest('/api/products', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(product)
  }),
  updateProduct: (id, product) => apiRequest(`/api/products/${id}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(product)
  }),
  deleteProduct: (id) => apiRequest(`/api/products/${id}`, { method: 'DELETE' }),
  getStages: () => apiRequest('/api/lifecycle-stages'),
  uploadDocument: (productId, file) => {
    const formData = new FormData();
    formData.append('file', file);
    return apiRequest(`/api/products/${productId}/documents`, {
      method: 'POST',
      body: formData
      // ВАЖНО: НЕ ставим Content-Type вручную — fetch сам выставит правильный
      // с boundary для multipart/form-data.
    });
  },
  documentDownloadUrl: (docId) => `${API_BASE}/api/documents/${docId}/download`,
  deleteDocument: (docId) => apiRequest(`/api/documents/${docId}`, { method: 'DELETE' }),
  evaluateProduct: (id) => apiRequest(`/api/products/${id}/evaluate`),

  // Работа с базой правил экспертной системы
  getRules: () => apiRequest('/api/expert-rules'),
  createRule: (rule) => apiRequest('/api/expert-rules', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(rule)
  }),
  updateRule: (id, rule) => apiRequest(`/api/expert-rules/${id}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(rule)
  }),
  deleteRule: (id) => apiRequest(`/api/expert-rules/${id}`, { method: 'DELETE' }),
  toggleRule: (id) => apiRequest(`/api/expert-rules/${id}/toggle`, { method: 'PATCH' }),

  // ИИ-подбор оборудования
  getAssistantStatus: () => apiRequest('/api/assistant/status'),
  recommend: (query) => apiRequest('/api/assistant/recommend', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ query })
  }),

  chatAssistant: (messages) => apiRequest('/api/assistant/chat', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ messages })
  }),

  getHealth: (id) => apiRequest(`/api/products/${id}/health`),

  // Дашборд
  getDashboardSummary: () => apiRequest('/api/dashboard/summary'),
};
