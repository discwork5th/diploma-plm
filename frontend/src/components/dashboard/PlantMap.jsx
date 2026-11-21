import { useMemo, useState } from 'react';
import { SITE, PIPES, SITE_W, SITE_D, ROADS, RAIL } from './plantSite';

// ============================================================================
// Карта предприятия: каркасная изометрия корпусов на чёрном листе.
// ----------------------------------------------------------------------------
// Генплан вымышленный. Каждый корпус — прямоугольник на сетке (x, y — угол,
// w × d — размер в плане, h — высота) плюс характерные детали: шеды у цехов,
// труба у котельной, резервуары у очистных. Всё рисуется кодом в SVG через
// изометрическую проекцию, никаких картинок.
//
// Изометрия: точка (x, y, z) переходит на экран как
//   X = (x − y) · cos30° · S,   Y = (x + y) · sin30° · S − z · S.
// Чем больше x + y, тем ближе объект к зрителю, поэтому корпуса рисуются
// по возрастанию x + y — ближние перекрывают дальние (алгоритм художника).
// ============================================================================

const S = 22;                       // пикселей в одной клетке сетки
const COS = Math.cos(Math.PI / 6);
const SIN = 0.5;
const iso = (x, y, z = 0) => [(x - y) * COS * S, (x + y) * SIN * S - z * S];
const pts = (...points) => points.map(p => iso(...p).map(n => n.toFixed(1)).join(',')).join(' ');


const ALARM = '#E5484D';

// Высота метки над корпусом: над трубой, если она есть
const markerTop = (b) => (b.stack ? b.h + 4.9 : b.chimney ? b.h + 3.6 : b.h + 1.6);
const roofTop = (b) => b.h + (b.kind === 'shop' || b.kind === 'warehouse' ? 0.6 : 0);

// Метки рисуются отдельным слоем поверх всех корпусов, чтобы трубы и крыши
// ближних зданий не закрывали подписи дальних. Белый кружок — сколько единиц
// оборудования в корпусе, красное число рядом — сколько из них в аварийном
// состоянии.
function Marker({ b, stat, active }) {
  const [mx, my] = iso(b.x + b.w / 2, b.y + b.d / 2, markerTop(b));
  const [, baseY] = iso(b.x + b.w / 2, b.y + b.d / 2, roofTop(b));
  return (
    <g pointerEvents="none">
      <line x1={mx} y1={baseY} x2={mx} y2={my} stroke="#FFFFFF" strokeOpacity={active ? 0.9 : 0.45} />
      <circle cx={mx} cy={my - 11} r="11" fill={active ? '#FFFFFF' : '#000'} stroke="#FFFFFF" strokeWidth="1.2" />
      <text x={mx} y={my - 7} textAnchor="middle" className="font-mono" fontSize="11" fill={active ? '#000' : '#FFFFFF'}>{stat.total}</text>
      <text x={mx + 16} y={my - 7} className="font-sans" fontSize="11.5" fill="#FFFFFF" fillOpacity={active ? 1 : 0.75}>
        {b.short}
        {stat.critical > 0 && <tspan className="font-mono" fill={ALARM} dx="6">{stat.critical}</tspan>}
      </text>
    </g>
  );
}

// Прямоугольный корпус: видны крыша и две ближние стены
function Box({ x, y, w, d, h, z0 = 0, faces }) {
  return (
    <g>
      <polygon points={pts([x, y + d, z0], [x + w, y + d, z0], [x + w, y + d, h], [x, y + d, h])} fill={faces[1]} />
      <polygon points={pts([x + w, y, z0], [x + w, y + d, z0], [x + w, y + d, h], [x + w, y, h])} fill={faces[2]} />
      <polygon points={pts([x, y, h], [x + w, y, h], [x + w, y + d, h], [x, y + d, h])} fill={faces[0]} />
    </g>
  );
}

// Вертикальный цилиндр (труба, резервуар). Окружность в изометрии — эллипс
// с полуосями r·√1.5 по горизонтали и r·√0.5 по вертикали.
function Cylinder({ cx, cy, r, z0 = 0, h, fill }) {
  const [bx, by] = iso(cx, cy, z0);
  const [, ty] = iso(cx, cy, h);
  const rx = r * S * Math.sqrt(1.5), ry = r * S * Math.sqrt(0.5);
  return (
    <g>
      <path d={`M${bx - rx},${ty} L${bx - rx},${by} A${rx},${ry} 0 0 0 ${bx + rx},${by} L${bx + rx},${ty}`} fill={fill} />
      <ellipse cx={bx} cy={ty} rx={rx} ry={ry} fill={fill} />
    </g>
  );
}

