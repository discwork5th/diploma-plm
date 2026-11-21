import { useEffect, useMemo, useState } from 'react';
import { Clock, Download, Edit, Filter, MapPin, Package, Plus, Search, Trash2 } from 'lucide-react';
import ProductImage from '../components/common/ProductImage';

// Каталог изделий: поиск, фильтр по этапу ЖЦ, карточки изделий
const CatalogPage = ({ products, stages, getStageStyle, onAdd, onExport, onOpen, onEdit, onDelete }) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [filterStage, setFilterStage] = useState('all');
  const [filterLocation, setFilterLocation] = useState('all');
  // Карточек в парке сотни: показываем порциями, чтобы страница не тормозила
  const PAGE = 30;
  const [shown, setShown] = useState(PAGE);

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
      return matchesSearch && matchesFilter && matchesLocation;
    });
  }, [products, searchTerm, filterStage, filterLocation]);

  useEffect(() => setShown(PAGE), [searchTerm, filterStage, filterLocation]);

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
            <div className="relative">
              <Filter className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" />
              <select
                value={filterStage}
                onChange={e => setFilterStage(e.target.value)}
                className="pl-10 pr-8 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent appearance-none bg-white"
              >
                <option value="all">Все этапы</option>
                {stages.map(stage => (
                  <option key={stage.id} value={stage.id}>
                    {stage.name}
                  </option>
                ))}
              </select>
            </div>
            <div className="relative">
              <MapPin className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" />
              <select
                value={filterLocation}
                onChange={e => setFilterLocation(e.target.value)}
                className="pl-10 pr-8 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent appearance-none bg-white max-w-xs"
              >
                <option value="all">Все места</option>
                {locations.map(loc => <option key={loc} value={loc}>{loc}</option>)}
              </select>
            </div>
          </div>
          <div className="flex gap-2">
            <button
              onClick={onAdd}
              className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors font-medium"
            >
              <Plus className="w-5 h-5" />
              Добавить
            </button>
            <button
              onClick={onExport}
              className="flex items-center gap-2 px-4 py-2 bg-white text-slate-800 border border-slate-300 rounded-lg hover:bg-slate-50 transition-colors font-medium"
            >
              <Download className="w-5 h-5" />
              Экспорт
            </button>
          </div>
        </div>
      </div>

      <p className="text-sm text-slate-500 px-1">
        Найдено: {filteredProducts.length}{filteredProducts.length > shown ? `, показано ${shown}` : ''}
      </p>

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
                  <p className="font-display text-slate-800 tracking-wide">
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
                    className="flex-1 px-3 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors text-sm font-medium"
                  >
                    Открыть
                  </button>
                  <button
                    onClick={e => onEdit(product, e)}
                    className="px-3 py-2 bg-slate-100 text-slate-700 rounded-lg hover:bg-slate-200 transition-colors"
                  >
                    <Edit className="w-4 h-4" />
                  </button>
                  <button
                    onClick={e => onDelete(product.id, e)}
                    className="px-3 py-2 bg-red-100 text-red-700 rounded-lg hover:bg-red-200 transition-colors"
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
            className="px-6 py-2 bg-white border border-slate-300 rounded-lg text-slate-700 hover:bg-slate-50 font-medium">
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
            className="px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors font-medium"
          >
            Добавить первое изделие
          </button>
        </div>
      )}
    </div>
  );
};

export default CatalogPage;
