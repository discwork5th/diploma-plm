import { Search } from 'lucide-react';
const NAV_ITEMS = [
  { id: 'dashboard', label: 'Дашборд' },
  { id: 'catalog', label: 'Каталог' },
  { id: 'assistant', label: 'ИИ-помощник' },
  { id: 'rules', label: 'База правил' },
  { id: 'import', label: 'Импорт данных' },
];

// Шапка: белая полоса с тонкой линией снизу, знак системы — чёрная плашка
const AppHeader = ({ view, onNavigate, onOpenSearch }) => (
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
        <div className="flex items-center gap-2 w-full sm:w-auto">
        {onOpenSearch && (
          <button onClick={onOpenSearch} aria-label="Поиск (Ctrl+K)" title="Поиск (Ctrl+K)"
            className="btn-secondary flex items-center gap-2 px-3 py-2.5 rounded-xl text-slate-600 text-sm flex-shrink-0">
            <Search className="w-4 h-4" />
            <span className="hidden xl:inline">Поиск</span>
            <kbd className="hidden xl:inline font-mono text-[11px] text-slate-500 border border-slate-300 rounded px-1">Ctrl K</kbd>
          </button>
        )}
        <nav className="segmented flex gap-1 p-1 rounded-xl min-w-0 flex-1 sm:flex-none overflow-x-auto [scrollbar-width:none]" aria-label="Разделы">
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
    </div>
  </header>
);

export default AppHeader;
