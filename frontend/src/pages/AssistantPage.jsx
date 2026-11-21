import { useEffect, useState } from 'react';
import { Sparkles, Send, RefreshCw, Info, HelpCircle, ArrowRight, Search } from 'lucide-react';
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
        <p className="text-sm text-slate-500 mb-3">{item.type} • S/N {item.serialNumber}</p>
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
const AssistantPage = ({ getStageStyle, onOpenProduct }) => {
  const [tab, setTab] = useState('chat');
  const [status, setStatus] = useState(null);

  useEffect(() => {
    api.getAssistantStatus().then(setStatus).catch(() => setStatus({ llm: false }));
  }, []);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex gap-1 bg-slate-100 p-1 rounded-lg">
          {[['chat', 'Помощник механика'], ['recommend', 'Подбор по описанию']].map(([id, label]) => (
            <button key={id} onClick={() => setTab(id)}
              className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${
                tab === id ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-600 hover:text-slate-900'}`}>
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
      {tab === 'chat'
        ? <MechanicChat status={status} onOpenProduct={onOpenProduct} />
        : <RecommendPanel getStageStyle={getStageStyle} onOpenProduct={onOpenProduct} />}
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

  const submit = async (text = query) => {
    const q = text.trim();
    if (q.length < 3 || loading) return;
    setLoading(true);
    setError('');
    try {
      setResult(await api.recommend(q));
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
              <p className="mt-3 text-slate-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 flex items-start gap-2">
                <HelpCircle className="w-5 h-5 text-amber-600 flex-shrink-0 mt-0.5" />
                <span>{result.clarifyingQuestion}</span>
              </p>
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
