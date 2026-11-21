import { Upload, Plus, Trash2 } from 'lucide-react';
import ProductImage from '../common/ProductImage';
import Select from '../common/Select';

// ============================================================================
// Редактор изделия
// ============================================================================
const ProductEditor = ({
  editedProduct, setEditedProduct, specsList, stages,
  editorTab, setEditorTab, editorTabs, saving,
  onSave, onCancel,
  onAddSpec, onUpdateSpecKey, onUpdateSpecValue, onDeleteSpec,
  onAddLifecycleEvent, onUpdateLifecycleEvent, onDeleteLifecycleEvent,
  onImageUpload
}) => (
  <div className="space-y-4">
    <div className="flex items-center justify-between">
      <button onClick={onCancel} className="flex items-center gap-2 text-slate-600 hover:text-slate-800 font-medium">
        ← Отмена
      </button>
      <button
        onClick={onSave}
        disabled={saving}
        className="px-6 py-2 btn-primary text-white rounded-lg transition-colors font-medium disabled:opacity-60 disabled:cursor-not-allowed"
      >
        {saving ? 'Сохранение...' : 'Сохранить изделие'}
      </button>
    </div>

    <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6">
      <h2 className="text-2xl font-bold text-slate-800 mb-6">
        {editedProduct.id ? 'Редактирование изделия' : 'Новое изделие'}
      </h2>

      <div className="border-b border-slate-200 mb-6">
        <div className="flex gap-2 overflow-x-auto">
          {editorTabs.map(tab => (
            <button
              key={tab.id}
              onClick={() => setEditorTab(tab.id)}
              className={`px-4 py-2 font-medium transition whitespace-nowrap rounded-t-lg ${
                editorTab === tab.id ? 'bg-blue-50 text-blue-600 border-b-2 border-blue-600' : 'text-slate-600 hover:text-slate-800 hover:bg-slate-50'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {editorTab === 'basic' && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="md:col-span-2">
            <label className="block text-sm font-medium text-slate-700 mb-2">
              Наименование <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              value={editedProduct.name}
              onChange={(e) => setEditedProduct({ ...editedProduct, name: e.target.value })}
              className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500"
              placeholder="Например: Электродвигатель АИР 132M4"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-2">
              Тип <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              value={editedProduct.type}
              onChange={(e) => setEditedProduct({ ...editedProduct, type: e.target.value })}
              className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-2">Производитель</label>
            <input
              type="text"
              value={editedProduct.manufacturer || ''}
              onChange={(e) => setEditedProduct({ ...editedProduct, manufacturer: e.target.value })}
              className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-2">Серийный номер</label>
            <input
              type="text"
              value={editedProduct.serialNumber || ''}
              onChange={(e) => setEditedProduct({ ...editedProduct, serialNumber: e.target.value })}
              className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-2">Место установки</label>
            <input
              type="text"
              value={editedProduct.location || ''}
              onChange={(e) => setEditedProduct({ ...editedProduct, location: e.target.value })}
              placeholder="Цех, участок или склад"
              className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-2">Дата производства</label>
            <input
              type="date"
              value={editedProduct.manufactureDate || ''}
              onChange={(e) => setEditedProduct({ ...editedProduct, manufactureDate: e.target.value })}
              className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-2">Дата ввода в эксплуатацию</label>
            <input
              type="date"
              value={editedProduct.commissioningDate || ''}
              onChange={(e) => setEditedProduct({ ...editedProduct, commissioningDate: e.target.value })}
              className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-2">Этап жизненного цикла</label>
            <Select value={editedProduct.currentStage} onChange={(v) => setEditedProduct({ ...editedProduct, currentStage: v })} options={stages.map(stage => ({ value: stage.id, label: stage.name }))} className="w-full" />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-2">Фотография изделия</label>
            <label className="w-full px-4 py-2 border border-slate-300 rounded-lg hover:bg-slate-50 transition cursor-pointer flex items-center justify-center gap-2 text-slate-600">
              <Upload className="w-5 h-5" />
              {editedProduct.image ? 'Изменить фото' : 'Загрузить фото'}
              <input type="file" accept="image/*" onChange={onImageUpload} className="hidden" />
            </label>
            {editedProduct.image && (
              <div className="mt-2">
                <ProductImage src={editedProduct.image} alt="Preview" className="w-full h-32 object-cover rounded-lg" />
              </div>
            )}
          </div>
        </div>
      )}

      {editorTab === 'specs' && (
        <div className="space-y-4">
          <div className="flex justify-between items-center">
            <h3 className="text-lg font-semibold text-slate-800">Технические характеристики</h3>
            <button onClick={onAddSpec} className="flex items-center gap-2 px-4 py-2 btn-primary text-white rounded-lg text-sm">
              <Plus className="w-4 h-4" />
              Добавить
            </button>
          </div>
          {specsList.length > 0 ? (
            <div className="space-y-3">
              {specsList.map(spec => (
                <div key={spec.id} className="flex gap-3 items-start">
                  <div className="flex-1 grid grid-cols-2 gap-3">
                    <input
                      type="text"
                      value={spec.key}
                      onChange={(e) => onUpdateSpecKey(spec.id, e.target.value)}
                      className="px-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                      placeholder="Название (напр. Мощность)"
                    />
                    <input
                      type="text"
                      value={spec.value}
                      onChange={(e) => onUpdateSpecValue(spec.id, e.target.value)}
                      className="px-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                      placeholder="Значение (напр. 11 кВт)"
                    />
                  </div>
                  <button onClick={() => onDeleteSpec(spec.id)} className="px-3 py-2 btn-secondary text-red-700 rounded-lg">
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-slate-500 text-center py-8">Характеристики не добавлены. Нажмите «Добавить», чтобы создать первую запись.</p>
          )}
        </div>
      )}

      {editorTab === 'lifecycle' && (
        <div className="space-y-4">
          <div className="flex justify-between items-center">
            <h3 className="text-lg font-semibold text-slate-800">История жизненного цикла</h3>
            <button onClick={onAddLifecycleEvent} className="flex items-center gap-2 px-4 py-2 btn-primary text-white rounded-lg text-sm">
              <Plus className="w-4 h-4" />
              Добавить событие
            </button>
          </div>
          {(editedProduct.lifecycleHistory || []).length > 0 ? (
            <div className="space-y-4">
              {editedProduct.lifecycleHistory.map((event, index) => (
                <div key={index} className="bg-slate-50 p-4 rounded-lg border border-slate-200 space-y-3">
                  <div className="flex justify-between items-start">
                    <h4 className="font-medium text-slate-800">Событие #{index + 1}</h4>
                    <button onClick={() => onDeleteLifecycleEvent(index)} className="text-red-600 hover:text-red-700">
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                    <input
                      type="date"
                      value={event.date}
                      onChange={(e) => onUpdateLifecycleEvent(index, 'date', e.target.value)}
                      className="px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                    />
                    <input
                      type="text"
                      value={event.event}
                      onChange={(e) => onUpdateLifecycleEvent(index, 'event', e.target.value)}
                      className="px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                      placeholder="Название события"
                    />
                    <Select value={event.status} onChange={(v) => onUpdateLifecycleEvent(index, 'status', v)} options={[{ value: 'completed', label: 'Выполнено' }, { value: 'scheduled', label: 'Запланировано' }]} />
                  </div>
                  <textarea
                    value={event.description || ''}
                    onChange={(e) => onUpdateLifecycleEvent(index, 'description', e.target.value)}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                    placeholder="Описание события"
                    rows="2"
                  />
                </div>
              ))}
            </div>
          ) : (
            <p className="text-slate-500 text-center py-8">События не добавлены</p>
          )}
        </div>
      )}

      {editorTab === 'maintenance' && (
        <div className="space-y-6">
          <h3 className="text-lg font-semibold text-slate-800">Данные обслуживания</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="md:col-span-2">
              <label className="block text-sm font-medium text-slate-700 mb-2">Дата следующего ТО</label>
              <input
                type="date"
                value={editedProduct.maintenance?.nextTO || ''}
                onChange={(e) => setEditedProduct({ ...editedProduct, maintenance: { ...(editedProduct.maintenance || {}), nextTO: e.target.value } })}
                className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500"
              />
              <p className="text-xs text-slate-500 mt-1">Дней до ТО рассчитывается автоматически от текущей даты.</p>
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-2">Моточасов наработано</label>
              <input
                type="number"
                value={editedProduct.maintenance?.operatingHours || ''}
                onChange={(e) => setEditedProduct({ ...editedProduct, maintenance: { ...(editedProduct.maintenance || {}), operatingHours: parseInt(e.target.value) || 0 } })}
                className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-2">Дней в работе</label>
              <input
                type="number"
                value={editedProduct.maintenance?.workingDays || ''}
                onChange={(e) => setEditedProduct({ ...editedProduct, maintenance: { ...(editedProduct.maintenance || {}), workingDays: parseInt(e.target.value) || 0 } })}
                className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <div className="md:col-span-2">
              <label className="block text-sm font-medium text-slate-700 mb-2">Остаток ресурса (часы)</label>
              <input
                type="number"
                value={editedProduct.maintenance?.remainingResource || ''}
                onChange={(e) => setEditedProduct({ ...editedProduct, maintenance: { ...(editedProduct.maintenance || {}), remainingResource: parseInt(e.target.value) || 0 } })}
                className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500"
              />
            </div>
          </div>
        </div>
      )}
    </div>
  </div>
);

export default ProductEditor;
