import { Bot, Search, X } from 'lucide-react';

// Справка «Как спрашивать»: два режима помощника рядом, текущий отмечен.
// Примеры кликабельные — сразу отправляются в чат.

const WITH_MODEL = {
  can: [
    'Спрашивайте своими словами, можно сразу несколько условий',
    'Можно уточнять по ходу: «а в котельной?», «покажи подробнее про #12»',
    'Найдёт оборудование по описанию, месту и состоянию',
    'Составит план ТО на любой срок',
    'Подберёт замену из резерва под требование и предупредит о лишнем запасе',
    'Расскажет про конкретное изделие: наработка, ресурс, выводы экспертной системы'
  ],
  examples: [
    'Какие насосы в котельной требуют ТО в этом месяце?',
    'Подбери из резерва замену для насоса К 90/35',
    'Где больше всего аварийного оборудования и что с ним?'
  ]
};

// Правила режима без модели — те же, что в backend/agent.js (функция fallback)
const RULES = [
  { topic: 'Резерв и замена', words: '«резерв», «склад», «замена»', extra: 'требование: «подача от 8», «мощность не меньше 15»', example: 'Есть ли в резерве насос с подачей от 8?' },
  { topic: 'Техобслуживание', words: '«ТО», «обслуживание»', extra: 'срок: «неделя», «две недели», «месяц»', example: 'Что требует ТО на этой неделе?' },
  { topic: 'Аварийное состояние', words: '«аварийное», «критическое»', extra: 'место — только «цех №…»', example: 'Аварийное оборудование в цехе №3' },
  { topic: 'Сводки', words: '«по цехам», «по типам», «по этапам», «по состоянию»', extra: '', example: 'Сколько оборудования по типам?' }
];

function ModeCard({ icon: Icon, title, current, children }) {
  return (
    <section className={`rounded-xl border p-4 sm:p-5 ${current ? 'border-slate-900 bg-white' : 'border-slate-300 bg-slate-50'}`}>
      <div className="flex items-center justify-between gap-2 mb-3">
        <h3 className="flex items-center gap-2 font-medium text-slate-900"><Icon className="w-5 h-5" />{title}</h3>
        {current && <span className="text-xs px-2 py-0.5 rounded-md bg-black text-white">сейчас</span>}
      </div>
      {children}
    </section>
  );
}

function Example({ text, onAsk }) {
  return (
    <button onClick={() => onAsk(text)}
      className="btn-secondary text-left text-sm text-slate-800 px-3 py-1.5 rounded-lg">
      {text}
    </button>
  );
}

const ChatHelp = ({ llm, onAsk, onClose }) => (
  <div className="bg-slate-50 rounded-xl border border-slate-300 p-3 sm:p-4">
    <div className="flex items-start justify-between gap-3 mb-3 px-1">
      <div>
        <h2 className="text-lg font-medium text-slate-900">Как спрашивать</h2>
        <p className="text-sm text-slate-500">
          Помощник отвечает только по данным базы и показывает, какие запросы сделал («Ход работы»).
          Номер вида #12 открывает карточку изделия.
        </p>
      </div>
      {onClose && (
        <button onClick={onClose} aria-label="Скрыть справку" className="p-1.5 rounded-lg text-slate-500 hover:text-slate-900 hover:bg-slate-200">
          <X className="w-5 h-5" />
        </button>
      )}
    </div>

    {/* Текущий режим первым: на телефоне до второй карточки листать долго */}
    <div className={`grid lg:grid-cols-2 gap-3 ${llm ? '' : '[&>section:first-child]:order-2 lg:[&>section:first-child]:order-none'}`}>
      <ModeCard icon={Bot} title="С языковой моделью" current={llm}>
        <ul className="space-y-1.5 text-sm text-slate-700 mb-4 list-disc pl-5">
          {WITH_MODEL.can.map(t => <li key={t}>{t}</li>)}
        </ul>
        {llm
          ? <div className="flex flex-wrap gap-2">{WITH_MODEL.examples.map(e => <Example key={e} text={e} onAsk={onAsk} />)}</div>
          : <p className="text-sm text-slate-500">Включается, когда на сервере задан ключ модели (переменные LLM_* в <code className="font-mono text-xs">backend/.env</code>).</p>}
      </ModeCard>

      <ModeCard icon={Search} title="Без модели: поиск по правилам" current={!llm}>
        <p className="text-sm text-slate-700 mb-3">Понимает четыре типа вопросов по ключевым словам. Остальное ищет по словам в названиях и характеристиках.</p>
        <dl className="divide-y divide-slate-200 border-y border-slate-200 text-sm mb-3">
          {RULES.map(r => (
            <div key={r.topic} className="py-2 grid sm:grid-cols-[150px,1fr] gap-x-3 gap-y-1">
              <dt className="font-medium text-slate-900">{r.topic}</dt>
              <dd className="text-slate-600">
                {r.words}{r.extra && <span className="block text-slate-500">{r.extra}</span>}
                {!llm && <span className="block mt-1.5"><Example text={r.example} onAsk={onAsk} /></span>}
              </dd>
            </div>
          ))}
        </dl>
        <p className="text-sm text-slate-500">
          Не умеет сочетать условия («аварийные насосы в котельной с ТО на неделе»), понимать места кроме номера цеха
          и отвечать про конкретное изделие.
        </p>
      </ModeCard>
    </div>
  </div>
);

export default ChatHelp;