function Building({ b, stat, selected, hovered, onSelect, onHover }) {
  const active = selected || hovered;
  const faces = active ? ['#1E1E1C', '#111110', '#0B0B0A'] : ['#121211', '#0A0A09', '#060605'];
  const { x, y, w, d, h } = b;
  const lineOpacity = active ? 1 : 0.55;

  const details = [];
  if (b.kind === 'shop') {
    // Шеды: пилообразная крыша с остеклёнными гранями
    const teeth = Math.round(w / 1.4);
    for (let i = 0; i < teeth; i++) {
      const x0 = x + (w / teeth) * i, x1 = x + (w / teeth) * (i + 1);
      details.push(<polygon key={`t${i}`} points={pts([x0, y, h], [x1, y, h + 0.55], [x1, y + d, h + 0.55], [x0, y + d, h])} fill={faces[0]} />);
      details.push(<polygon key={`g${i}`} points={pts([x1, y, h], [x1, y, h + 0.55], [x1, y + d, h + 0.55], [x1, y + d, h])} fill={faces[2]} />);
    }
  }
  if (b.kind === 'warehouse') {
    // Двускатная крыша: конёк вдоль длинной стороны
    details.push(<polygon key="r1" points={pts([x, y, h], [x + w, y, h], [x + w, y + d / 2, h + 0.7], [x, y + d / 2, h + 0.7])} fill={faces[0]} />);
    details.push(<polygon key="r2" points={pts([x, y + d / 2, h + 0.7], [x + w, y + d / 2, h + 0.7], [x + w, y + d, h], [x, y + d, h])} fill={faces[1]} />);
    details.push(<polygon key="r3" points={pts([x + w, y, h], [x + w, y + d / 2, h + 0.7], [x + w, y + d, h])} fill={faces[2]} />);
  }
  if (b.kind === 'office') {
    // Этажи и окна на фасаде
    for (let f = 1; f < h; f++) details.push(<polyline key={`f${f}`} points={pts([x, y + d, f], [x + w, y + d, f], [x + w, y, f])} fill="none" />);
    for (let i = 0.5; i < w; i += 0.75) details.push(<line key={`w${i}`} x1={iso(x + i, y + d, 0.2)[0]} y1={iso(x + i, y + d, 0.2)[1]} x2={iso(x + i, y + d, h - 0.2)[0]} y2={iso(x + i, y + d, h - 0.2)[1]} strokeDasharray="2 3" />);
  }
  if (b.chimney) details.push(<Cylinder key="ch" cx={x + w - 1} cy={y + 1} r={0.35} z0={h} h={h + 3.2} fill={faces[2]} />);
  if (b.stack) details.push(<Cylinder key="st" cx={x + w / 2} cy={y + d / 2} r={0.4} z0={h} h={h + 4.5} fill={faces[2]} />);
  if (b.vents) [1, 2.5, 4].forEach(i => details.push(<Cylinder key={`v${i}`} cx={x + i} cy={y + d / 2} r={0.22} z0={h} h={h + 1.1} fill={faces[2]} />));
  if (b.fans) [0.9, 2.4].forEach(i => {
    const [fx, fy] = iso(x + i, y + d / 2, h);
    details.push(<ellipse key={`fan${i}`} cx={fx} cy={fy} rx={0.5 * S * 1.22} ry={0.5 * S * 0.7} fill="none" />);
  });
  if (b.tank) details.push(<Cylinder key="tk" cx={x + w + 1.3} cy={y + 1} r={0.8} h={2.4} fill={faces[1]} />);
  if (b.clarifiers) for (let i = 0; i < b.clarifiers; i++) {
    details.push(<Cylinder key={`cl${i}`} cx={x + 1.5 + i * 3} cy={y + d / 2} r={1.25} z0={h} h={h + 0.6} fill={faces[1]} />);
  }

  return (
    <g
      role="button"
      tabIndex={0}
      aria-label={`${b.key}: ${stat ? `${stat.total} ед., аварийных ${stat.critical}` : 'нет данных'}`}
      aria-pressed={selected}
      onClick={() => onSelect(b.key)}
      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onSelect(b.key); } }}
      onMouseEnter={() => onHover(b.key)}
      onMouseLeave={() => onHover(null)}
      onFocus={() => onHover(b.key)}
      onBlur={() => onHover(null)}
      className="cursor-pointer outline-none"
    >
      <g stroke="#FFFFFF" strokeOpacity={lineOpacity} strokeWidth={active ? 1.1 : 0.8} strokeLinejoin="round">
        {b.kind !== 'pad' && <Box x={x} y={y} w={w} d={d} h={h} faces={faces} />}
        {b.kind === 'pad' && <polygon points={pts([x, y, h], [x + w, y, h], [x + w, y + d, h], [x, y + d, h])} fill={faces[0]} strokeDasharray="3 3" />}
        {details}
      </g>
    </g>
  );
}

