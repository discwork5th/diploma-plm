import { useSyncExternalStore } from 'react';
import { api } from '../../api/client';

// ============================================================================
// Хранилище диалогов с ИИ-помощником
// ----------------------------------------------------------------------------
// Живёт вне компонентов React, поэтому:
//   * переключение вкладок и разделов не стирает диалог — компонент чата может
//     исчезнуть с экрана, а данные остаются здесь;
//   * ответ, который пришёл, пока пользователь был в другом разделе, всё равно
//     попадает в свой диалог (запрос привязан к id диалога, а не к экрану);
//   * всё сохраняется в localStorage браузера — история переживает обновление
//     страницы и закрытие вкладки. История своя у каждого браузера: на сервер
//     она не уходит.
// Компоненты подписываются через useChatStore() (useSyncExternalStore —
// штатный способ React читать внешнее хранилище).
// ============================================================================

const KEY = 'plm-chats-v1';
const MAX_CHATS = 30;

const newId = () => `c${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
const emptyChat = () => ({ id: newId(), title: '', messages: [], updatedAt: Date.now() });

function load() {
  try {
    const saved = JSON.parse(localStorage.getItem(KEY));
    if (saved?.chats?.length) {
      // Ответы, которых мы не дождались до закрытия вкладки, уже не придут
      return { chats: saved.chats, activeId: saved.activeId || saved.chats[0].id, pending: {}, errors: {} };
    }
  } catch { /* повреждённые данные или запрет хранилища — начинаем с чистого листа */ }
  const first = emptyChat();
  return { chats: [first], activeId: first.id, pending: {}, errors: {} };
}

let state = load();
const listeners = new Set();

function save() {
  try {
    // Пустые диалоги не храним, кроме текущего
    const chats = state.chats.filter(c => c.messages.length || c.id === state.activeId).slice(0, MAX_CHATS);
    localStorage.setItem(KEY, JSON.stringify({ chats, activeId: state.activeId }));
  } catch { /* переполнено или запрещено — работаем без сохранения */ }
}

function set(patch) {
  state = { ...state, ...patch };
  save();
  listeners.forEach(l => l());
}

const updateChat = (id, fn) => set({
  chats: state.chats.map(c => (c.id === id ? { ...fn(c), updatedAt: Date.now() } : c))
    .sort((a, b) => b.updatedAt - a.updatedAt)
});

export const chatActions = {
  select(id) { set({ activeId: id }); },

  newChat() {
    // Если текущий диалог и так пустой — просто остаёмся в нём
    const current = state.chats.find(c => c.id === state.activeId);
    if (current && !current.messages.length) return;
    const chat = emptyChat();
    set({ chats: [chat, ...state.chats], activeId: chat.id });
  },

  remove(id) {
    let chats = state.chats.filter(c => c.id !== id);
    if (!chats.length) chats = [emptyChat()];
    set({ chats, activeId: state.activeId === id ? chats[0].id : state.activeId });
  },

  clearAll() {
    const chat = emptyChat();
    set({ chats: [chat], activeId: chat.id, pending: {}, errors: {} });
  },

  // Повторить последний вопрос, оставшийся без ответа
  retry() {
    const chat = state.chats.find(c => c.id === state.activeId);
    const last = chat?.messages[chat.messages.length - 1];
    if (!last || last.role !== 'user') return;
    updateChat(chat.id, c => ({ ...c, messages: c.messages.slice(0, -1) }));
    this.send(last.content);
  },

  async send(text) {
    const q = text.trim();
    const id = state.activeId;
    if (!q || state.pending[id]) return;
    updateChat(id, c => ({ ...c, title: c.title || q.slice(0, 80), messages: [...c.messages, { role: 'user', content: q }] }));
    set({ pending: { ...state.pending, [id]: true }, errors: { ...state.errors, [id]: '' } });
    const chat = state.chats.find(c => c.id === id);
    try {
      // На сервер уходят только тексты реплик: ход работы и карточки — для экрана
      const res = await api.chatAssistant(chat.messages.map(m => ({ role: m.role, content: m.content })));
      // Диалог могли удалить, пока ждали ответ
      if (state.chats.some(c => c.id === id)) {
        updateChat(id, c => ({ ...c, messages: [...c.messages, { role: 'assistant', content: res.answer, trace: res.trace, products: res.products, notice: res.notice, model: res.model }] }));
      }
    } catch (err) {
      set({ errors: { ...state.errors, [id]: err.message === 'SERVER_UNAVAILABLE' ? 'Сервер недоступен.' : err.message } });
    } finally {
      const pending = { ...state.pending };
      delete pending[id];
      set({ pending });
    }
  }
};

const subscribe = (l) => { listeners.add(l); return () => listeners.delete(l); };
const getSnapshot = () => state;

export function useChatStore() {
  return useSyncExternalStore(subscribe, getSnapshot);
}
