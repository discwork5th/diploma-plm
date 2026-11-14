import { useMemo, useState } from 'react';
import { Clock, Download, Edit, Filter, Package, Plus, Search, Trash2 } from 'lucide-react';
import ProductImage from '../components/common/ProductImage';

// Каталог изделий: поиск, фильтр по этапу ЖЦ, карточки изделий
const CatalogPage = ({ products, stages, getStageStyle, onAdd, onExport, onOpen, onEdit, onDelete }) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [filterStage, setFilterStage] = useState('all');

  const filteredProducts = useMemo(() => {
    const query = searchTerm.toLowerCase();
    return products.filter(p => {
      const matchesSearch =
        !query ||
        [p.name, p.type, p.manufacturer, p.serialNumber].filter(Boolean).some(field => field.toLowerCase().includes(query));
      const matchesFilter = filterStage === 'all' || p.currentStage === filterStage;
      return matchesSearch && matchesFilter;
    });
  }, [products, searchTerm, filterStage]);

  return (
    <div className="space-y-4">
      <div className="bg-white rounded-xl shadow-sm p-4 border border-slate-200">
        <div className="flex flex-wrap gap-4 items-center justify-between">
          <div className="flex gap-3 flex-1 min-w-[300px]">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" />
              <input
                type="text"
                placeholder="Поиск по названию, типу, производителю или S/N..."
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
              className="flex items-center gap-2 px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors font-medium"
            >
              <Download className="w-5 h-5" />
              Экспорт
            </button>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {filteredProducts.map(product => {
          const stageStyle = getStageStyle(product.currentStage);
          const stageName = stages.find(s => s.id === product.currentStage)?.name;
          return (
            <div
              key={product.id}
              className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden hover:shadow-md transition-shadow"
            >
              <ProductImage src={product.image} alt={product.name} className="w-full h-48 object-contain bg-slate-50 p-2" />
              <div className="p-5">
                <div className="flex items-start justify-between mb-3">
                  <span className="text-xs font-medium text-slate-500">ID: {product.id}</span>
                  <span className={`px-3 py-1 rounded-full text-xs font-medium ${stageStyle.badge}`}>{stageName}</span>
                </div>
                <h3 className="font-bold text-lg text-slate-800 mb-2">{product.name || 'Без названия'}</h3>
                <div className="space-y-1 text-sm text-slate-600 mb-4">
                  <p>
                    <span className="font-medium">Тип:</span> {product.type || '—'}
                  </p>
                  <p>
                    <span className="font-medium">S/N:</span> {product.serialNumber || '—'}
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
