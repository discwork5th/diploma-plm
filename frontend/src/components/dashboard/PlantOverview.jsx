import { lazy, Suspense, useState } from 'react';
import { RefreshCw } from 'lucide-react';
import { useTelemetry } from '../../telemetry/telemetryContext';
import PlantMap from './PlantMap';

// three.js весит несколько сотен килобайт: грузим его отдельным файлом,
// только когда открыт дашборд с 3D-видом
const Plant3D = lazy(() => import('./Plant3D'));

// Есть ли в браузере WebGL. Если нет — сразу показываем плоскую схему
function hasWebGL() {
  try {
    const c = document.createElement('canvas');
    return Boolean(c.getContext('webgl2') || c.getContext('webgl'));
  } catch {
    return false;
  }
}
import { SITE } from './plantSite';

const DOT = { critical: 'bg-alarm', warning: 'bg-caution', info: 'bg-slate-400', normal: 'bg-ok' };

// Сводка по всему заводу, когда корпус не выбран: итоги, корпуса с аварийным
// оборудованием (клик — выбрать корпус) и самое проблемное оборудование
function PlantSummary({ byLocation, snapshot, onSelect, onOpenProduct }) {
  const sum = (k) => byLocation.reduce((n, l) => n + l[k], 0);
  const hot = [...byLocation].filter(l => l.critical || l.warning)
    .sort((a, b) => b.critical - a.critical || b.warning - a.warning).slice(0, 5);
  const RANK = { critical: 2, warning: 1 };
  const worst = byLocation.flatMap(l => l.items.map(i => ({ ...i, location: l.location })))
    .sort((a, b) => (RANK[b.severity] || 0) - (RANK[a.severity] || 0) || (a.daysUntilTO ?? 999) - (b.daysUntilTO ?? 999))
    .slice(0, 3);
  const healthy = snapshot ? snapshot.buildings.reduce((n, b) => n + b.units - b.alarms - b.warnings, 0) : null;
  const running = snapshot ? snapshot.units.length : null;
  return (
    <>
      <h3 className="text-lg font-medium leading-snug">Весь завод</h3>
      {snapshot && (
        <p className="text-sm text-white/60 mt-1">
          Сейчас: нагрузка <span className="font-mono text-white">{snapshot.totalLoad}%</span>, вибрация в норме у{' '}
          <span className="font-mono text-white">{healthy}</span> из {running}
        </p>
      )}
      <dl className="grid grid-cols-2 gap-px bg-white/15 border border-white/15 mt-4 text-sm">
        {[
          ['Единиц на площадке', sum('total'), 'text-white'],
          ['Аварийных', sum('critical'), 'text-alarm'],
          ['Требуют внимания', sum('warning'), 'text-caution'],
          ['ТО до 30 дней', sum('dueTO'), 'text-white']
        ].map(([label, value, cls]) => (
          <div key={label} className="bg-black p-3">
            <dt className="text-white/50 text-xs">{label}</dt>
            <dd className={`font-mono text-2xl mt-1 ${cls}`}>{value}</dd>
          </div>
        ))}
      </dl>
      <p className="text-xs text-white/45 mt-4 mb-1">Где больше всего проблем</p>
      <ul className="divide-y divide-white/10 border-y border-white/10">
        {hot.map(l => (
          <li key={l.location}>
            <button onClick={() => onSelect(l.location)} className="w-full flex items-center gap-2 py-2 text-left text-sm group">
              <span className="flex-1 truncate group-hover:underline underline-offset-2">{l.location}</span>
              {l.critical > 0 && <span className="font-mono text-alarm">{l.critical}</span>}
              {l.warning > 0 && <span className="font-mono text-caution">{l.warning}</span>}
            </button>
          </li>
        ))}
      </ul>
      {worst.length > 0 && (
        <>
          <p className="text-xs text-white/45 mt-4 mb-1">Самое срочное</p>
          <ul className="divide-y divide-white/10 border-y border-white/10 mb-4">
            {worst.map(i => (
              <li key={i.id}>
                <button onClick={() => onOpenProduct(i.id)} className="w-full text-left py-2 group">
                  <span className="flex items-center gap-2 text-sm group-hover:underline underline-offset-2">
                    <span className={`w-2 h-2 rounded-full flex-shrink-0 ${DOT[i.severity]}`} />
                    <span className="truncate">{i.name}</span>
                  </span>
                  <span className="block font-mono text-[11px] text-white/45 pl-4 truncate">{i.location}</span>
                </button>
              </li>
            ))}
          </ul>
        </>
      )}
    </>
  );
}

