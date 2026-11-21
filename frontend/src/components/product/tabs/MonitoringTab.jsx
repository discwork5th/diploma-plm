import { useEffect, useState } from 'react';
import { api } from '../../../api/client';
import { useTelemetry } from '../../../telemetry/telemetryContext';

// ============================================================================
// Вкладка «Мониторинг и прогноз»
//   * живые показания датчиков (обновляются раз в 2 с из общего потока);
//   * вибрация на шкале зон ГОСТ ISO 10816-3;
//   * график индекса здоровья за 120 дней и прогноз до порога отказа.
// ============================================================================

const ZONE_STYLE = {
  A: { fill: '#30A46C', text: 'text-ok' },
  B: { fill: '#8FB996', text: 'text-ok' },
  C: { fill: '#E8A817', text: 'text-caution' },
  D: { fill: '#E5484D', text: 'text-alarm' }
};

// Шкала вибрации: цветные зоны и стрелка текущего значения
function VibrationScale({ value, zones }) {
  const MAX = 11;
  const W = 100;
  // Границы зон на шкале: [начало, конец] для каждой
  const segments = zones.map((z, i) => ({ ...z, from: i ? Math.min(zones[i - 1].max, MAX) : 0, to: Math.min(z.max ?? MAX, MAX) }));
  const current = zones.find(z => z.max === null || value <= z.max);
  return (
    <div>
      <div className="flex items-baseline justify-between mb-2">
        <span className="text-sm text-slate-500">Вибрация, СКЗ виброскорости</span>
        <span className={`font-mono text-3xl ${ZONE_STYLE[current.code].text}`}>{value.toFixed(1)}<span className="text-base text-slate-500 ml-1">мм/с</span></span>
      </div>
      <svg viewBox={`0 0 ${W} 14`} className="w-full h-6" preserveAspectRatio="none" aria-hidden="true">
        {segments.map(z => (
          <rect key={z.code} x={(z.from / MAX) * W} y="4" width={((z.to - z.from) / MAX) * W} height="6"
            fill={ZONE_STYLE[z.code].fill} opacity={z.code === current.code ? 1 : 0.35} />
        ))}
        <rect x={Math.min(W - 0.8, (value / MAX) * W)} y="0" width="0.8" height="14" fill="#000" />
      </svg>
      <div className="flex justify-between text-[11px] text-slate-500 font-mono mt-1">
        <span>0</span><span>2,8</span><span>4,5</span><span>7,1</span><span>11</span>
      </div>
      <p className="text-sm mt-2">
        Зона {current.code} — <span className="font-medium">{current.label}</span>
        <span className="text-slate-500"> (ГОСТ ISO 10816-3)</span>
      </p>
    </div>
  );
}

function Metric({ label, value, unit, note }) {
  return (
    <div className="bg-white p-4">
      <div className="text-sm text-slate-500">{label}</div>
      <div className="font-mono text-3xl mt-1">{value}<span className="text-base text-slate-500 ml-1">{unit}</span></div>
      {note && <div className="text-xs text-slate-500 mt-1">{note}</div>}
    </div>
  );
}

// График здоровья: история (сплошная), прогноз (пунктир), порог отказа (красный)
function HealthChart({ history, forecast, critical }) {
  const W = 1100, H = 300, PL = 36, PR = 12, PT = 12, PB = 26;
  const all = [...history, ...forecast];
  const t0 = new Date(all[0].t).getTime(), t1 = new Date(all[all.length - 1].t).getTime();
  const x = (t) => PL + ((new Date(t).getTime() - t0) / Math.max(1, t1 - t0)) * (W - PL - PR);
  const y = (h) => PT + (1 - h / 100) * (H - PT - PB);
  const line = (pts) => pts.map((p, i) => `${i ? 'L' : 'M'}${x(p.t).toFixed(1)},${y(p.health).toFixed(1)}`).join(' ');
  const today = history[history.length - 1];
  const months = [];
  for (let d = new Date(t0); d.getTime() <= t1; d.setMonth(d.getMonth() + 1, 1)) {
    if (d.getTime() >= t0) months.push(new Date(d));
  }
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-auto" role="img" aria-label="График индекса здоровья и прогноз">
      {[0, 25, 50, 75, 100].map(v => (
        <g key={v}>
          <line x1={PL} x2={W - PR} y1={y(v)} y2={y(v)} stroke="#E0E0DE" />
          <text x={PL - 6} y={y(v) + 4} textAnchor="end" fontSize="10" className="font-mono" fill="#74746F">{v}</text>
        </g>
      ))}
      {months.map(m => (
        <text key={m.toISOString()} x={x(m.toISOString())} y={H - 8} fontSize="10" fill="#74746F" textAnchor="middle">
          {m.toLocaleDateString('ru-RU', { month: 'short' })}
        </text>
      ))}
      <line x1={PL} x2={W - PR} y1={y(critical)} y2={y(critical)} stroke="#E5484D" strokeDasharray="4 3" />
      <text x={W - PR} y={y(critical) - 5} textAnchor="end" fontSize="10" fill="#E5484D">порог ремонта</text>
      <line x1={x(today.t)} x2={x(today.t)} y1={PT} y2={H - PB} stroke="#151514" strokeOpacity="0.25" />
      <text x={x(today.t) + 4} y={PT + 10} fontSize="10" fill="#55554F">сегодня</text>
      <path d={line(history)} fill="none" stroke="#151514" strokeWidth="1.8" strokeLinejoin="round" />
      {forecast.length > 0 && <path d={line([today, ...forecast])} fill="none" stroke="#151514" strokeWidth="1.8" strokeDasharray="5 4" />}
      <circle cx={x(today.t)} cy={y(today.health)} r="3.5" fill="#151514" />
    </svg>
  );
}

