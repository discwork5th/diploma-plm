import { useEffect, useState } from 'react';
import { Sparkles, Send, RefreshCw, Info, HelpCircle, ArrowRight, Search, MapPin, History, X } from 'lucide-react';
import { api } from '../api/client';
import ProductImage from '../components/common/ProductImage';
import MechanicChat from '../components/assistant/MechanicChat';

// Примеры запросов: подставляются в поле одним кликом
const EXAMPLES = [
  'Нужен насос для скважины глубиной около 60 м, подача 8 м³/ч',
  'Чем подать сжатый воздух 8 бар на пневмоинструмент в цех?',
  'Нужно плавно регулировать скорость двигателя насоса',
  'Перемещать коробки с участка упаковки на отгрузку'
];

// Недавние запросы подбора: хранятся в браузере, повторяются одним кликом.
// Подбор — разовый вопрос «что взять под задачу», поэтому полноценная история
// диалогов (как в чате механика) тут лишняя: достаточно не перепечатывать запрос
const RECENT_KEY = 'plm-recommend-recent-v1';
const loadRecent = () => {
  try { const v = JSON.parse(localStorage.getItem(RECENT_KEY)); return Array.isArray(v) ? v.slice(0, 6) : []; }
  catch { return []; }
};
const saveRecent = (list) => { try { localStorage.setItem(RECENT_KEY, JSON.stringify(list)); } catch { /* приватный режим */ } };

const FIT_STYLES = {
  high: { label: 'Подходит', className: 'bg-green-100 text-green-800' },
  medium: { label: 'Частично подходит', className: 'bg-amber-100 text-amber-800' },
  low: { label: 'Слабое совпадение', className: 'bg-slate-100 text-slate-600' }
};

const SEVERITY_BADGES = {
  normal: { label: 'В норме', className: 'bg-green-50 text-green-700 border-green-200' },
  info: { label: 'Есть замечания', className: 'bg-blue-50 text-blue-700 border-blue-200' },
  warning: { label: 'Требует внимания', className: 'bg-amber-50 text-amber-700 border-amber-200' },
  critical: { label: 'Критическое состояние', className: 'bg-red-50 text-red-700 border-red-200' }
};

