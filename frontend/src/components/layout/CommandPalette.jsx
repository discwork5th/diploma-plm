import { useMemo, useRef, useState } from 'react';
import { Search, CornerDownLeft, Bot, LayoutGrid } from 'lucide-react';

// ============================================================================
// Командная строка (Ctrl+K / ⌘K): быстрый переход к любому изделию, разделу
// или вопрос ИИ-помощнику — не отрывая рук от клавиатуры.
// Поиск: каждое слово запроса должно найтись в названии, заводском номере,
// месте или типе. Стрелки — выбор, Enter — открыть, Esc — закрыть.
// ============================================================================

const SECTIONS = [
  { id: 'dashboard', label: 'Дашборд' },
  { id: 'catalog', label: 'Каталог' },
  { id: 'assistant', label: 'ИИ-помощник' },
  { id: 'rules', label: 'База правил' },
  { id: 'import', label: 'Импорт данных' }
];

const norm = (s) => String(s || '').toLowerCase().replace(/ё/g, 'е');

const CommandPalette = ({ open, onClose, products, onNavigate, onOpenProduct, onAsk }) => {
  const [query, setQuery] = useState('');
  const [active, setActive] = useState(0);
  const inputRef = useRef(null);


  const items = useMemo(() => {
    const words = norm(query).split(/\s+/).filter(Boolean);
    const sections = SECTIONS
      .filter(s => !words.length || words.every(w => norm(s.label).includes(w)))
      .map(s => ({ kind: 'section', key: `s-${s.id}`, title: s.label, run: () => onNavigate(s.id) }));
    const found = words.length
      ? products
        .filter(p => words.every(w => norm(`${p.name} ${p.serialNumber} ${p.location} ${p.type}`).includes(w)))
        .slice(0, 7)
        .map(p => ({ kind: 'product', key: `p-${p.id}`, title: p.name, sub: `${p.serialNumber || '—'} · ${p.location || '—'}`, run: () => onOpenProduct(p.id) }))
      : [];
    const ask = query.trim().length > 2
      ? [{ kind: 'ask', key: 'ask', title: `Спросить ИИ-помощника: «${query.trim()}»`, run: () => onAsk(query.trim()) }]
      : [];
    return [...found, ...sections, ...ask];
  }, [query, products, onNavigate, onOpenProduct, onAsk]);

  if (!open) return null;
  const current = Math.min(active, Math.max(0, items.length - 1));

  const choose = (item) => {
    if (!item) return;
    item.run();
    setQuery('');
    setActive(0);
    onClose();
  };

  const onKey = (e) => {
    if (e.key === 'ArrowDown') { e.preventDefault(); setActive(Math.min(items.length - 1, current + 1)); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setActive(Math.max(0, current - 1)); }
    else if (e.key === 'Enter') { e.preventDefault(); choose(items[current]); }
    else if (e.key === 'Escape') onClose();
  };

  const ICON = { section: LayoutGrid, product: Search, ask: Bot };

  return (
    <div className="fixed inset-0 z-50 bg-black/40 backdrop-blur-[2px] flex items-start justify-center p-3 pt-[12vh]" onMouseDown={onClose}>
      <div role="dialog" aria-modal="true" aria-label="Командная строка"
        className="w-full max-w-xl bg-white rounded-2xl shadow-lg border border-slate-300 overflow-hidden"
        onMouseDown={(e) => e.stopPropagation()}>
        <div className="flex items-center gap-3 px-4 border-b border-slate-200">
          <Search className="w-5 h-5 text-slate-400" />
          <input ref={inputRef} autoFocus value={query} onChange={(e) => { setQuery(e.target.value); setActive(0); }} onKeyDown={onKey}
            placeholder="Изделие, заводской номер, цех или вопрос…" aria-label="Поиск"
            className="flex-1 py-4 outline-none bg-transparent text-slate-900" />
          <kbd className="font-mono text-xs text-slate-500 border border-slate-300 rounded px-1.5 py-0.5">Esc</kbd>
        </div>
        <ul className="max-h-[50vh] overflow-y-auto p-2" role="listbox">
          {items.map((item, i) => {
            const Icon = ICON[item.kind];
            return (
              <li key={item.key} role="option" aria-selected={i === current}>
                <button onMouseEnter={() => setActive(i)} onClick={() => choose(item)}
                  className={`w-full text-left flex items-center gap-3 px-3 py-2.5 rounded-lg ${i === current ? 'bg-slate-100' : ''}`}>
                  <Icon className="w-4 h-4 text-slate-500 flex-shrink-0" />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-slate-900">{item.title}</span>
                    {item.sub && <span className="block truncate text-xs font-mono text-slate-500">{item.sub}</span>}
                  </span>
                  {i === current && <CornerDownLeft className="w-4 h-4 text-slate-400" />}
                </button>
              </li>
            );
          })}
          {!items.length && <li className="px-3 py-6 text-center text-slate-500 text-sm">Ничего не нашлось</li>}
        </ul>
      </div>
    </div>
  );
};

export default CommandPalette;