const PlantMap = ({ byLocation, selected, onSelect }) => {
  const [hovered, setHovered] = useState(null);
  const stats = useMemo(() => new Map((byLocation || []).map(l => [l.location, l])), [byLocation]);
  const order = useMemo(() => [...SITE].sort((a, b) => (a.x + a.y + (a.w + a.d) / 2) - (b.x + b.y + (b.w + b.d) / 2)), []);

  // Границы рисунка: проецируем углы площадки с запасом сверху под трубы и метки
  const corners = [iso(0, 0), iso(SITE_W, 0), iso(0, SITE_D), iso(SITE_W, SITE_D)];
  const tops = SITE.map(b => iso(b.x + b.w / 2, b.y + b.d / 2, markerTop(b))[1] - 26);
  const minX = Math.min(...corners.map(c => c[0])) - 10, maxX = Math.max(...corners.map(c => c[0])) + 70;
  const minY = Math.min(...tops, ...corners.map(c => c[1])) - 6, maxY = Math.max(...corners.map(c => c[1])) + 8;

  const grid = [];
  for (let i = 0; i <= SITE_W; i += 1) grid.push(<line key={`gx${i}`} x1={iso(i, 0)[0]} y1={iso(i, 0)[1]} x2={iso(i, SITE_D)[0]} y2={iso(i, SITE_D)[1]} />);
  for (let j = 0; j <= SITE_D; j += 1) grid.push(<line key={`gy${j}`} x1={iso(0, j)[0]} y1={iso(0, j)[1]} x2={iso(SITE_W, j)[0]} y2={iso(SITE_W, j)[1]} />);

  return (
    <svg viewBox={`${minX} ${minY} ${maxX - minX} ${maxY - minY}`} className="w-full h-auto select-none" role="group" aria-label="Генплан предприятия">
      <g stroke="#FFFFFF" strokeOpacity="0.06" strokeWidth="0.6">{grid}</g>
      <polygon points={pts([0, 0], [SITE_W, 0], [SITE_W, SITE_D], [0, SITE_D])} fill="none" stroke="#FFFFFF" strokeOpacity="0.25" strokeDasharray="6 4" />
      <g fill="#FFFFFF" fillOpacity="0.06">
        {ROADS.map((r, i) => <polygon key={i} points={pts([r.x, r.y], [r.x + r.w, r.y], [r.x + r.w, r.y + r.d], [r.x, r.y + r.d])} />)}
      </g>
      <polyline points={pts(...RAIL.map(([a, b]) => [a, b]))} fill="none" stroke="#FFFFFF" strokeOpacity="0.3" strokeWidth="3" strokeDasharray="1 3" />
      <g fill="none" stroke="#FFFFFF" strokeOpacity="0.35" strokeWidth="1" strokeDasharray="4 3">
        {PIPES.map((p, i) => <polyline key={i} points={pts(...p.map(([a, b]) => [a, b, 0.05]))} />)}
      </g>
      {order.map(b => (
        <Building key={b.key} b={b} stat={stats.get(b.key)} selected={selected === b.key} hovered={hovered === b.key}
          onSelect={onSelect} onHover={setHovered} />
      ))}
      {order.filter(b => stats.has(b.key)).map(b => (
        <Marker key={`m-${b.key}`} b={b} stat={stats.get(b.key)} active={selected === b.key || hovered === b.key} />
      ))}
    </svg>
  );
};

export default PlantMap;
