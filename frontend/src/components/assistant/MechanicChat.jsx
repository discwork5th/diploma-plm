import { useEffect, useRef, useState } from 'react';
import { Bot, Send, RefreshCw, Wrench, ChevronDown, ChevronRight, Info, User, HelpCircle, Plus, Trash2 } from 'lucide-react';
import { useChatStore, chatActions } from './chatStore';
import ChatHelp from './ChatHelp';

// Человеческие названия инструментов для блока «Ход работы»
const TOOL_LABELS = {
  search_equipment: 'Поиск по парку',
  maintenance_plan: 'План ТО',
  find_reserve: 'Поиск замены в резерве',
  fleet_stats: 'Сводка по парку',
  get_equipment: 'Карточка изделия',
  live_status: 'Датчики сейчас',
  health_forecast: 'Прогноз ресурса'
};

const SEVERITY_DOT = { normal: 'bg-green-500', info: 'bg-blue-500', warning: 'bg-amber-500', critical: 'bg-red-500' };

// Текст ответа: [#123] превращается в ссылку на карточку, строки «- …» — в список
function AnswerText({ text, onOpen }) {
  const renderInline = (line, key) => {
    const parts = line.split(/(\[#\d+\])/g);
    return (
      <span key={key}>
        {parts.map((part, i) => {
          const m = part.match(/^\[#(\d+)\]$/);
          if (!m) return part.replace(/\*\*/g, '');
          return (
            <button key={i} onClick={() => onOpen(Number(m[1]))}
              className="mx-0.5 px-1.5 rounded bg-blue-50 text-blue-700 hover:bg-blue-100 text-xs font-medium align-middle">
              #{m[1]}
            </button>
          );
        })}
      </span>
    );
  };
  const lines = String(text).split('\n').filter(l => l.trim());
  return (
    <div className="space-y-1.5 text-slate-800">
      {lines.map((line, i) => {
        const item = line.match(/^\s*(?:[-*•]|\d+[.)])\s+(.*)$/);
        return item
          ? <div key={i} className="flex gap-2 pl-1"><span className="text-slate-400">•</span>{renderInline(item[1], i)}</div>
          : <p key={i}>{renderInline(line, i)}</p>;
      })}
    </div>
  );
}

// Блок «Ход работы»: какие инструменты вызвала модель и с какими аргументами
function Trace({ trace }) {
  const [open, setOpen] = useState(false);
  if (!trace?.length) return null;
  return (
    <div className="mt-3 text-sm">
      <button onClick={() => setOpen(!open)} className="flex items-center gap-1 text-slate-500 hover:text-slate-700">
        {open ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
        <Wrench className="w-4 h-4" /> Ход работы: {trace.length} {trace.length === 1 ? 'запрос' : 'запроса'} к базе
      </button>
      {open && (
        <ol className="mt-2 space-y-1 border-l-2 border-slate-200 pl-3">
          {trace.map((t, i) => (
            <li key={i} className="text-slate-600">
              <span className="font-medium text-slate-700">{TOOL_LABELS[t.tool] || t.tool}</span>
              <code className="ml-2 text-xs bg-slate-100 px-1.5 py-0.5 rounded">{JSON.stringify(t.args)}</code>
              <span className="ml-2 text-slate-400">
                {t.error ? `ошибка: ${t.error}` : `→ найдено: ${t.total}`}
              </span>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}

// Список диалогов: слева на широком экране, сверху — на узком
function History({ chats, activeId, pending, onSelect, onNew, onRemove }) {
  const fmt = (t) => {
    const d = new Date(t), now = new Date();
    return d.toDateString() === now.toDateString()
      ? d.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' })
      : d.toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit' });
  };
  const shown = chats.filter(c => c.messages.length || c.id === activeId);
  return (
    <aside className="bg-white rounded-xl border border-slate-300 p-2 lg:sticky lg:top-4 flex flex-col max-h-[70vh]">
      <button onClick={onNew} className="btn-primary text-white rounded-lg px-3 py-2 text-sm font-medium flex items-center justify-center gap-2 mb-2">
        <Plus className="w-4 h-4" /> Новый диалог
      </button>
      <ul className="overflow-y-auto space-y-0.5 flex lg:block gap-1 lg:gap-0">
        {shown.map(c => (
          <li key={c.id} className="group relative flex-shrink-0 w-56 lg:w-auto">
            <button onClick={() => onSelect(c.id)} aria-current={c.id === activeId}
              className={`w-full text-left rounded-lg px-3 py-2 pr-8 ${c.id === activeId ? 'bg-slate-100' : 'hover:bg-slate-50'}`}>
              <span className="block text-sm text-slate-900 truncate">{c.title || 'Новый диалог'}</span>
              <span className="flex items-center gap-1.5 text-xs text-slate-500">
                {pending[c.id] && <RefreshCw className="w-3 h-3 animate-spin" />}
                {pending[c.id] ? 'ждёт ответа' : `${fmt(c.updatedAt)} · ${Math.ceil(c.messages.length / 2)} вопр.`}
              </span>
            </button>
            {c.messages.length > 0 && (
              <button onClick={() => onRemove(c.id)} aria-label="Удалить диалог" title="Удалить диалог"
                className="absolute right-1.5 top-2 p-1 rounded text-slate-400 opacity-0 group-hover:opacity-100 focus:opacity-100 hover:text-red-700 hover:bg-slate-200">
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            )}
          </li>
        ))}
      </ul>
      <p className="hidden lg:block text-[11px] text-slate-400 px-2 pt-2 mt-auto">История хранится в этом браузере</p>
    </aside>
  );
}

const MechanicChat = ({ status, onOpenProduct, askRequest }) => {
  const { chats, activeId, pending, errors } = useChatStore();
  const chat = chats.find(c => c.id === activeId) || chats[0];
  const messages = chat.messages;
  const loading = Boolean(pending[chat.id]);
  const error = errors[chat.id];
  const [input, setInput] = useState('');
  const [showHelp, setShowHelp] = useState(false);
  const endRef = useRef(null);

  // Вопрос из командной строки (Ctrl+K): новый диалог, отправляем один раз
  const handledAsk = useRef(null);
  useEffect(() => {
    if (!askRequest || handledAsk.current === askRequest) return;
    handledAsk.current = askRequest;
    chatActions.newChat();
    chatActions.send(askRequest.q);
  }, [askRequest]);

  useEffect(() => { endRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' }); }, [messages.length, loading, activeId]);

  const send = (text = input) => {
    if (!text.trim() || loading) return;
    setInput('');
    setShowHelp(false);
    chatActions.send(text);
  };

  return (
    <div className="grid lg:grid-cols-[260px,1fr] gap-4 items-start">
      <History chats={chats} activeId={chat.id} pending={pending}
        onSelect={(id) => { chatActions.select(id); setShowHelp(false); }}
        onNew={() => { chatActions.newChat(); setShowHelp(false); }}
        onRemove={chatActions.remove} />

    <div className="space-y-4 min-w-0">
      {(messages.length === 0 || showHelp) && (
        <ChatHelp llm={Boolean(status?.llm)} onAsk={(q) => send(q)}
          onClose={messages.length ? () => setShowHelp(false) : null} />
      )}

      {messages.map((m, i) => (
        <div key={i} className={`flex gap-3 ${m.role === 'user' ? 'justify-end' : ''}`}>
          {m.role === 'assistant' && <Bot className="w-8 h-8 p-1.5 rounded-full bg-blue-600 text-white flex-shrink-0" />}
          <div className={`max-w-3xl min-w-0 rounded-xl px-4 py-3 ${m.role === 'user' ? 'bg-blue-600 text-white' : 'bg-white border border-slate-200 shadow-sm'}`}>
            {m.role === 'user' ? m.content : <AnswerText text={m.content} onOpen={onOpenProduct} />}
            {m.notice && (
              <p className="mt-2 text-sm text-slate-500 flex items-start gap-1.5"><Info className="w-4 h-4 mt-0.5" />{m.notice}</p>
            )}
            {m.products?.length > 0 && (
              <div className="mt-3 grid sm:grid-cols-2 gap-2">
                {m.products.map(p => (
                  <button key={p.id} onClick={() => onOpenProduct(p.id)}
                    className="text-left text-sm border border-slate-200 rounded-lg px-3 py-2 hover:bg-slate-50">
                    <div className="flex items-center gap-2 font-medium text-slate-800">
                      <span className={`w-2 h-2 rounded-full ${SEVERITY_DOT[p.severity] || 'bg-slate-400'}`} />
                      <span className="truncate">{p.name}</span>
                    </div>
                    <div className="text-slate-500 text-xs mt-0.5 truncate">#{p.id} · {p.stageName} · {p.location || '—'}</div>
                  </button>
                ))}
              </div>
            )}
            {m.role === 'assistant' && <Trace trace={m.trace} />}
            {m.model && <p className="mt-2 text-[11px] text-slate-400">Ответила модель {m.model}</p>}
          </div>
          {m.role === 'user' && <User className="w-8 h-8 p-1.5 rounded-full bg-slate-200 text-slate-600 flex-shrink-0" />}
        </div>
      ))}

      {loading && (
        <div className="flex gap-3 items-center text-slate-500">
          <RefreshCw className="w-5 h-5 animate-spin text-blue-500" />
          {status?.llm ? 'Помощник обращается к базе и думает… Можно уйти в другой раздел — ответ сохранится в этом диалоге.' : 'Ищу по парку…'}
        </div>
      )}
      {error && <div className="bg-red-50 border border-red-200 text-red-800 rounded-xl p-4">{error}</div>}
      {/* Последний вопрос остался без ответа: страницу закрыли или обновили, пока ждали */}
      {!loading && messages.length > 0 && messages[messages.length - 1].role === 'user' && (
        <div className="flex items-center gap-3 text-sm text-slate-600">
          Ответ на этот вопрос не пришёл — страница была закрыта или произошла ошибка.
          <button onClick={() => chatActions.retry()} className="btn-secondary px-3 py-1.5 rounded-lg text-slate-800">Спросить ещё раз</button>
        </div>
      )}
      <div ref={endRef} />

      <form onSubmit={(e) => { e.preventDefault(); send(); }}
        className="sticky bottom-3 flex gap-2 sm:gap-3 bg-white rounded-xl shadow-md border border-slate-200 p-2 sm:p-3">
        <input value={input} onChange={(e) => setInput(e.target.value)} maxLength={1000}
          placeholder="Спросите про оборудование, ТО, резерв…"
          className="flex-1 min-w-0 px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent" />
        <button type="submit" disabled={loading || !input.trim()} aria-label="Спросить"
          className="flex items-center gap-2 px-3 sm:px-5 py-2 btn-primary text-white rounded-lg font-medium disabled:opacity-50">
          <Send className="w-4 h-4" /><span className="hidden sm:inline">Спросить</span>
        </button>
        {messages.length > 0 && (
          <button type="button" onClick={() => setShowHelp(!showHelp)} aria-label="Как спрашивать" title="Как спрашивать"
            className="btn-secondary px-2.5 rounded-lg text-slate-700"><HelpCircle className="w-4 h-4" /></button>
        )}
      </form>
    </div>
    </div>
  );
};

export default MechanicChat;
