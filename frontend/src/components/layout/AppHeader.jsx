const NAV_ITEMS = [
  { id: 'dashboard', label: 'Дашборд' },
  { id: 'catalog', label: 'Каталог' },
  { id: 'assistant', label: 'ИИ-помощник' },
  { id: 'rules', label: 'База правил' },
  { id: 'import', label: 'Импорт данных' },
];

// Шапка: полоса шлифованной стали — единственное место с фактурой металла.
// Навигация — утопленная панель, активный раздел «выбит» графитом.
const AppHeader = ({ view, onNavigate }) => (
  <header className="brushed-steel border-b border-slate-400/60">
    <div className="max-w-7xl mx-auto px-4 py-4">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-4">
          {/* Знак: квадратная пластина с обозначением системы */}
          <div className="nameplate w-[4.5rem] h-14 flex items-center justify-center rounded-md">
            <span className="rivets" />
            <span className="font-display font-bold text-lg text-slate-800 leading-none">ЖЦИ</span>
          </div>
          <div>
            <h1 className="text-2xl font-semibold text-slate-900 leading-tight">Цифровые паспорта оборудования</h1>
            <p className="text-sm text-slate-600">Жизненный цикл, обслуживание и состояние парка предприятия</p>
          </div>
        </div>
        <nav className="flex flex-wrap gap-0.5 p-1 rounded-lg bg-slate-800/10 border border-slate-500/25" aria-label="Разделы">
          {NAV_ITEMS.map(item => (
            <button
              key={item.id}
              onClick={() => onNavigate(item.id)}
              aria-current={view === item.id ? 'page' : undefined}
              className={`px-3.5 py-1.5 rounded-md font-display font-medium text-[15px] transition-colors ${
                view === item.id
                  ? 'bg-slate-800 text-slate-50 shadow-sm'
                  : 'text-slate-700 hover:bg-white/50 hover:text-slate-900'
              }`}
            >
              {item.label}
            </button>
          ))}
        </nav>
      </div>
    </div>
  </header>
);

export default AppHeader;