// Карточка рекомендованного изделия
const RecommendationCard = ({ item, getStageStyle, onOpen }) => {
  const fit = FIT_STYLES[item.fit] || FIT_STYLES.medium;
  const severity = SEVERITY_BADGES[item.severity] || SEVERITY_BADGES.normal;
  const specs = Object.entries(item.specs || {}).slice(0, 4);
  return (
    <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden flex flex-col sm:flex-row">
      <ProductImage src={item.image} alt={item.name} className="w-full sm:w-48 h-40 sm:h-auto object-contain bg-slate-50 p-2 flex-shrink-0" />
      <div className="p-5 flex-1 min-w-0">
        <div className="flex flex-wrap gap-2 mb-2">
          <span className={`px-2.5 py-0.5 rounded-full text-xs font-semibold ${fit.className}`}>{fit.label}</span>
          <span className={`px-2.5 py-0.5 rounded-full text-xs font-medium ${getStageStyle(item.stageId).badge}`}>{item.stageName}</span>
          <span className={`px-2.5 py-0.5 rounded-full text-xs font-medium border ${severity.className}`}>{severity.label}</span>
        </div>
        <h3 className="font-bold text-lg text-slate-800">{item.name}</h3>
        <p className="text-sm text-slate-500 mb-3 flex flex-wrap items-center gap-x-1.5">
          <span>{item.type} • S/N {item.serialNumber}</span>
          {item.location && <span className="inline-flex items-center gap-1"><MapPin className="w-3.5 h-3.5" />{item.location}</span>}
        </p>
        {item.reason && (
          <p className="text-slate-700 bg-blue-50 border border-blue-100 rounded-lg px-3 py-2 mb-3 text-sm">
            <Sparkles className="inline w-4 h-4 text-blue-600 mr-1 -mt-0.5" />
            {item.reason}
          </p>
        )}
        {specs.length > 0 && (
          <dl className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-1 text-sm mb-4">
            {specs.map(([k, v]) => (
              <div key={k} className="flex justify-between gap-3 border-b border-slate-100 py-1">
                <dt className="text-slate-500">{k}</dt>
                <dd className="text-slate-800 font-medium text-right">{v}</dd>
              </div>
            ))}
          </dl>
        )}
        <button
          onClick={() => onOpen(item.id)}
          className="inline-flex items-center gap-1.5 text-sm font-medium text-blue-600 hover:text-blue-800"
        >
          Открыть карточку изделия <ArrowRight className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
};

// Раздел ИИ: две вкладки.
//   «Помощник механика» — модель сама вызывает инструменты (запросы к базе).
//   «Подбор по описанию» — схема RAG: поиск кандидатов + объяснение моделью.
const AssistantPage = ({ getStageStyle, onOpenProduct, askRequest }) => {
  const [tab, setTab] = useState('chat');
  const [seenAsk, setSeenAsk] = useState(null);
  if (askRequest && askRequest !== seenAsk) { setSeenAsk(askRequest); setTab('chat'); }
  const [status, setStatus] = useState(null);

  useEffect(() => {
    api.getAssistantStatus().then(setStatus).catch(() => setStatus({ llm: false }));
  }, []);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="segmented flex gap-1 p-1 rounded-xl">
          {[['chat', 'Помощник механика'], ['recommend', 'Подбор по описанию']].map(([id, label]) => (
            <button key={id} onClick={() => setTab(id)}
              className={`px-3 sm:px-4 py-2 rounded-lg text-sm font-medium whitespace-nowrap transition-colors ${
                tab === id ? 'btn-secondary text-slate-900' : 'text-slate-600 hover:text-slate-900'}`}>
              {label}
            </button>
          ))}
        </div>
        {status && (
          <span className={`text-xs font-medium px-3 py-1 rounded-full border ${
            status.llm ? 'bg-green-50 text-green-700 border-green-200' : 'bg-slate-50 text-slate-600 border-slate-200'
          }`}>
            {status.llm ? `Модель: ${status.model}` : 'Модель не подключена: только поиск'}
          </span>
        )}
      </div>
      {/* Обе вкладки остаются на странице, скрывается только неактивная:
          введённый текст и результаты подбора не пропадают при переключении */}
      <div hidden={tab !== 'chat'}>
        <MechanicChat status={status} onOpenProduct={onOpenProduct} askRequest={askRequest} />
      </div>
      <div hidden={tab !== 'recommend'}>
        <RecommendPanel getStageStyle={getStageStyle} onOpenProduct={onOpenProduct} />
      </div>
    </div>
  );
};

