import { Factory } from 'lucide-react';

const NAV_ITEMS = [
  { id: 'dashboard', label: 'Дашборд' },
  { id: 'catalog', label: 'Каталог' },
  { id: 'rules', label: 'База правил' },
  { id: 'import', label: 'Импорт данных' },
];

// Шапка приложения с основной навигацией по разделам
const AppHeader = ({ view, onNavigate }) => (
  <header className="bg-white shadow-sm border-b border-slate-200">
    <div className="max-w-7xl mx-auto px-4 py-4">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <Factory className="w-8 h-8 text-blue-600" />
          <div>
            <h1 className="text-2xl font-bold text-slate-800">Система управления ЖЦИ</h1>
            <p className="text-sm text-slate-500">Цифровые паспорта промышленных изделий</p>
          </div>
        </div>
        <nav className="flex flex-wrap gap-2">
          {NAV_ITEMS.map(item => (
            <button
              key={item.id}
              onClick={() => onNavigate(item.id)}
              className={`px-4 py-2 rounded-lg font-medium transition-colors ${
                view === item.id ? 'bg-blue-600 text-white' : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
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
