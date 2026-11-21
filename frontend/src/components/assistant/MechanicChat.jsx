import { useEffect, useRef, useState } from 'react';
import { Bot, Send, RefreshCw, Wrench, ChevronDown, ChevronRight, Info, User } from 'lucide-react';
import { api } from '../../api/client';

// Вопросы-примеры: показывают, что помощник умеет вызывать разные инструменты
const EXAMPLES = [
  'Какое оборудование требует ТО в ближайшие две недели?',
  'Есть ли в резерве насос на замену с подачей от 8 м³/ч?',
  'Что у нас в критическом состоянии в Цехе №2?',
  'Сколько единиц оборудования по местам установки?'
];

// Человеческие названия инструментов для блока «Ход работы»
const TOOL_LABELS = {
  search_equipment: 'Поиск по парку',
  maintenance_plan: 'План ТО',
  find_reserve: 'Поиск замены в резерве',
  fleet_stats: 'Сводка по парку',
  get_equipment: 'Карточка изделия'
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

const MechanicChat = ({ status, onOpenProduct }) => {
  const [messages, setMessages] = useState([]);   // {role, content, trace?, products?, notice?}
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const endRef = useRef(null);

  useEffect(() => { endRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' }); }, [messages, loading]);

  const send = async (text = input) => {
    const q = text.trim();
    if (!q || loading) return;
    const next = [...messages, { role: 'user', content: q }];
    setMessages(next);
    setInput('');
    setLoading(true);
    setError('');
    try {
      // На сервер уходят только тексты реплик: ход работы и карточки — для экрана
      const res = await api.chatAssistant(next.map(m => ({ role: m.role, content: m.content })));
      setMessages([...next, { role: 'assistant', content: res.answer, trace: res.trace, products: res.products, notice: res.notice }]);
    } catch (err) {
      setError(err.message === 'SERVER_UNAVAILABLE' ? 'Сервер недоступен.' : err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-4">
      {messages.length === 0 && (
        <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6">
          <p className="text-slate-600 mb-4">
            Помощник отвечает по данным парка оборудования: сам выбирает, какие запросы к базе сделать,
            и показывает их в «Ходе работы». Номера вида <span className="px-1.5 rounded bg-blue-50 text-blue-700 text-xs font-medium">#12</span> открывают карточку изделия.
          </p>
          <div className="flex flex-wrap gap-2">
            {EXAMPLES.map(ex => (
              <button key={ex} onClick={() => send(ex)}
                className="text-sm px-3 py-1.5 rounded-full bg-slate-100 text-slate-700 hover:bg-slate-200 transition-colors text-left">
                {ex}
              </button>
            ))}
          </div>
        </div>
      )}

      {messages.map((m, i) => (
        <div key={i} className={`flex gap-3 ${m.role === 'user' ? 'justify-end' : ''}`}>
          {m.role === 'assistant' && <Bot className="w-8 h-8 p-1.5 rounded-full bg-blue-600 text-white flex-shrink-0" />}
          <div className={`max-w-3xl rounded-xl px-4 py-3 ${m.role === 'user' ? 'bg-blue-600 text-white' : 'bg-white border border-slate-200 shadow-sm'}`}>
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
          </div>
          {m.role === 'user' && <User className="w-8 h-8 p-1.5 rounded-full bg-slate-200 text-slate-600 flex-shrink-0" />}
        </div>
      ))}

      {loading && (
        <div className="flex gap-3 items-center text-slate-500">
          <RefreshCw className="w-5 h-5 animate-spin text-blue-500" />
          {status?.llm ? 'Помощник обращается к базе и думает…' : 'Ищу по парку…'}
        </div>
      )}
      {error && <div className="bg-red-50 border border-red-200 text-red-800 rounded-xl p-4">{error}</div>}
      <div ref={endRef} />

      <form onSubmit={(e) => { e.preventDefault(); send(); }}
        className="sticky bottom-4 flex gap-3 bg-white rounded-xl shadow-md border border-slate-200 p-3">
        <input value={input} onChange={(e) => setInput(e.target.value)} maxLength={1000}
          placeholder="Спросите про оборудование, ТО, резерв…"
          className="flex-1 px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent" />
        <button type="submit" disabled={loading || !input.trim()}
          className="flex items-center gap-2 px-5 py-2 btn-primary text-white rounded-lg font-medium disabled:opacity-50">
          <Send className="w-4 h-4" /> Спросить
        </button>
        {messages.length > 0 && (
          <button type="button" onClick={() => { setMessages([]); setError(''); }}
            className="px-3 py-2 text-slate-500 hover:text-slate-700 text-sm">Новый диалог</button>
        )}
      </form>
    </div>
  );
};

export default MechanicChat;
