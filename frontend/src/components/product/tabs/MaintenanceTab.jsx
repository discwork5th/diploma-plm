import { AlertCircle } from 'lucide-react';

const MaintenanceTab = ({ selectedProduct }) => {
  const daysUntilTO = (() => {
    if (!selectedProduct.maintenance?.nextTO) return null;
    const target = new Date(selectedProduct.maintenance.nextTO);
    if (isNaN(target.getTime())) return null;
    const now = new Date();
    return Math.ceil((target - now) / (1000 * 60 * 60 * 24));
  })();

  // Фильтр событий ЖЦ: оставляем только те, что относятся к обслуживанию
  // (ТО, ремонты, замены, проверки) и отсеиваем «Производство», «Приёмочные
  // испытания», «Ввод в эксплуатацию». Сравниваем по словам, а не регуляркой,
  // потому что \b в регулярках JS не работает с кириллицей. «ТО» ищем только
  // как отдельное слово, иначе под него попадает любое слово с буквами «то».
  const keywords = ['обслуживани', 'ремонт', 'замен', 'проверк', 'осмотр', 'диагностик', 'регламент'];
  const isMaintenance = (eventName) => {
    const words = eventName.toLowerCase().split(/[^а-яёa-z0-9-]+/);
    return words.some(w => w === 'то' || w.startsWith('то-') || keywords.some(kw => w.includes(kw)));
  };
  const maintenanceEvents = (selectedProduct.lifecycleHistory || [])
    .filter(e => e.event && isMaintenance(e.event))
    .sort((a, b) => (b.date || '').localeCompare(a.date || '')); // от свежих к старым

  const m = selectedProduct.maintenance || {};
  const hasMetrics = m.operatingHours || m.workingDays || m.remainingResource;

  return (
    <div className="space-y-6">
      {daysUntilTO !== null && (
        <div className={`border p-4 rounded-lg flex items-start gap-3 ${
          daysUntilTO < 0 ? 'bg-red-50 border-red-200'
            : daysUntilTO <= 14 ? 'bg-amber-50 border-amber-200'
            : 'bg-green-50 border-green-200'
        }`}>
          <AlertCircle className={`flex-shrink-0 mt-0.5 ${
            daysUntilTO < 0 ? 'text-red-600' : daysUntilTO <= 14 ? 'text-amber-600' : 'text-green-600'
          }`} size={20} />
          <div>
            <h4 className={`font-semibold mb-1 ${
              daysUntilTO < 0 ? 'text-red-900' : daysUntilTO <= 14 ? 'text-amber-900' : 'text-green-900'
            }`}>
              {daysUntilTO < 0
                ? `ТО просрочено на ${Math.abs(daysUntilTO)} дн.`
                : daysUntilTO === 0 ? 'ТО назначено на сегодня'
                : `Следующее ТО через ${daysUntilTO} дн.`}
            </h4>
            <p className={`text-sm ${
              daysUntilTO < 0 ? 'text-red-700' : daysUntilTO <= 14 ? 'text-amber-700' : 'text-green-700'
            }`}>
              Запланировано на {m.nextTO}
            </p>
          </div>
        </div>
      )}

      <div>
        <h3 className="text-xl font-bold text-slate-800 mb-4">История технического обслуживания</h3>
        {maintenanceEvents.length > 0 ? (
          <div className="space-y-2">
            {maintenanceEvents.map((event, idx) => {
              const isCompleted = event.status === 'completed';
              return (
                <div
                  key={idx}
                  className={`p-4 rounded-lg border ${
                    isCompleted ? 'bg-green-50 border-green-200' : 'bg-blue-50 border-blue-200'
                  }`}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1 flex-wrap">
                        <h4 className="font-semibold text-slate-800">{event.event}</h4>
                        <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${
                          isCompleted ? 'bg-green-200 text-green-900' : 'bg-blue-200 text-blue-900'
                        }`}>
                          {isCompleted ? 'Выполнено' : 'Запланировано'}
                        </span>
                      </div>
                      {event.description && (
                        <p className="text-sm text-slate-600">{event.description}</p>
                      )}
                    </div>
                    <span className="text-sm text-slate-500 font-mono flex-shrink-0">
                      {event.date}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <p className="text-slate-500 text-center py-6 bg-slate-50 rounded-lg border border-slate-200">
            Работы по обслуживанию пока не зарегистрированы.<br />
            <span className="text-xs">Записи появляются автоматически из жизненного цикла изделия (события со словами «ТО», «ремонт», «замена», «проверка»).</span>
          </p>
        )}
      </div>

      {hasMetrics && (
        <div>
          <h3 className="text-xl font-bold text-slate-800 mb-4">Наработка</h3>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {m.operatingHours ? (
              <div className="bg-slate-50 p-4 rounded-lg border border-slate-200 text-center">
                <p className="text-3xl font-bold text-blue-600">{m.operatingHours.toLocaleString()}</p>
                <p className="text-sm text-slate-600 mt-1">Моточасов</p>
              </div>
            ) : null}
            {m.workingDays ? (
              <div className="bg-slate-50 p-4 rounded-lg border border-slate-200 text-center">
                <p className="text-3xl font-bold text-green-600">{m.workingDays}</p>
                <p className="text-sm text-slate-600 mt-1">Дней работы</p>
              </div>
            ) : null}
            {m.remainingResource ? (
              <div className="bg-slate-50 p-4 rounded-lg border border-slate-200 text-center">
                <p className="text-3xl font-bold text-slate-600">{m.remainingResource.toLocaleString()}</p>
                <p className="text-sm text-slate-600 mt-1">Ресурс до замены</p>
              </div>
            ) : null}
          </div>
        </div>
      )}
    </div>
  );
};

export default MaintenanceTab;