const MonitoringTab = ({ selectedProduct }) => {
  const { byId, connected } = useTelemetry();
  const [report, setReport] = useState(null);
  const [error, setError] = useState('');
  const live = byId.get(selectedProduct.id);

  useEffect(() => {
    let alive = true;
    api.getHealth(selectedProduct.id)
      .then(r => { if (alive) setReport(r); })
      .catch(e => { if (alive) setError(e.message); });
    return () => { alive = false; };
  }, [selectedProduct.id]);

  if (error) return <p className="text-red-700">Не удалось получить данные мониторинга: {error}</p>;
  if (!report) return <p className="text-slate-500">Загружаю данные мониторинга…</p>;
  if (!report.active) {
    return (
      <div className="rounded-xl border border-slate-300 bg-slate-50 p-6 text-slate-600">
        Изделие сейчас не работает (резерв, проектирование или списано), поэтому датчики не передают данные.
      </div>
    );
  }

  const s = live || report.sensors;
  const rul = report.rul;
  return (
    <div className="space-y-6">
      <div className="flex items-center gap-2 text-sm text-slate-500">
        <span className={`w-2 h-2 rounded-full ${connected ? 'bg-ok live-dot' : 'bg-slate-400'}`} />
        {connected ? 'Данные датчиков обновляются каждые 2 секунды' : 'Нет связи с потоком телеметрии — показан последний снимок'}
        <span className="text-slate-400">· демо-телеметрия, рассчитанная по данным паспорта</span>
      </div>

      <div className="grid lg:grid-cols-[1.3fr,1fr] gap-4">
        <div className="rounded-xl border border-slate-300 bg-white p-5">
          <VibrationScale value={s.vibration} zones={report.zones} />
        </div>
        <div className="grid grid-cols-2 gap-px bg-slate-300 border border-slate-300 rounded-xl overflow-hidden">
          <Metric label="Температура подшипника" value={s.temperature} unit="°C" />
          <Metric label="Нагрузка" value={s.load} unit="%" note={s.load < 50 ? 'ночная смена или простой' : 'рабочая смена'} />
          <Metric label="Индекс здоровья" value={s.health} unit="/100" />
          <Metric label="Последнее ТО" value={new Date(report.lastMaintenance).toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit' })} unit="" note={report.lastMaintenance.slice(0, 4)} />
        </div>
      </div>

      <div className="rounded-xl border border-slate-300 bg-white p-5">
        <div className="flex flex-wrap items-baseline justify-between gap-3 mb-3">
          <h3 className="text-lg font-medium">Индекс здоровья и прогноз остаточного ресурса</h3>
          {rul ? (
            <p className="text-sm">
              {rul.exhausted
                ? <span className="text-alarm font-medium">Ресурс до ремонта исчерпан — нужен ремонт</span>
                : <>До порога ремонта ≈ <span className="font-mono text-lg font-medium">{rul.days}</span> дн.
                    <span className="text-slate-500"> (от {rul.low} до {rul.high})</span></>}
            </p>
          ) : (
            <p className="text-sm text-ok">Износ стабилен, снижения не видно</p>
          )}
        </div>
        <HealthChart history={report.history} forecast={report.forecast} critical={report.healthCritical} />
        <p className="text-xs text-slate-500 mt-3 max-w-3xl">
          {rul && !rul.exhausted && <>Темп износа — {rul.ratePerMonth} пунктов в месяц. </>}
          Прогноз — линейный тренд по последним 45 дням после ТО (метод наименьших квадратов), интервал — ±2 стандартные ошибки наклона.
          Износ обычно растёт с ускорением, поэтому линейная оценка скорее оптимистична. Плановые ТО на графике видны как скачки вверх.
        </p>
      </div>
    </div>
  );
};

export default MonitoringTab;
