import { useMemo, useState } from 'react';
import { Activity, Clock, Download, Edit, Filter, MapPin, Package, Plus, Search, Trash2, X } from 'lucide-react';
import ProductImage from '../components/common/ProductImage';
import Select from '../components/common/Select';

// Фильтр по состоянию (выводы экспертной системы). «Требуют внимания» —
// как на дашборде: и предупреждения, и аварийные
const SEVERITY_FILTERS = [
  { value: 'all', label: 'Любое состояние', test: () => true },
  { value: 'attention', label: 'Требуют внимания', dot: 'bg-caution', test: s => s === 'warning' || s === 'critical' },
  { value: 'critical', label: 'Аварийное', dot: 'bg-alarm', test: s => s === 'critical' },
  { value: 'warning', label: 'Предупреждение', dot: 'bg-caution', test: s => s === 'warning' },
  { value: 'normal', label: 'В норме', dot: 'bg-ok', test: s => s === 'normal' || s === 'info' }
];
const SEVERITY_DOT = { critical: 'bg-alarm', warning: 'bg-caution', info: 'bg-slate-400', normal: 'bg-ok' };
const SEVERITY_TEXT = { critical: 'Аварийное', warning: 'Предупреждение', info: 'Есть замечания', normal: 'В норме' };

// Каталог изделий: поиск, фильтр по этапу ЖЦ, карточки изделий
const CatalogPage = ({ products, stages, getStageStyle, onAdd, onExport, onOpen, onEdit, onDelete, filterRequest }) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [filterStage, setFilterStage] = useState('all');
  const [filterLocation, setFilterLocation] = useState('all');
  const [filterSeverity, setFilterSeverity] = useState('all');
  // Карточек в парке сотни: показываем порциями, чтобы страница не тормозила
  const PAGE = 30;
  // Сколько карточек показано; при смене поиска или фильтров снова первые PAGE.
  // Сброс считается при отрисовке, а не в эффекте: так не бывает лишнего кадра
  // со старым числом карточек
  const filterKey = `${searchTerm}|${filterStage}|${filterLocation}|${filterSeverity}`;
  const [paging, setPaging] = useState({ key: filterKey, shown: PAGE });
  const shown = paging.key === filterKey ? paging.shown : PAGE;
  const setShown = (n) => setPaging({ key: filterKey, shown: n });

  // Переход с дашборда или генплана: каталог сразу с нужными фильтрами
  const [seenRequest, setSeenRequest] = useState(null);
  if (filterRequest && filterRequest !== seenRequest) {
    setSeenRequest(filterRequest);
    setFilterLocation(filterRequest.location || 'all');
    setFilterStage(filterRequest.stage || 'all');
    setFilterSeverity(filterRequest.severity || 'all');
    setSearchTerm('');
  }
  const resetFilters = () => { setFilterLocation('all'); setFilterStage('all'); setFilterSeverity('all'); setSearchTerm(''); };

  const locations = useMemo(
    () => [...new Set(products.map(p => p.location).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'ru')),
    [products]
  );

  const filteredProducts = useMemo(() => {
    const query = searchTerm.toLowerCase();
    return products.filter(p => {
      const matchesSearch =
        !query ||
        [p.name, p.type, p.manufacturer, p.serialNumber, p.location].filter(Boolean).some(field => field.toLowerCase().includes(query));
      const matchesFilter = filterStage === 'all' || p.currentStage === filterStage;
      const matchesLocation = filterLocation === 'all' || p.location === filterLocation;
      const matchesSeverity = SEVERITY_FILTERS.find(f => f.value === filterSeverity).test(p.severity || 'normal');
      return matchesSearch && matchesFilter && matchesLocation && matchesSeverity;
    });
  }, [products, searchTerm, filterStage, filterLocation, filterSeverity]);

  // Сколько изделий в каждом пункте списка — видно до выбора
  const count = (fn) => products.filter(fn).length;
  const stageOptions = [{ value: 'all', label: 'Все этапы', count: products.length },
    ...stages.map(st => ({ value: st.id, label: st.name, count: count(p => p.currentStage === st.id) }))];
  const locationOptions = [{ value: 'all', label: 'Все места', count: products.length },
    ...locations.map(loc => ({ value: loc, label: loc, count: count(p => p.location === loc) }))];
  const severityOptions = SEVERITY_FILTERS.map(f => ({ value: f.value, label: f.label, dot: f.dot, count: count(p => f.test(p.severity || 'normal')) }));

  // Активные фильтры — плашками над результатами, у каждой крестик
  const chips = [
    filterStage !== 'all' && { key: 'stage', label: stages.find(st => st.id === filterStage)?.name, clear: () => setFilterStage('all') },
    filterLocation !== 'all' && { key: 'loc', label: filterLocation, clear: () => setFilterLocation('all') },
    filterSeverity !== 'all' && { key: 'sev', label: SEVERITY_FILTERS.find(f => f.value === filterSeverity).label, clear: () => setFilterSeverity('all') },
    searchTerm && { key: 'q', label: `«${searchTerm}»`, clear: () => setSearchTerm('') }
  ].filter(Boolean);



  return (
    <div className="space-y-4">
      <div className="bg-white rounded-xl shadow-sm p-4 border border-slate-200">
        <div className="flex flex-wrap gap-4 items-center justify-between">
          <div className="flex flex-col sm:flex-row gap-3 flex-1 w-full sm:min-w-[300px]">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" />
              <input
                type="text"
                placeholder="Поиск по названию, типу, месту установки или S/N..."
                value={searchTerm}
                onChange={e => setSearchTerm(e.target.value)}
                className="w-full pl-10 pr-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
            </div>
            <Select value={filterStage} onChange={setFilterStage} options={stageOptions} icon={Filter} label="Этап жизненного цикла" className="sm:w-52" />
            <Select value={filterLocation} onChange={setFilterLocation} options={locationOptions} icon={MapPin} label="Место установки" className="sm:w-60" />
            <Select value={filterSeverity} onChange={setFilterSeverity} options={severityOptions} icon={Activity} label="Состояние" className="sm:w-56" />
          </div>
          <div className="flex gap-2">
            <button
              onClick={onAdd}
              className="flex items-center gap-2 px-4 py-2 btn-primary text-white rounded-lg transition-colors font-medium"
            >
              <Plus className="w-5 h-5" />
              Добавить
            </button>
            <button
              onClick={onExport}
              className="flex items-center gap-2 px-4 py-2 btn-secondary text-slate-800 rounded-lg transition-colors font-medium"
            >
              <Download className="w-5 h-5" />
              Экспорт
            </button>
          </div>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2 px-1 text-sm">
        <span className="text-slate-600">
          Найдено <span className="font-mono text-slate-900">{filteredProducts.length}</span> из {products.length}
          {filteredProducts.length > shown ? `, показано ${shown}` : ''}
        </span>
        {chips.map(c => (
          <span key={c.key} className="flex items-center gap-1 pl-2.5 pr-1 py-0.5 rounded-lg bg-white border border-slate-300 text-slate-800">
            {c.label}
            <button onClick={c.clear} aria-label={`Убрать фильтр ${c.label}`} className="p-0.5 rounded text-slate-500 hover:text-slate-900 hover:bg-slate-100">
              <X className="w-3.5 h-3.5" />
            </button>
          </span>
        ))}
        {chips.length > 1 && (
          <button onClick={resetFilters} className="text-slate-600 underline underline-offset-2 hover:text-slate-900">Сбросить все</button>
        )}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {filteredProducts.slice(0, shown).map(product => {
          const stageStyle = getStageStyle(product.currentStage);
          const stageName = stages.find(s => s.id === product.currentStage)?.name;
          return (
            <div
              key={product.id}
              className="bg-white rounded-lg border border-slate-300 overflow-hidden hover:border-slate-500 transition-colors flex flex-col"
            >
              <ProductImage src={product.image} alt={product.name} className="w-full h-36 object-contain bg-slate-50 border-b border-slate-200 p-3" />
              <div className="p-5 flex flex-col flex-1">
                <div className="flex items-start justify-between gap-3 mb-2">
                  <h3 className="font-semibold text-lg leading-snug text-slate-900">{product.name || 'Без названия'}</h3>
                  <span className={`px-2 py-0.5 rounded-md text-xs font-medium whitespace-nowrap ${stageStyle.badge}`}>{stageName}</span>
                </div>
                <div className="space-y-1 text-sm text-slate-600 mb-4 flex-1">
                  <p>{product.type || '—'}</p>
                  <p className="flex items-center gap-2">
                    <span className={`w-2 h-2 rounded-full ${SEVERITY_DOT[product.severity] || 'bg-slate-400'}`} />
                    {SEVERITY_TEXT[product.severity] || 'В норме'}
                  </p>
                  <p className="font-mono text-[13px] text-slate-800">
                    Зав. № {product.serialNumber || '—'}
                  </p>
                  <p className="flex items-center gap-2">
                    <MapPin className="w-4 h-4 flex-shrink-0" />
                    <span className="truncate">{product.location || '—'}</span>
                  </p>
                  <p className="flex items-center gap-2">
                    <Clock className="w-4 h-4" />
                    {product.manufactureDate || '—'}
                  </p>
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={() => onOpen(product)}
                    className="flex-1 px-3 py-2 btn-primary text-white rounded-lg transition-colors text-sm font-medium"
                  >
                    Открыть
                  </button>
                  <button
                    onClick={e => onEdit(product, e)}
                    className="px-3 py-2 btn-secondary text-slate-800 rounded-lg transition-colors"
                  >
                    <Edit className="w-4 h-4" />
                  </button>
                  <button
                    onClick={e => onDelete(product.id, e)}
                    className="px-3 py-2 btn-secondary text-red-700 rounded-lg transition-colors"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {filteredProducts.length > shown && (
        <div className="text-center">
          <button onClick={() => setShown(shown + PAGE)}
            className="px-6 py-2 btn-secondary rounded-lg text-slate-800 font-medium">
            Показать ещё
          </button>
        </div>
      )}

      {filteredProducts.length === 0 && (
        <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-12 text-center">
          <Package className="w-16 h-16 text-slate-300 mx-auto mb-4" />
          <h3 className="text-lg font-medium text-slate-600 mb-2">
            {products.length === 0 ? 'В системе пока нет изделий' : 'Изделия не найдены'}
          </h3>
          <p className="text-slate-500 mb-4">
            {products.length === 0 ? 'Добавьте первое изделие или импортируйте данные' : 'Попробуйте изменить параметры поиска'}
          </p>
          <button
            onClick={onAdd}
            className="px-6 py-3 btn-primary text-white rounded-lg transition-colors font-medium"
          >
            Добавить первое изделие
          </button>
        </div>
      )}
    </div>
  );
};

export default CatalogPage;
