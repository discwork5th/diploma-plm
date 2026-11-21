// Показатель для верхнего ряда: число и подпись. Цвет числа — только у состояний.
const SummaryTile = ({ label, value, tone = 'text-slate-900', onClick }) => {
  const Tag = onClick ? 'button' : 'div';
  return (
    <Tag
      onClick={onClick}
      className={`bg-white p-5 text-left ${onClick ? 'hover:bg-slate-50 transition-colors' : ''}`}
    >
      <div className={`font-mono text-4xl leading-none mb-2 ${tone}`}>{value}</div>
      <div className="text-sm text-slate-500">{label}</div>
    </Tag>
  );
};

export default SummaryTile;
