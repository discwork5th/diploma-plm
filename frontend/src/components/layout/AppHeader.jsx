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
    <div className="max-w-7xl mx-auto px-4 py-3">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="bg-black text-white font-mono text-sm px-2.5 py-2 rounded-md leading-none">ЖЦИ</div>
          <div>
            <h1 className="text-lg font-medium text-slate-900 leading-tight">Цифровые паспорта оборудования</h1>
            <p className="text-xs text-slate-500">Жизненный цикл, обслуживание и состояние парка предприятия</p>
          </div>
        </div>
        <nav className="flex flex-wrap gap-1" aria-label="Разделы">
          {NAV_ITEMS.map(item => (
            <button
              key={item.id}
              onClick={() => onNavigate(item.id)}
              aria-current={view === item.id ? 'page' : undefined}
              className={`px-3 py-1.5 rounded-md text-sm transition-colors ${
                view === item.id ? 'bg-black text-white' : 'text-slate-700 hover:bg-slate-100'
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
