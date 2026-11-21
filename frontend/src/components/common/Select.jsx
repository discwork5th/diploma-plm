import { useEffect, useId, useRef, useState } from 'react';
import { Check, ChevronDown } from 'lucide-react';

// ============================================================================
// Выпадающий список вместо системного <select>.
// Системный список открывается и закрывается рывком и выглядит по-разному
// в каждом браузере. Здесь список плавно появляется, выбранный пункт отмечен,
// работают клавиатура (стрелки, Enter, Esc) и щелчок мимо — закрыть.
// ============================================================================
const Select = ({ value, onChange, options, icon: Icon, label, className = '' }) => {
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const rootRef = useRef(null);
  const listRef = useRef(null);
  const id = useId();
  const current = options.find(o => o.value === value) || options[0];

  // Щелчок вне списка закрывает его
  useEffect(() => {
    if (!open) return undefined;
    const onDoc = (e) => { if (!rootRef.current?.contains(e.target)) setOpen(false); };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, [open]);

  // Подсвеченный клавиатурой пункт всегда виден в прокручиваемом списке
  useEffect(() => {
    if (open) listRef.current?.children[active]?.scrollIntoView({ block: 'nearest' });
  }, [open, active]);

  const openList = () => {
    setActive(Math.max(0, options.findIndex(o => o.value === value)));
    setOpen(true);
  };
  const pick = (o) => { onChange(o.value); setOpen(false); };

  const onKey = (e) => {
    if (!open && (e.key === 'ArrowDown' || e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); openList(); return; }
    if (!open) return;
    if (e.key === 'ArrowDown') { e.preventDefault(); setActive(a => Math.min(options.length - 1, a + 1)); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setActive(a => Math.max(0, a - 1)); }
    else if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); pick(options[active]); }
    else if (e.key === 'Escape' || e.key === 'Tab') setOpen(false);
  };

  return (
    <div ref={rootRef} className={`relative ${className}`}>
      <button type="button" onClick={() => (open ? setOpen(false) : openList())} onKeyDown={onKey}
        aria-haspopup="listbox" aria-expanded={open} aria-controls={id} aria-label={label}
        className={`btn-secondary w-full flex items-center gap-2 pl-3 pr-2.5 py-2 rounded-lg text-left text-slate-800 ${open ? 'border-slate-900' : ''}`}>
        {Icon && <Icon className="w-4 h-4 text-slate-500 flex-shrink-0" />}
        <span className="truncate flex-1">{current?.label}</span>
        {current?.count != null && <span className="font-mono text-xs text-slate-500">{current.count}</span>}
        <ChevronDown className={`w-4 h-4 text-slate-500 flex-shrink-0 transition-transform duration-150 ${open ? 'rotate-180' : ''}`} />
      </button>
      {open && (
        <ul ref={listRef} id={id} role="listbox" aria-label={label}
          className="select-pop absolute z-30 mt-1.5 min-w-full w-max max-w-[min(90vw,420px)] max-h-72 overflow-y-auto bg-white border border-slate-300 rounded-xl shadow-lg p-1">
          {options.map((o, i) => (
            <li key={o.value} role="option" aria-selected={o.value === value}>
              <button type="button" onMouseEnter={() => setActive(i)} onClick={() => pick(o)}
                className={`w-full flex items-center gap-2 px-2.5 py-2 rounded-lg text-left text-sm ${i === active ? 'bg-slate-100' : ''}`}>
                <Check className={`w-4 h-4 flex-shrink-0 ${o.value === value ? 'text-slate-900' : 'text-transparent'}`} />
                {o.dot && <span className={`w-2 h-2 rounded-full flex-shrink-0 ${o.dot}`} />}
                <span className="flex-1">{o.label}</span>
                {o.count != null && <span className="font-mono text-xs text-slate-500 pl-3">{o.count}</span>}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
};

export default Select;
