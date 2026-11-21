const NAV_ITEMS = [
  { id: 'dashboard', label: 'Дашборд' },
  { id: 'catalog', label: 'Каталог' },
  { id: 'assistant', label: 'ИИ-помощник' },
  { id: 'rules', label: 'База правил' },
  { id: 'import', label: 'Импорт данных' },
];

// Шапка: белая полоса с тонкой линией снизу, знак системы — чёрная плашка
const AppHeader = ({ view, onNavigate }) => (
  <header className="bg-white border-b border-slate-900">
    <div className="max-w-[1680px] mx-auto px-4 sm:px-6 py-3">
      <div className="flex flex-wrap items-center justify-between gap-3 sm:gap-4">
        <div className="flex items-center gap-3">
          <div className="btn-primary text-white font-mono text-sm px-3 py-2.5 rounded-lg leading-none">ЖЦИ</div>
          <div>
            <h1 className="text-base sm:text-lg font-medium text-slate-900 leading-tight">Цифровые паспорта оборудования</h1>
            <p className="hidden sm:block text-xs text-slate-500">Жизненный цикл, обслуживание и состояние парка предприятия</p>
          </div>
        </div>
        <nav className="segmented flex gap-1 p-1 rounded-xl w-full sm:w-auto overflow-x-auto [scrollbar-width:none]" aria-label="Разделы">
          {NAV_ITEMS.map(item => (
            <button
              key={item.id}
              onClick={() => onNavigate(item.id)}
              aria-current={view === item.id ? 'page' : undefined}
              className={`px-3 sm:px-4 py-2 rounded-lg text-sm font-medium whitespace-nowrap flex-shrink-0 transition-colors ${
                view === item.id ? 'btn-primary text-white' : 'text-slate-700 hover:bg-white/70'
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
