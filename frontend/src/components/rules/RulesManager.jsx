import { useState, useEffect, useCallback } from 'react';
import { Plus, Edit, Trash2, RefreshCw, Brain } from 'lucide-react';
import { api } from '../../api/client';
import Select from '../common/Select';

// ============================================================================
// Менеджер базы правил экспертной системы.
// ----------------------------------------------------------------------------
// Отдельный раздел, доступный из верхней навигации.
// Позволяет просматривать, добавлять, изменять, удалять правила и переключать
// их активность без правки кода — то есть инженер ОТК может настраивать
// систему сам.
// ============================================================================

// Опции для выпадающих списков формы
const CONDITION_TYPE_OPTIONS = [
  { value: 'operating_hours',      label: 'Моточасы наработки' },
  { value: 'working_days',         label: 'Дней в работе' },
  { value: 'remaining_resource',   label: 'Остаток ресурса (часы)' },
  { value: 'days_until_next_to',   label: 'Дней до планового ТО' },
  { value: 'days_since_last_event',label: 'Дней с последнего события' },
];
const OPERATOR_OPTIONS = [
  { value: '>',  label: 'больше (>)' },
  { value: '<',  label: 'меньше (<)' },
  { value: '>=', label: 'больше или равно (≥)' },
  { value: '<=', label: 'меньше или равно (≤)' },
  { value: '=',  label: 'равно (=)' },
  { value: '!=', label: 'не равно (≠)' },
];
const SEVERITY_OPTIONS = [
  { value: 'info',     label: 'Информация' },
  { value: 'warning',  label: 'Предупреждение' },
  { value: 'critical', label: 'Критическое' },
];

const SEVERITY_BADGE = {
  info:     'bg-blue-100 text-blue-700',
  warning:  'bg-amber-100 text-amber-700',
  critical: 'bg-red-100 text-red-700',
};

// Поиск человекочитаемой подписи по значению из выпадающего списка
const labelOf = (options, value) => options.find(o => o.value === value)?.label || value;

const EMPTY_RULE = {
  name: '',
  condition_type: 'operating_hours',
  operator: '>',
  threshold: 0,
  severity: 'warning',
  recommendation: ''
};

