import { useState, useEffect, useCallback } from 'react';
import { Package, Factory, Clock, CheckCircle, AlertCircle, RefreshCw, AlertTriangle, ShieldCheck } from 'lucide-react';
import { api } from '../../api/client';
import { BarChart, PieChart } from './Charts';
import SummaryTile from './SummaryTile';

// ============================================================================
// Дашборд — стартовый экран со сводной статистикой
// ----------------------------------------------------------------------------
// Отображает общее состояние парка оборудования, распределение по этапам ЖЦ,
// типам и уровням критичности, а также списки изделий, требующих внимания.
// Данные получает одним запросом с /api/dashboard/summary.
// ============================================================================

// Палитра для диаграмм
const STAGE_COLORS = {
  blue:   '#45648D',
  purple: '#7B6E93',
  green:  '#4F8A64',
  yellow: '#B8913C',
  red:    '#A8483A',
  gray:   '#9AA2AA',
};

const Dashboard = ({ onOpenProduct, onGoCatalog }) => {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await api.getDashboardSummary();
      setData(result);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, []);

  // eslint-disable-next-line react-hooks/set-state-in-effect -- загрузка данных при открытии экрана
  useEffect(() => { load(); }, [load]);

  if (loading) {
    return (
      <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-12 text-center">
        <RefreshCw className="w-10 h-10 text-blue-500 mx-auto mb-3 animate-spin" />
        <p className="text-slate-600">Загрузка статистики...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-red-50 border border-red-200 rounded-xl p-6">
        <p className="text-red-900 font-medium mb-2">Не удалось загрузить дашборд</p>
        <p className="text-red-700 text-sm mb-3">{error}</p>
        <button
          onClick={load}
          className="px-4 py-2 bg-red-600 text-white rounded hover:bg-red-700 text-sm font-medium"
        >
          Повторить
        </button>
      </div>
    );
  }

  if (!data) return null;

  // Подготовка данных для диаграмм
  const stagePieData = data.byStage
    .filter(s => s.count > 0)
    .map(s => ({
      label: s.name,
      value: s.count,
      color: STAGE_COLORS[s.color] || '#6b7280'
    }));

  const typeBarData = data.byType.map(t => ({
    label: t.type,
    value: t.count,
    color: '#535B63'
  }));

  const inOperation = data.byStage.find(s => s.id === 'operation')?.count || 0;
  const warningCount = data.bySeverity.warning + data.bySeverity.critical;

  return (
    <div className="space-y-6">
      {/* Заголовок */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h2 className="text-2xl font-bold text-slate-800">Сводная панель</h2>
          <p className="text-sm text-slate-500">
            Текущее состояние парка промышленного оборудования
          </p>
        </div>
        <button
          onClick={load}
          className="flex items-center gap-2 px-4 py-2 bg-white border border-slate-300 text-slate-700 rounded-lg hover:bg-slate-50 transition-colors text-sm font-medium"
        >
          <RefreshCw className="w-4 h-4" />
          Обновить
        </button>
      </div>

      {/* Верхний ряд — 4 плитки */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <SummaryTile
          label="Всего изделий в системе"
          value={data.totalProducts}
          icon={Package}
          color="bg-slate-700"
          onClick={onGoCatalog}
        />
        <SummaryTile
          label="В эксплуатации"
          value={inOperation}
          icon={Factory}
          color="bg-[#4F8A64]"
        />
        <SummaryTile
          label="Требуют внимания"
          value={warningCount}
          icon={AlertTriangle}
          color="bg-[#B8913C]"
        />
        <SummaryTile
          label="Критическое состояние"
          value={data.bySeverity.critical}
          icon={AlertCircle}
          color="bg-[#A8483A]"
        />
      </div>

      {/* Диаграммы */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Круговая — этапы ЖЦ */}
        <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-5">
          <h3 className="font-bold text-slate-800 mb-4">Распределение по этапам ЖЦ</h3>
          {stagePieData.length > 0 ? (
            <div className="flex items-center gap-6">
              <PieChart data={stagePieData} size={180} />
              <div className="flex-1 space-y-2">
                {stagePieData.map((s, i) => (
                  <div key={i} className="flex items-center gap-2 text-sm">
                    <div className="w-3 h-3 rounded-sm flex-shrink-0" style={{ backgroundColor: s.color }} />
                    <span className="text-slate-700 flex-1">{s.label}</span>
                    <span className="font-semibold text-slate-800">{s.value}</span>
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <p className="text-slate-400 text-sm text-center py-8">Нет данных</p>
          )}
        </div>

        {/* Столбчатая — типы оборудования */}
        <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-5">
          <h3 className="font-bold text-slate-800 mb-4">Распределение по типам оборудования</h3>
          <BarChart data={typeBarData} />
        </div>
      </div>

      {/* Списки изделий */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Критические */}
        <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-5">
          <div className="flex items-center gap-2 mb-4">
            <AlertCircle className="w-5 h-5 text-red-600" />
            <h3 className="font-bold text-slate-800">Требуют немедленного внимания</h3>
          </div>
          {data.criticalProducts.length === 0 && data.warningProducts.length === 0 ? (
            <div className="text-center py-8">
              <ShieldCheck className="w-12 h-12 text-green-500 mx-auto mb-2" />
              <p className="text-slate-600 text-sm">Все изделия в норме</p>
            </div>
          ) : (
            <div className="space-y-2">
              {[...data.criticalProducts, ...data.warningProducts].slice(0, 6).map((p) => {
                const isCritical = data.criticalProducts.some(c => c.id === p.id);
                return (
                  <div
                    key={p.id}
                    onClick={() => onOpenProduct(p.id)}
                    className={`border rounded-lg p-3 cursor-pointer transition-colors ${
                      isCritical ? 'bg-red-50 border-red-200 hover:border-red-400' : 'bg-amber-50 border-amber-200 hover:border-amber-400'
                    }`}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex-1 min-w-0">
                        <p className="font-medium text-slate-800 truncate">{p.name}</p>
                        <p className="text-xs text-slate-500 font-mono mt-0.5">{p.serialNumber || '—'}</p>
                      </div>
                      <span className={`px-2 py-0.5 rounded text-xs font-medium flex-shrink-0 ${
                        isCritical ? 'bg-red-200 text-red-900' : 'bg-amber-200 text-amber-900'
                      }`}>
                        {isCritical ? 'Критическое' : 'Предупреждение'} ({p.triggeredCount})
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Ближайшие ТО */}
        <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-5">
          <div className="flex items-center gap-2 mb-4">
            <Clock className="w-5 h-5 text-blue-600" />
            <h3 className="font-bold text-slate-800">Ближайшие ТО (30 дней)</h3>
          </div>
          {data.upcomingTO.length === 0 ? (
            <div className="text-center py-8">
              <CheckCircle className="w-12 h-12 text-green-500 mx-auto mb-2" />
              <p className="text-slate-600 text-sm">Нет запланированных ТО в ближайшие 30 дней</p>
            </div>
          ) : (
            <div className="space-y-2">
              {data.upcomingTO.slice(0, 6).map(p => {
                const overdue = p.daysUntilTO < 0;
                const urgent = p.daysUntilTO >= 0 && p.daysUntilTO <= 7;
                return (
                  <div
                    key={p.id}
                    onClick={() => onOpenProduct(p.id)}
                    className={`border rounded-lg p-3 cursor-pointer transition-colors ${
                      overdue ? 'bg-red-50 border-red-200 hover:border-red-400'
                        : urgent ? 'bg-amber-50 border-amber-200 hover:border-amber-400'
                        : 'bg-blue-50 border-blue-200 hover:border-blue-400'
                    }`}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex-1 min-w-0">
                        <p className="font-medium text-slate-800 truncate">{p.name}</p>
                        <p className="text-xs text-slate-500 font-mono mt-0.5">{p.serialNumber || '—'}</p>
                      </div>
                      <div className="text-right flex-shrink-0">
                        <p className={`text-xs font-semibold ${
                          overdue ? 'text-red-700' : urgent ? 'text-amber-700' : 'text-blue-700'
                        }`}>
                          {overdue
                            ? `Просрочено на ${Math.abs(p.daysUntilTO)} дн.`
                            : p.daysUntilTO === 0 ? 'Сегодня'
                            : `Через ${p.daysUntilTO} дн.`}
                        </p>
                        <p className="text-xs text-slate-500 mt-0.5">{p.nextTO}</p>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* Подпись внизу */}
      <div className="text-center text-xs text-slate-400">
        Данные обновлены: {new Date(data.generatedAt).toLocaleString('ru-RU')}
      </div>
    </div>
  );
};

export default Dashboard;