// Чёрный лист с генпланом: слева карта, справа сводка по выбранному корпусу
const PlantOverview = ({ byLocation, onOpenProduct, onShowInCatalog, onRefresh }) => {
  // По умолчанию открыт корпус, где больше всего аварийного оборудования
  // Ничего не выбрано — справа сводка по всему заводу
  const [selected, setSelected] = useState(null);
  const [mode, setMode] = useState(() => (hasWebGL() ? '3d' : 'plan'));
  const [touch] = useState(() => window.matchMedia('(pointer: coarse)').matches);
  const stat = byLocation.find(l => l.location === selected);
  const { snapshot, connected } = useTelemetry();
  const live = snapshot?.buildings.find(b => b.location === selected);
  const liveAlarms = snapshot ? snapshot.alarms.filter(a => a.zone === 'D').length : 0;
  const offMap = byLocation.filter(l => !SITE.some(s => s.key === l.location));

  return (
    <section className="bg-black text-white rounded-xl overflow-hidden grid lg:grid-cols-[1fr,360px]" aria-labelledby="plant-title">
      <div className="p-4 sm:p-5 pb-2 min-w-0">
        <div className="flex flex-wrap items-baseline justify-between gap-3">
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
            <h2 id="plant-title" className="text-xl font-medium">Генплан предприятия</h2>
            {snapshot && (
              <span className="flex items-center gap-2 text-sm text-white/70">
                <span className={`w-2 h-2 rounded-full ${connected ? 'bg-ok live-dot' : 'bg-white/40'}`} />
                {connected ? 'в реальном времени' : 'нет связи'}
                <span className="text-white/40">·</span>
                нагрузка <span className="font-mono text-white">{snapshot.totalLoad}%</span>
                <span className="text-white/40">·</span>
                тревог <span className={`font-mono ${liveAlarms ? 'text-alarm' : 'text-white'}`}>{liveAlarms}</span>
              </span>
            )}
          </div>
          <div className="flex items-center gap-2">
            <div className="flex gap-1 p-1 rounded-xl bg-white/[0.06] border border-white/10 shadow-[inset_0_1px_3px_rgba(0,0,0,0.6)] text-sm" role="group" aria-label="Вид генплана">
              {[['3d', '3D-модель'], ['plan', 'Схема']].map(([id, label]) => (
                <button key={id} onClick={() => setMode(id)} aria-pressed={mode === id}
                  className={`px-3.5 py-1.5 rounded-lg transition-colors ${mode === id ? 'btn-secondary text-black' : 'text-white/70 hover:text-white'}`}>
                  {label}
                </button>
              ))}
            </div>
            {onRefresh && (
              <button onClick={onRefresh} title="Обновить данные" aria-label="Обновить данные"
                className="p-2.5 rounded-xl bg-white/[0.06] border border-white/15 text-white/80 hover:text-white hover:bg-white/10 shadow-[inset_0_1px_0_rgba(255,255,255,0.08)]">
                <RefreshCw className="w-4 h-4" />
              </button>
            )}
          </div>
        </div>
        <p className="text-sm text-white/55 mt-1">
          В кружке — единиц оборудования в корпусе, <span className="text-alarm">красное число</span> — сколько из них в аварийном состоянии.
          <span className="hidden sm:inline"> Нажмите на корпус, чтобы увидеть, что в нём требует работ.</span>
          {mode === '3d' && touch && (
            <span className="block sm:inline sm:ml-1 text-white/45">Двумя пальцами — повернуть и приблизить.</span>
          )}
        </p>
        {mode === '3d' ? (
          <Suspense fallback={<div className="h-[340px] sm:h-[460px] lg:h-[600px] flex items-center justify-center text-white/50 text-sm">Загружаю 3D-модель…</div>}>
            <Plant3D byLocation={byLocation} live={snapshot} selected={selected} onSelect={setSelected} />
          </Suspense>
        ) : (
          <PlantMap byLocation={byLocation} selected={selected} onSelect={setSelected} />
        )}
      </div>

      {/* Высоту блока задаёт карта. Боковая панель на широком экране занимает
          ровно столько же и прокручивается внутри, если содержимое длиннее —
          иначе под картой оставалась бы пустая чёрная полоса */}
      <aside className="relative border-t lg:border-t-0 lg:border-l border-white/15" aria-live="polite">
        <div className="plant-aside lg:absolute lg:inset-0 lg:overflow-y-auto p-4 sm:p-5 flex flex-col">
        {!stat && <PlantSummary byLocation={byLocation} snapshot={snapshot} onSelect={setSelected} onOpenProduct={onOpenProduct} />}
        {stat && (
          <>
            <button onClick={() => setSelected(null)} className="self-start text-sm text-white/55 hover:text-white mb-2">← Весь завод</button>
            <h3 className="text-lg font-medium leading-snug">{stat.location}</h3>
            {live && (
              <p className="text-sm text-white/60 mt-1 flex flex-wrap gap-x-3">
                <span>Сейчас: нагрузка <span className="font-mono text-white">{live.load}%</span></span>
                <span>вибрация в норме у <span className="font-mono text-white">{live.units - live.alarms - live.warnings}</span> из {live.units}</span>
                {live.alarms > 0 && <span className="text-alarm">тревог: {live.alarms}</span>}
              </p>
            )}
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
              <ul className="mt-4 mb-4 divide-y divide-white/10 border-y border-white/10">
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
              <p className="mt-4 mb-4 text-sm text-white/60">Всё оборудование корпуса в норме.</p>
            )}

            <button onClick={() => onShowInCatalog({ location: stat.location })}
              className="btn-secondary mt-auto lg:sticky lg:bottom-0 self-stretch text-center text-black text-sm font-medium px-4 py-2.5 rounded-lg">
              Всё оборудование корпуса в каталоге
            </button>
          </>
        )}
        {offMap.length > 0 && (
          <p className="text-xs text-white/40 mt-3">Не на генплане: {offMap.map(l => `${l.location} (${l.total})`).join(', ')}</p>
        )}
        </div>
      </aside>
    </section>
  );
};

export default PlantOverview;