const RulesManager = () => {
  const [rules, setRules] = useState([]);
  const [loading, setLoading] = useState(true);
  const [editingId, setEditingId] = useState(null);  // id редактируемого правила, либо 'new' для нового, либо null
  const [form, setForm] = useState(EMPTY_RULE);
  const [saving, setSaving] = useState(false);

  // Загрузка списка правил
  const loadRules = useCallback(async () => {
    setLoading(true);
    try {
      const data = await api.getRules();
      setRules(data);
    } catch (err) {
      alert(`Не удалось загрузить правила: ${err.message}`);
    } finally {
      setLoading(false);
    }
  }, []);

  // eslint-disable-next-line react-hooks/set-state-in-effect -- загрузка данных при открытии экрана
  useEffect(() => { loadRules(); }, [loadRules]);

  const startCreate = () => {
    setForm(EMPTY_RULE);
    setEditingId('new');
  };

  const startEdit = (rule) => {
    setForm({
      name: rule.name,
      condition_type: rule.condition_type,
      operator: rule.operator,
      threshold: rule.threshold,
      severity: rule.severity,
      recommendation: rule.recommendation
    });
    setEditingId(rule.id);
  };

  const cancelEdit = () => {
    setEditingId(null);
    setForm(EMPTY_RULE);
  };

  const saveRule = async () => {
    if (!form.name.trim()) {
      alert('Заполните название правила');
      return;
    }
    if (!form.recommendation.trim()) {
      alert('Заполните рекомендацию');
      return;
    }
    setSaving(true);
    try {
      const payload = { ...form, threshold: Number(form.threshold) };
      if (editingId === 'new') {
        await api.createRule(payload);
      } else {
        await api.updateRule(editingId, payload);
      }
      await loadRules();
      cancelEdit();
    } catch (err) {
      alert(`Не удалось сохранить: ${err.message}`);
    } finally {
      setSaving(false);
    }
  };

  const toggleRule = async (id) => {
    try {
      await api.toggleRule(id);
      await loadRules();
    } catch (err) {
      alert(`Не удалось переключить правило: ${err.message}`);
    }
  };

  const deleteRule = async (id) => {
    if (!window.confirm('Удалить это правило? Действие необратимо.')) return;
    try {
      await api.deleteRule(id);
      await loadRules();
    } catch (err) {
      alert(`Не удалось удалить: ${err.message}`);
    }
  };

  // Форма создания/редактирования
  if (editingId !== null) {
    return (
      <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6 max-w-3xl mx-auto">
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-2xl font-bold text-slate-800">
            {editingId === 'new' ? 'Новое правило' : 'Редактирование правила'}
          </h2>
          <button onClick={cancelEdit} className="text-slate-500 hover:text-slate-700">
            ← Отмена
          </button>
        </div>

        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-2">
              Название правила <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              placeholder="Например: ТО приближается"
              className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500"
            />
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="md:col-span-1">
              <label className="block text-sm font-medium text-slate-700 mb-2">Тип условия</label>
              <Select value={form.condition_type} onChange={(v) => setForm({ ...form, condition_type: v })} options={CONDITION_TYPE_OPTIONS} className="w-full" />
            </div>
            <div className="md:col-span-1">
              <label className="block text-sm font-medium text-slate-700 mb-2">Оператор</label>
              <Select value={form.operator} onChange={(v) => setForm({ ...form, operator: v })} options={OPERATOR_OPTIONS} className="w-full" />
            </div>
            <div className="md:col-span-1">
              <label className="block text-sm font-medium text-slate-700 mb-2">Пороговое значение</label>
              <input
                type="number"
                value={form.threshold}
                onChange={(e) => setForm({ ...form, threshold: e.target.value })}
                className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500"
              />
            </div>
          </div>

          <div className="bg-slate-50 border border-slate-200 rounded-lg p-3 text-sm">
            <span className="text-slate-600">Условие: </span>
            <code className="bg-white px-2 py-1 rounded font-mono text-slate-800">
              {labelOf(CONDITION_TYPE_OPTIONS, form.condition_type)} {form.operator} {form.threshold}
            </code>
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-2">Уровень критичности</label>
            <Select value={form.severity} onChange={(v) => setForm({ ...form, severity: v })} options={SEVERITY_OPTIONS} className="w-full" />
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-2">
              Рекомендация <span className="text-red-500">*</span>
            </label>
            <textarea
              value={form.recommendation}
              onChange={(e) => setForm({ ...form, recommendation: e.target.value })}
              placeholder="Например: Запланируйте проведение технического обслуживания в ближайшие 30 дней."
              rows="3"
              className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500"
            />
            <p className="text-xs text-slate-500 mt-1">
              Этот текст увидит инженер, когда правило сработает на изделии.
            </p>
          </div>

          <div className="flex gap-3 pt-4">
            <button
              onClick={saveRule}
              disabled={saving}
              className="px-6 py-2 btn-primary text-white rounded-lg transition-colors font-medium disabled:opacity-60"
            >
              {saving ? 'Сохранение...' : 'Сохранить правило'}
            </button>
            <button
              onClick={cancelEdit}
              className="px-6 py-2 btn-secondary text-slate-800 rounded-lg transition-colors font-medium"
            >
              Отмена
            </button>
          </div>
        </div>
      </div>
    );
  }

  // Список правил
  return (
    <div className="space-y-4">
      <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6">
        <div className="flex items-start justify-between mb-2 gap-4 flex-wrap">
          <div>
            <h2 className="text-2xl font-bold text-slate-800 mb-1">База правил экспертной системы</h2>
            <p className="text-sm text-slate-500">
              Продукционные правила, по которым формируется экспертная оценка изделий.
              При срабатывании правила пользователь получает рекомендацию указанного уровня важности.
            </p>
          </div>
          <button
            onClick={startCreate}
            className="flex items-center gap-2 px-4 py-2 btn-primary text-white rounded-lg transition-colors font-medium"
          >
            <Plus className="w-5 h-5" />
            Добавить правило
          </button>
        </div>
        <div className="flex gap-4 text-sm text-slate-600 mt-4 pt-4 border-t">
          <span>Всего правил: <strong className="text-slate-800">{rules.length}</strong></span>
          <span>Активных: <strong className="text-green-700">{rules.filter(r => r.is_active).length}</strong></span>
          <span>Отключённых: <strong className="text-slate-500">{rules.filter(r => !r.is_active).length}</strong></span>
        </div>
      </div>

      {loading ? (
        <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-12 text-center">
          <RefreshCw className="w-10 h-10 text-blue-500 mx-auto mb-3 animate-spin" />
          <p className="text-slate-600">Загрузка правил...</p>
        </div>
      ) : rules.length === 0 ? (
        <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-12 text-center">
          <Brain className="w-16 h-16 text-slate-300 mx-auto mb-4" />
          <h3 className="text-lg font-medium text-slate-600 mb-2">База правил пустая</h3>
          <p className="text-slate-500 mb-4">Добавьте первое правило, чтобы экспертная система могла оценивать изделия</p>
          <button
            onClick={startCreate}
            className="px-6 py-3 btn-primary text-white rounded-lg transition-colors font-medium"
          >
            Добавить первое правило
          </button>
        </div>
      ) : (
        <div className="space-y-3">
          {rules.map(rule => (
            <div
              key={rule.id}
              className={`bg-white rounded-xl shadow-sm border ${rule.is_active ? 'border-slate-200' : 'border-slate-200 opacity-60'} p-5`}
            >
              <div className="flex items-start justify-between gap-4 mb-3">
                <div className="flex-1">
                  <div className="flex items-center gap-3 mb-2 flex-wrap">
                    <h3 className="text-lg font-semibold text-slate-800">{rule.name}</h3>
                    <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${SEVERITY_BADGE[rule.severity]}`}>
                      {labelOf(SEVERITY_OPTIONS, rule.severity)}
                    </span>
                    {!rule.is_active && (
                      <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-slate-200 text-slate-600">
                        Отключено
                      </span>
                    )}
                  </div>
                  <div className="text-sm text-slate-600 mb-2">
                    <span className="font-medium">Условие: </span>
                    <code className="bg-slate-100 px-2 py-0.5 rounded font-mono text-slate-800">
                      {labelOf(CONDITION_TYPE_OPTIONS, rule.condition_type)} {rule.operator} {rule.threshold}
                    </code>
                  </div>
                  <p className="text-sm text-slate-700">
                    <span className="font-medium text-slate-600">Рекомендация: </span>
                    {rule.recommendation}
                  </p>
                </div>
                <div className="flex flex-col gap-2 items-end flex-shrink-0">
                  <label className="inline-flex items-center cursor-pointer">
                    <input
                      type="checkbox"
                      checked={!!rule.is_active}
                      onChange={() => toggleRule(rule.id)}
                      className="sr-only peer"
                    />
                    <div className="relative w-11 h-6 bg-slate-300 peer-focus:ring-2 peer-focus:ring-blue-300 rounded-full peer peer-checked:after:translate-x-full peer-checked:bg-blue-600 after:content-[''] after:absolute after:top-0.5 after:left-[2px] after:bg-white after:rounded-full after:h-5 after:w-5 after:transition-all"></div>
                    <span className="ml-2 text-sm text-slate-600">Активно</span>
                  </label>
                  <div className="flex gap-1">
                    <button
                      onClick={() => startEdit(rule)}
                      className="p-2 bg-slate-100 text-slate-700 rounded hover:bg-slate-200 transition-colors"
                      title="Изменить"
                    >
                      <Edit className="w-4 h-4" />
                    </button>
                    <button
                      onClick={() => deleteRule(rule.id)}
                      className="p-2 bg-red-100 text-red-700 rounded hover:bg-red-200 transition-colors"
                      title="Удалить"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default RulesManager;