// Подбор по описанию задачи: система ищет подходящее оборудование в парке
// и (если подключена модель) объясняет выбор
const RecommendPanel = ({ getStageStyle, onOpenProduct }) => {
  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState('');
  const [recent, setRecent] = useState(loadRecent);
  const [clarify, setClarify] = useState('');

  const remember = (q) => {
    const next = [q, ...recent.filter(r => r !== q)].slice(0, 6);
    setRecent(next); saveRecent(next);
  };
  const forget = (q) => {
    const next = recent.filter(r => r !== q);
    setRecent(next); saveRecent(next);
  };

  const submit = async (text = query) => {
    const q = text.trim();
    if (q.length < 3 || loading) return;
    setLoading(true);
    setError('');
    setClarify('');
    try {
      setResult(await api.recommend(q));
      remember(q);
    } catch (err) {
      setError(err.message === 'SERVER_UNAVAILABLE' ? 'Сервер недоступен.' : err.message);
    } finally {
      setLoading(false);
    }
  };

  const runExample = (text) => {
    setQuery(text);
    submit(text);
  };

  // Ответ на уточняющий вопрос: дописываем его к исходному запросу и подбираем заново.
  // Модель каждый раз видит весь запрос целиком, поэтому «память» не нужна
  const answerClarify = (e) => {
    e.preventDefault();
    const a = clarify.trim();
    if (!a) return;
    const combined = `${query.trim()}. Уточнение: ${a}`;
    setQuery(combined);
    submit(combined);
  };

  return (
    <div className="space-y-6">
      <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6">
        <div className="flex flex-wrap items-start justify-between gap-3 mb-4">
          <div>
            <h2 className="text-2xl font-bold text-slate-800 flex items-center gap-2">
              <Sparkles className="w-6 h-6 text-blue-600" /> Подбор по описанию задачи
            </h2>
            <p className="text-slate-500 mt-1">
              Опишите задачу своими словами: что нужно перекачивать, перемещать или приводить в движение и с какими параметрами.
            </p>
          </div>
        </div>

        <form
          onSubmit={(e) => { e.preventDefault(); submit(); }}
          className="flex flex-col sm:flex-row gap-3"
        >
          <textarea
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); submit(); } }}
            rows={3}
            maxLength={1000}
            placeholder="Например: нужен насос для перекачки воды, подача около 90 м³/ч, напор 50 м"
            className="flex-1 px-4 py-3 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent resize-none"
          />
          <button
            type="submit"
            disabled={loading || query.trim().length < 3}
            className="flex items-center justify-center gap-2 px-6 py-3 btn-primary text-white rounded-lg transition-colors font-medium disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {loading ? <RefreshCw className="w-5 h-5 animate-spin" /> : <Send className="w-5 h-5" />}
            Подобрать
          </button>
        </form>

        <div className="flex flex-wrap gap-2 mt-4">
          {EXAMPLES.map(ex => (
            <button
              key={ex}
              onClick={() => runExample(ex)}
              disabled={loading}
              className="text-sm px-3 py-1.5 rounded-full bg-slate-100 text-slate-700 hover:bg-slate-200 transition-colors text-left disabled:opacity-50"
            >
              {ex}
            </button>
          ))}
        </div>

        {recent.length > 0 && (
          <div className="mt-4 pt-4 border-t border-slate-100">
            <p className="text-xs text-slate-500 mb-2 flex items-center gap-1.5"><History className="w-3.5 h-3.5" /> Недавние запросы</p>
            <div className="flex flex-wrap gap-2">
              {recent.map(r => (
                <span key={r} className="inline-flex items-center rounded-full border border-slate-200 bg-white text-sm max-w-full">
                  <button onClick={() => runExample(r)} disabled={loading}
                    className="pl-3 pr-1 py-1 text-slate-700 hover:text-slate-900 truncate max-w-[28rem] disabled:opacity-50" title={r}>{r}</button>
                  <button onClick={() => forget(r)} aria-label={`Убрать «${r}» из недавних`}
                    className="pr-2 pl-1 py-1 text-slate-400 hover:text-slate-700"><X className="w-3.5 h-3.5" /></button>
                </span>
              ))}
            </div>
          </div>
        )}
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-800 rounded-xl p-4">{error}</div>
      )}

      {loading && (
        <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-10 text-center">
          <RefreshCw className="w-10 h-10 text-blue-500 mx-auto mb-3 animate-spin" />
          <p className="text-slate-600">Ищем в каталоге и сравниваем характеристики...</p>
        </div>
      )}

      {!loading && result && (
        <div className="space-y-4">
          <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-5">
            <p className="text-slate-800 flex items-start gap-2">
              {result.mode === 'llm'
                ? <Sparkles className="w-5 h-5 text-blue-600 flex-shrink-0 mt-0.5" />
                : <Search className="w-5 h-5 text-slate-500 flex-shrink-0 mt-0.5" />}
              <span>{result.summary}</span>
            </p>
            {result.clarifyingQuestion && (
              <div className="mt-3 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
                <p className="text-slate-700 flex items-start gap-2">
                  <HelpCircle className="w-5 h-5 text-amber-600 flex-shrink-0 mt-0.5" />
                  <span>{result.clarifyingQuestion}</span>
                </p>
                <form onSubmit={answerClarify} className="mt-2 flex gap-2">
                  <input value={clarify} onChange={(e) => setClarify(e.target.value)} maxLength={300}
                    placeholder="Ответьте здесь, например: м³/ч, напор 40 м"
                    className="flex-1 min-w-0 px-3 py-2 text-sm bg-white border border-amber-200 rounded-lg focus:ring-2 focus:ring-amber-400 focus:border-transparent" />
                  <button type="submit" disabled={!clarify.trim()}
                    className="btn-primary text-white text-sm px-4 py-2 rounded-lg disabled:opacity-50">Уточнить</button>
                </form>
              </div>
            )}
            {result.notice && (
              <p className="mt-3 text-sm text-slate-500 flex items-start gap-2">
                <Info className="w-4 h-4 flex-shrink-0 mt-0.5" /> {result.notice}
              </p>
            )}
          </div>

          {result.recommendations.map(item => (
            <RecommendationCard key={item.id} item={item} getStageStyle={getStageStyle} onOpen={onOpenProduct} />
          ))}
        </div>
      )}
    </div>
  );
};

export default AssistantPage;
