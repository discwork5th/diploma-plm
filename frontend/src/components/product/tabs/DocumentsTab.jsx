import { Upload, FileText, Download, Trash2 } from 'lucide-react';
import { api } from '../../../api/client';

const DocumentsTab = ({ selectedProduct, onDocumentUpload, onDeleteDocument, uploadingDoc }) => (
  <div className="space-y-6">
    <div>
      <div className="flex justify-between items-center mb-4">
        <h3 className="text-xl font-bold text-slate-800">Документация</h3>
        <label className={`flex items-center gap-2 px-4 py-2 rounded-lg transition-colors cursor-pointer font-medium ${
          uploadingDoc ? 'bg-slate-400 text-white cursor-not-allowed' : 'bg-blue-600 text-white hover:bg-blue-700'
        }`}>
          <Upload className="w-5 h-5" />
          {uploadingDoc ? 'Загрузка...' : 'Загрузить файл'}
          <input
            type="file"
            multiple
            onChange={onDocumentUpload}
            disabled={uploadingDoc}
            className="hidden"
          />
        </label>
      </div>

      <div className="space-y-2">
        {selectedProduct.documents && selectedProduct.documents.length > 0 ? (
          selectedProduct.documents.map((doc) => (
            <div key={doc.id} className="bg-slate-50 p-4 rounded-lg border border-slate-200 hover:border-blue-300 transition flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-blue-100 rounded flex items-center justify-center">
                  <FileText className="text-blue-600" size={20} />
                </div>
                <div>
                  <p className="font-medium text-slate-800">{doc.name}</p>
                  <p className="text-sm text-slate-500">{doc.type} • {doc.size} • {doc.date}</p>
                </div>
              </div>
              <div className="flex gap-2">
                <a
                  href={api.documentDownloadUrl(doc.id)}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="px-3 py-2 bg-blue-100 text-blue-700 rounded hover:bg-blue-200 transition flex items-center gap-1"
                  title="Скачать"
                >
                  <Download size={16} />
                </a>
                <button
                  onClick={() => onDeleteDocument(doc.id)}
                  className="px-3 py-2 bg-red-100 text-red-700 rounded hover:bg-red-200 transition"
                  title="Удалить"
                >
                  <Trash2 size={16} />
                </button>
              </div>
            </div>
          ))
        ) : (
          <p className="text-slate-500 text-center py-8">Документы не загружены</p>
        )}
      </div>
    </div>

    <div className="bg-blue-50 border border-blue-200 p-4 rounded-lg">
      <h4 className="font-semibold text-blue-900 mb-2">Поддерживаемые форматы</h4>
      <p className="text-sm text-blue-700">
        PDF, DOC, DOCX, XLS, XLSX, DWG, DXF, STEP, IGES, JPG, PNG, CSV, JSON, XML и другие.
        Максимальный размер файла: 50 МБ.
      </p>
    </div>
  </div>
);

export default DocumentsTab;
