import { useState } from 'react';
import PlantMap from './PlantMap';
import { SITE } from './plantSite';

const DOT = { critical: 'bg-alarm', warning: 'bg-caution', info: 'bg-slate-400', normal: 'bg-ok' };

// Чёрный лист с генпланом: слева карта, справа сводка по выбранному корпусу
const PlantOverview = ({ byLocation, onOpenProduct, onShowInCatalog }) => {
  // По умолчанию открыт корпус, где больше всего аварийного оборудования
  const initial = [...(byLocation || [])].sort((a, b) => b.critical - a.critical || b.warning - a.warning)[0]?.location || null;
  const [selected, setSelected] = useState(initial);
  const stat = byLocation.find(l => l.location === selected);
  const offMap = byLocation.filter(l => !SITE.some(s => s.key === l.location));

  return (
    <section className="bg-black text-white rounded-xl overflow-hidden grid lg:grid-cols-[1fr,320px]" aria-labelledby="plant-title">
      <div className="p-5 pb-2 min-w-0">
        <div className="flex flex-wrap items-baseline justify-between gap-3">
          <h2 id="plant-title" className="text-xl font-medium">Генплан предприятия</h2>
        </div>
        <p className="text-sm text-white/55 mt-1">
          В кружке — единиц оборудования в корпусе, <span className="text-alarm">красное число</span> — сколько из них в аварийном состоянии.
          Нажмите на корпус, чтобы увидеть, что в нём требует работ.
        </p>
        <PlantMap byLocation={byLocation} selected={selected} onSelect={setSelected} />
      </div>

      <aside className="border-t lg:border-t-0 lg:border-l border-white/15 p-5 flex flex-col" aria-live="polite">
        {!stat && <p className="text-white/60 text-sm">Выберите корпус на карте.</p>}
        {stat && (
          <>
            <h3 className="text-lg font-medium leading-snug">{stat.location}</h3>
            <dl className="grid grid-cols-2 gap-px bg-white/15 border border-white/15 mt-4 text-sm">
              {[
                ['Единиц', stat.total, 'text-white'],
                ['Аварийных', stat.critical, stat.critical ? 'text-alarm' : 'text-white'],
                ['Требуют внимания', stat.warning, stat.warning ? 'text-caution' : 'text-white'],
                ['ТО до 30 дней', stat.dueTO, 'text-white']
              ].map(([label, value, cls]) => (
                <div key={label} className="bg-black p-3">
                  <dt className="text-white/50 text-xs">{label}</dt>
                  <dd className={`font-mono text-2xl mt-1 ${cls}`}>{value}</dd>
                </div>
              ))}
            </dl>

            {stat.items.length > 0 ? (
              <ul className="mt-4 divide-y divide-white/10 border-y border-white/10">
                {stat.items.map(item => (
                  <li key={item.id}>
                    <button onClick={() => onOpenProduct(item.id)} className="w-full text-left py-2 group">
                      <span className="flex items-center gap-2 text-sm group-hover:underline underline-offset-2">
                        <span className={`w-2 h-2 rounded-full flex-shrink-0 ${DOT[item.severity]}`} />
                        <span className="truncate">{item.name}</span>
                      </span>
                      <span className="block font-mono text-[11px] text-white/45 pl-4">
                        {item.serialNumber}{item.daysUntilTO !== null && item.daysUntilTO < 0 ? `, ТО просрочено на ${-item.daysUntilTO} дн.` : ''}
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="mt-4 text-sm text-white/60">Всё оборудование корпуса в норме.</p>
            )}

            <button onClick={() => onShowInCatalog(stat.location)}
              className="mt-auto pt-4 self-start text-sm font-medium text-white underline underline-offset-4 decoration-white/40 hover:decoration-white">
              Всё оборудование корпуса в каталоге
            </button>
          </>
        )}
        {offMap.length > 0 && (
          <p className="text-xs text-white/40 mt-3">Не на генплане: {offMap.map(l => `${l.location} (${l.total})`).join(', ')}</p>
        )}
      </aside>
    </section>
  );
};

export default PlantOverview;
