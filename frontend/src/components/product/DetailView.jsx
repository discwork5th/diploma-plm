import { CheckCircle, Edit, FileDown } from 'lucide-react';
import ProductImage from '../common/ProductImage';
import DocumentsTab from './tabs/DocumentsTab';
import ExpertSystemTab from './tabs/ExpertSystemTab';
import GeneralTab from './tabs/GeneralTab';
import LifecycleTab from './tabs/LifecycleTab';
import MaintenanceTab from './tabs/MaintenanceTab';

// ============================================================================
// Детальный просмотр карточки
// ============================================================================
const DetailView = ({
  selectedProduct, stages, getStageStyle, tabs, activeTab, setActiveTab,
  onBack, onEdit, onDocumentUpload, onDeleteDocument, uploadingDoc,
  onDownloadPDF, downloadingPDF
}) => {
  const stageStyle = getStageStyle(selectedProduct.currentStage);
  const stageName = stages.find(s => s.id === selectedProduct.currentStage)?.name;

  return (
    <div className="space-y-4">
      <button onClick={onBack} className="flex items-center gap-2 text-slate-600 hover:text-slate-800 font-medium">
        ← Назад
      </button>

      <div className="bg-white rounded-xl shadow-sm border border-slate-300 p-6">
        <div className="flex flex-wrap items-start justify-between gap-4 mb-5">
          <div className="min-w-0">
            <h2 className="text-3xl font-semibold text-slate-900 leading-tight mb-2">{selectedProduct.name}</h2>
            <div className="flex flex-wrap gap-2">
              <span className="bg-slate-100 text-slate-700 border border-slate-300 px-2.5 py-0.5 rounded-md text-sm">
                {selectedProduct.type}
              </span>
              <span className={`px-2.5 py-0.5 rounded-md text-sm font-medium flex items-center gap-1 ${stageStyle.badge}`}>
                <CheckCircle className="w-4 h-4" />
                {stageName}
              </span>
            </div>
          </div>
          <div className="flex gap-2 flex-wrap">
            <button
              onClick={onDownloadPDF}
              disabled={downloadingPDF}
              className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
              title="Сформировать PDF-паспорт с QR-кодом"
            >
              <FileDown className="w-5 h-5" />
              {downloadingPDF ? 'Формирование...' : 'Скачать паспорт'}
            </button>
            <button onClick={onEdit} className="flex items-center gap-2 px-4 py-2 bg-white text-slate-800 border border-slate-300 rounded-lg hover:bg-slate-50 transition-colors">
              <Edit className="w-5 h-5" />
              Редактировать
            </button>
          </div>
        </div>

        <div className="flex flex-wrap items-stretch gap-5 mb-6">
          <ProductImage src={selectedProduct.image} alt={selectedProduct.name} className="w-56 h-44 object-contain bg-slate-50 border border-slate-200 rounded-lg p-2" />

          {/* Шильдик: то, что выбито на табличке самого агрегата */}
          <div className="nameplate rounded-lg flex-1 min-w-[300px] max-w-xl px-7 py-5">
            <span className="rivets" />
            <p className="font-medium text-slate-700 text-sm mb-3">{selectedProduct.manufacturer || 'Изготовитель не указан'}</p>
            <dl className="grid grid-cols-[auto,1fr] gap-x-6 gap-y-1.5">
              <dt className="text-slate-500">Заводской №</dt>
              <dd className="text-slate-900 font-mono text-lg leading-6">{selectedProduct.serialNumber || '—'}</dd>
              <dt className="text-slate-500">Изготовлено</dt>
              <dd className="text-slate-900 font-medium">{selectedProduct.manufactureDate || '—'}</dd>
              <dt className="text-slate-500">Введено в работу</dt>
              <dd className="text-slate-900 font-medium">{selectedProduct.commissioningDate || '—'}</dd>
              <dt className="text-slate-500">Место установки</dt>
              <dd className="text-slate-900 font-medium">{selectedProduct.location || '—'}</dd>
            </dl>
          </div>
        </div>

        <div className="border-b border-slate-200 mb-6">
          <div className="flex overflow-x-auto">
            {tabs.map(tab => {
              const Icon = tab.icon;
              return (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  className={`flex items-center gap-2 px-6 py-4 font-medium transition whitespace-nowrap ${
                    activeTab === tab.id ? 'border-b-2 border-blue-600 text-blue-600' : 'text-slate-600 hover:text-slate-800'
                  }`}
                >
                  <Icon size={20} />
                  {tab.label}
                </button>
              );
            })}
          </div>
        </div>

        {activeTab === 'general' && <GeneralTab selectedProduct={selectedProduct} />}
        {activeTab === 'lifecycle' && <LifecycleTab selectedProduct={selectedProduct} />}
        {activeTab === 'maintenance' && <MaintenanceTab selectedProduct={selectedProduct} />}
        {activeTab === 'expert' && <ExpertSystemTab selectedProduct={selectedProduct} />}
        {activeTab === 'documents' && (
          <DocumentsTab
            selectedProduct={selectedProduct}
            onDocumentUpload={onDocumentUpload}
            onDeleteDocument={onDeleteDocument}
            uploadingDoc={uploadingDoc}
          />
        )}
      </div>
    </div>
  );
};

export default DetailView;
