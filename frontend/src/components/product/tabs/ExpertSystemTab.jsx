import { useState, useEffect, useCallback } from 'react';
import { AlertCircle, RefreshCw, ChevronDown, ChevronUp, AlertTriangle, Info, ShieldCheck } from 'lucide-react';
import { api } from '../../../api/client';

// ============================================================================
// Вкладка экспертной системы
// ----------------------------------------------------------------------------
// При открытии вкладки запрашивает оценку у бэкенда через GET /api/products/:id/evaluate
// и отображает результат: общее заключение, сработавшие правила, факты.
// ============================================================================

// Маппинг уровня критичности на цвета и иконки
const SEVERITY_STYLES = {
  normal: {
    bg: 'bg-green-50',
    border: 'border-green-300',
    text: 'text-green-900',
    accent: 'text-green-700',
    icon: ShieldCheck,
    label: 'Норма',
    description: 'По всем проверенным правилам отклонений не выявлено.'
  },
  info: {
    bg: 'bg-blue-50',
    border: 'border-blue-300',
    text: 'text-blue-900',
    accent: 'text-blue-700',
    icon: Info,
    label: 'Информация',
    description: 'Выявлены факторы, требующие внимания, но не критические.'
  },
  warning: {
    bg: 'bg-amber-50',
    border: 'border-amber-300',
    text: 'text-amber-900',
    accent: 'text-amber-700',
    icon: AlertTriangle,
    label: 'Предупреждение',
    description: 'Состояние изделия требует планирования технического обслуживания.'
  },
  critical: {
    bg: 'bg-red-50',
    border: 'border-red-300',
    text: 'text-red-900',
    accent: 'text-red-700',
    icon: AlertCircle,
    label: 'Критическое',
    description: 'Состояние изделия требует немедленного вмешательства.'
  }
};

// Названия фактов на русском (для отображения)
const FACT_LABELS = {
  operating_hours: 'Моточасов наработано',
  working_days: 'Дней в работе',
  remaining_resource: 'Остаток ресурса (ч)',
  days_until_next_to: 'Дней до планового ТО',
  days_since_last_event: 'Дней с последнего события'
};

