// Сегмент круговой диаграммы (SVG)
function describeArcPath(cx, cy, r, startAngle, endAngle) {
  const start = polarToCartesian(cx, cy, r, endAngle);
  const end = polarToCartesian(cx, cy, r, startAngle);
  const largeArcFlag = endAngle - startAngle <= 180 ? '0' : '1';
  return `M ${cx} ${cy} L ${start.x} ${start.y} A ${r} ${r} 0 ${largeArcFlag} 0 ${end.x} ${end.y} Z`;
}
function polarToCartesian(cx, cy, r, angleInDegrees) {
  const angleInRadians = (angleInDegrees - 90) * Math.PI / 180.0;
  return { x: cx + r * Math.cos(angleInRadians), y: cy + r * Math.sin(angleInRadians) };
}

export const PieChart = ({ data, size = 200 }) => {
  const total = data.reduce((sum, d) => sum + d.value, 0);
  if (total === 0) {
    return (
      <div className="flex items-center justify-center" style={{ width: size, height: size }}>
        <p className="text-slate-400 text-sm">Нет данных</p>
      </div>
    );
  }
  const cx = size / 2;
  const cy = size / 2;
  const r = size / 2 - 4;
  // Заранее считаем, с какого угла начинается каждый сегмент
  const starts = data.reduce((acc, d, i) => [...acc, (acc[i] || 0) + (d.value / total) * 360], [0]);
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
      {data.map((d, i) => {
        const angle = (d.value / total) * 360;
        if (angle === 0) return null;
        // Если только один сегмент и он = 100%, рисуем круг
        if (angle >= 360) {
          return <circle key={i} cx={cx} cy={cy} r={r} fill={d.color} />;
        }
        const path = describeArcPath(cx, cy, r, starts[i], starts[i] + angle);
        return <path key={i} d={path} fill={d.color} />;
      })}
    </svg>
  );
};

// Столбчатая диаграмма
export const BarChart = ({ data }) => {
  if (data.length === 0) {
    return <p className="text-slate-400 text-sm text-center py-8">Нет данных</p>;
  }
  const max = Math.max(...data.map(d => d.value), 1);
  return (
    <div className="space-y-2">
      {data.map((d, i) => (
        <div key={i} className="flex items-center gap-3">
          <div className="w-44 flex-shrink-0 text-sm text-slate-700 truncate" title={d.label}>
            {d.label}
          </div>
          <div className="flex-1 bg-slate-100 rounded-sm h-7 overflow-hidden relative">
            <div
              className="h-full rounded-sm transition-all flex items-center justify-end pr-2"
              style={{ width: `${(d.value / max) * 100}%`, backgroundColor: d.color || '#535B63', minWidth: '24px' }}
            >
              <span className="text-xs font-semibold text-white">{d.value}</span>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
};
