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
        ← Назад к каталогу
      </button>

      <div className="bg-white rounded-xl shadow-lg border border-slate-200 p-6">
        <div className="flex flex-wrap items-start gap-6 mb-6">
          <ProductImage src={selectedProduct.image} alt={selectedProduct.name} className="w-48 h-36 object-cover rounded-lg shadow-md" />
          <div className="flex-1 min-w-[280px]">
            <div className="flex flex-wrap items-start justify-between gap-3 mb-4">
              <div>
                <h2 className="text-3xl font-bold text-slate-800 mb-2">{selectedProduct.name}</h2>
                <p className="text-slate-600 mb-3">{selectedProduct.manufacturer}</p>
                <div className="flex flex-wrap gap-3">
                  <span className="bg-blue-100 text-blue-700 px-3 py-1 rounded-full text-sm font-medium">
                    {selectedProduct.type}
                  </span>
                  <span className={`px-3 py-1 rounded-full text-sm font-medium flex items-center gap-1 ${stageStyle.badge}`}>
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
                <button onClick={onEdit} className="flex items-center gap-2 px-4 py-2 bg-slate-600 text-white rounded-lg hover:bg-slate-700 transition-colors">
                  <Edit className="w-5 h-5" />
                  Редактировать
                </button>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4 pt-4 border-t">
              <div>
                <p className="text-sm text-slate-500">Серийный номер</p>
                <p className="font-mono font-semibold text-slate-800">{selectedProduct.serialNumber || '—'}</p>
              </div>
              <div>
                <p className="text-sm text-slate-500">Дата производства</p>
                <p className="font-semibold text-slate-800">{selectedProduct.manufactureDate || '—'}</p>
              </div>
            </div>
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