const ExpertSystemTab = ({ selectedProduct }) => {
  const [evaluation, setEvaluation] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [showExplanation, setShowExplanation] = useState(false);

  const loadEvaluation = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await api.evaluateProduct(selectedProduct.id);
      setEvaluation(result);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [selectedProduct.id]);

  // Автоматически загружаем оценку при открытии вкладки
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- загрузка оценки при открытии вкладки
    loadEvaluation();
  }, [loadEvaluation]);

  if (loading && !evaluation) {
    return (
      <div className="text-center py-12">
        <RefreshCw className="w-10 h-10 text-blue-500 mx-auto mb-3 animate-spin" />
        <p className="text-slate-600">Применяем правила экспертной системы...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-red-50 border border-red-200 p-4 rounded-lg flex items-start gap-3">
        <AlertCircle className="text-red-600 flex-shrink-0 mt-0.5" size={20} />
        <div className="flex-1">
          <p className="text-red-900 font-medium">Не удалось получить оценку</p>
          <p className="text-red-700 text-sm mt-1">{error}</p>
          <button
            onClick={loadEvaluation}
            className="mt-3 px-4 py-2 bg-red-600 text-white rounded hover:bg-red-700 text-sm"
          >
            Повторить
          </button>
        </div>
      </div>
    );
  }

  if (!evaluation) return null;

  const style = SEVERITY_STYLES[evaluation.overallSeverity] || SEVERITY_STYLES.normal;
  const SeverityIcon = style.icon;

  return (
    <div className="space-y-6">
      {/* Общее заключение */}
      <div className={`${style.bg} ${style.border} border-2 rounded-xl p-6`}>
        <div className="flex items-start gap-4">
          <SeverityIcon className={`${style.accent} flex-shrink-0`} size={48} />
          <div className="flex-1">
            <div className="flex items-center gap-3 mb-2">
              <h3 className={`text-2xl font-bold ${style.text}`}>{style.label}</h3>
              <span className={`px-3 py-1 rounded-full text-xs font-medium ${style.bg} ${style.text} border ${style.border}`}>
                {evaluation.triggeredRules.length} из {evaluation.totalRulesChecked} правил сработало
              </span>
            </div>
            <p className={`${style.accent} mb-4`}>{style.description}</p>
            <div className="flex gap-2">
              <button
                onClick={loadEvaluation}
                disabled={loading}
                className="flex items-center gap-2 px-4 py-2 bg-white border border-slate-300 text-slate-700 rounded-lg hover:bg-slate-50 transition-colors text-sm font-medium disabled:opacity-60"
              >
                <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
                Переоценить
              </button>
              {evaluation.triggeredRules.length > 0 && (
                <button
                  onClick={() => setShowExplanation(!showExplanation)}
                  className="flex items-center gap-2 px-4 py-2 bg-white border border-slate-300 text-slate-700 rounded-lg hover:bg-slate-50 transition-colors text-sm font-medium"
                >
                  {showExplanation ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                  {showExplanation ? 'Скрыть объяснение' : 'Объяснить вывод'}
                </button>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Сработавшие правила (рекомендации) */}
      {evaluation.triggeredRules.length > 0 && (
        <div>
          <h3 className="text-xl font-bold text-slate-800 mb-4">Рекомендации</h3>
          <div className="space-y-3">
            {evaluation.triggeredRules.map((rule) => {
              const ruleStyle = SEVERITY_STYLES[rule.severity] || SEVERITY_STYLES.info;
              const RuleIcon = ruleStyle.icon;
              return (
                <div
                  key={rule.ruleId}
                  className={`${ruleStyle.bg} ${ruleStyle.border} border rounded-lg p-4`}
                >
                  <div className="flex items-start gap-3">
                    <RuleIcon className={`${ruleStyle.accent} flex-shrink-0 mt-0.5`} size={20} />
                    <div className="flex-1">
                      <h4 className={`font-semibold ${ruleStyle.text} mb-1`}>{rule.name}</h4>
                      <p className={`${ruleStyle.accent} text-sm`}>{rule.recommendation}</p>
                      {showExplanation && (
                        <div className="mt-3 pt-3 border-t border-slate-200 text-xs text-slate-600">
                          <p className="mb-1">
                            <span className="font-medium">Условие правила:</span>{' '}
                            <code className="bg-white px-1.5 py-0.5 rounded font-mono">
                              {rule.conditionText}
                            </code>
                          </p>
                          <p>
                            <span className="font-medium">Фактическое значение:</span>{' '}
                            <code className="bg-white px-1.5 py-0.5 rounded font-mono">
                              {rule.factValue}
                            </code>
                          </p>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Факты — данные, на которых построена оценка */}
      <div>
        <h3 className="text-xl font-bold text-slate-800 mb-4">Данные для оценки</h3>
        {Object.keys(evaluation.facts).length > 0 ? (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {Object.entries(evaluation.facts).map(([key, value]) => (
              <div key={key} className="bg-slate-50 border border-slate-200 rounded-lg p-3 flex justify-between items-center">
                <span className="text-sm text-slate-600">{FACT_LABELS[key] || key}</span>
                <span className="font-mono font-semibold text-slate-800">
                  {typeof value === 'number' ? value.toLocaleString('ru-RU') : value}
                </span>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-slate-500 text-sm">Недостаточно данных для оценки. Заполните раздел «Обслуживание».</p>
        )}
      </div>

      {/* Метаданные оценки */}
      <div className="bg-slate-50 border border-slate-200 rounded-lg p-3 text-xs text-slate-500">
        <div className="flex justify-between flex-wrap gap-2">
          <span>
            Оценка сформирована: {new Date(evaluation.evaluatedAt).toLocaleString('ru-RU')}
          </span>
          <span>
            Метод: продукционная экспертная система
          </span>
        </div>
      </div>
    </div>
  );
};

export default ExpertSystemTab;
