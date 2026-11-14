import { FileText, Upload } from 'lucide-react';

const EXPECTED_COLUMNS = [
  ['Наименование', 'name'],
  ['Тип', 'type'],
  ['Производитель', 'manufacturer'],
  ['Серийный номер', 'serialNumber'],
  ['Дата производства', 'manufactureDate'],
  ['Этап', 'currentStage']
];

// Раздел импорта: выбор файла и подсказка по ожидаемой структуре
const ImportPage = ({ onFileSelected }) => (
  <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-8">
    <div className="max-w-2xl mx-auto">
      <h2 className="text-2xl font-bold text-slate-800 mb-6">Импорт данных</h2>
      <div className="space-y-6">
        <div className="border-2 border-dashed border-slate-300 rounded-xl p-8 text-center hover:border-blue-400 transition-colors">
          <Upload className="w-12 h-12 text-slate-400 mx-auto mb-4" />
          <h3 className="font-semibold text-lg text-slate-700 mb-2">Загрузите файл с данными</h3>
          <p className="text-slate-500 mb-4">Поддерживаются форматы: Excel (.xlsx, .xls), CSV, JSON</p>
          <label className="inline-flex items-center gap-2 px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors cursor-pointer font-medium">
            <FileText className="w-5 h-5" />
            Выбрать файл
            <input type="file" accept=".xlsx,.xls,.csv,.json" onChange={onFileSelected} className="hidden" />
          </label>
        </div>

        {/* Ожидаемая структура файла */}
        <div className="bg-slate-50 border border-slate-200 rounded-lg p-4">
          <h4 className="font-semibold text-slate-800 mb-3">Ожидаемая структура файла</h4>
          <p className="text-sm text-slate-600 mb-3">
            Первая строка должна содержать названия столбцов. Допустимы как русские, так и английские имена:
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-sm">
            {EXPECTED_COLUMNS.map(([ru, en]) => (
              <div key={en} className="bg-white border border-slate-200 rounded px-3 py-1.5">
                <strong>{ru}</strong> <span className="text-slate-500">/ {en}</span>
              </div>
            ))}
          </div>
          <p className="text-xs text-slate-500 mt-3">
            Для корректного импорта достаточно хотя бы одного из полей «Наименование» или «Серийный номер» в каждой строке. Перед
            окончательным импортом система покажет, что нашла в файле.
          </p>
        </div>
      </div>
    </div>
  </div>
);

export default ImportPage;
