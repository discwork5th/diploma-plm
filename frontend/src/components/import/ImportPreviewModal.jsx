import { CheckCircle, AlertCircle, RefreshCw } from 'lucide-react';

// ============================================================================
// Модальное окно превью импорта.
// ----------------------------------------------------------------------------
// Показывает результат анализа загруженного файла перед фактическим импортом.
// Если файл не подошёл — показывает причину и кнопку «Закрыть».
// Если подошёл — показывает статистику и кнопку «Импортировать».
// ============================================================================
const ImportPreviewModal = ({ preview, importing, onConfirm, onCancel }) => (
  <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
    <div className="bg-white rounded-xl shadow-2xl max-w-2xl w-full max-h-[90vh] overflow-y-auto">
      <div className="p-6">
        <div className="flex items-start justify-between mb-4">
          <div className="flex items-center gap-3">
            {preview.ok ? (
              <CheckCircle className="w-8 h-8 text-green-600 flex-shrink-0" />
            ) : (
              <AlertCircle className="w-8 h-8 text-red-600 flex-shrink-0" />
            )}
            <h2 className="text-xl font-bold text-slate-800">
              {preview.ok ? 'Готово к импорту' : 'Импорт невозможен'}
            </h2>
          </div>
        </div>

        <div className="text-sm text-slate-600 mb-4">
          Файл: <code className="bg-slate-100 px-2 py-0.5 rounded font-mono">{preview.fileName}</code>
        </div>

        {!preview.ok ? (
          // Случай ошибки
          <div className="bg-red-50 border border-red-200 rounded-lg p-4 mb-4">
            <p className="text-red-900 font-medium mb-1">Причина:</p>
            <p className="text-red-800 text-sm">{preview.reason}</p>
          </div>
        ) : (
          // Успешный анализ
          <>
            <div className="grid grid-cols-2 gap-3 mb-4">
              <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 text-center">
                <div className="text-2xl font-bold text-blue-700">{preview.totalRows}</div>
                <div className="text-xs text-blue-900">Всего строк в файле</div>
              </div>
              <div className="bg-green-50 border border-green-200 rounded-lg p-3 text-center">
                <div className="text-2xl font-bold text-green-700">{preview.validRows}</div>
                <div className="text-xs text-green-900">Готовы к импорту</div>
              </div>
            </div>

            {preview.validRows < preview.totalRows && (
              <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 mb-4 text-sm">
                <p className="text-amber-900">
                  <strong>{preview.totalRows - preview.validRows}</strong> строк не имеют ни «Наименования», ни «Серийного номера» — они будут пропущены.
                </p>
              </div>
            )}

            <div className="mb-4">
              <h4 className="font-semibold text-slate-800 mb-2 text-sm">Распознанные поля:</h4>
              <div className="flex flex-wrap gap-2">
                {preview.recognizedFields.map(f => (
                  <span key={f.key} className="bg-green-100 text-green-800 text-xs px-2 py-1 rounded-full">
                    ✓ {f.label}
                  </span>
                ))}
              </div>
            </div>

            <div className="mb-4">
              <h4 className="font-semibold text-slate-800 mb-2 text-sm">Все столбцы в файле:</h4>
              <div className="flex flex-wrap gap-2">
                {preview.columnsInFile.map((col, i) => {
                  const isKnown = preview.recognizedFields.some(f => f.aliases.includes(col));
                  return (
                    <span
                      key={i}
                      className={`text-xs px-2 py-1 rounded-full ${
                        isKnown ? 'bg-slate-100 text-slate-700' : 'bg-slate-50 text-slate-500'
                      }`}
                      title={isKnown ? 'Будет импортирован' : 'Будет проигнорирован'}
                    >
                      {col}
                    </span>
                  );
                })}
              </div>
              <p className="text-xs text-slate-500 mt-2">
                Серым отмечены столбцы, которые система не распознала — они будут проигнорированы.
              </p>
            </div>

            <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 mb-4 text-sm text-blue-900">
              <strong>Примечание:</strong> при попытке создать изделие с уже существующим серийным номером запись будет пропущена. Итоговый отчёт покажет точные числа.
            </div>
          </>
        )}

        <div className="flex gap-3 justify-end pt-4 border-t border-slate-200">
          <button
            onClick={onCancel}
            disabled={importing}
            className="px-5 py-2 btn-secondary text-slate-800 rounded-lg transition-colors font-medium disabled:opacity-50"
          >
            {preview.ok ? 'Отмена' : 'Закрыть'}
          </button>
          {preview.ok && (
            <button
              onClick={onConfirm}
              disabled={importing}
              className="px-5 py-2 btn-primary text-white rounded-lg transition-colors font-medium disabled:opacity-60 flex items-center gap-2"
            >
              {importing && <RefreshCw className="w-4 h-4 animate-spin" />}
              {importing ? 'Импортируется...' : `Импортировать ${preview.validRows} строк`}
            </button>
          )}
        </div>
      </div>
    </div>
  </div>
);

export default ImportPreviewModal;
