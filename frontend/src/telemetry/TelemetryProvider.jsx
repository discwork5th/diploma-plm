import { useEffect, useMemo, useRef, useState } from 'react';
import { AlertTriangle, X } from 'lucide-react';
import { API_BASE } from '../api/client';
import { TelemetryContext } from './telemetryContext';

const TOAST_MS = 9000;

// Подключается к потоку /api/telemetry/stream (Server-Sent Events) и раздаёт
// свежий снимок всем компонентам. Новые тревоги (вибрация в зоне D) всплывают
// уведомлением в углу экрана: клик открывает карточку агрегата.
const TelemetryProvider = ({ children, onOpenProduct }) => {
  const [snapshot, setSnapshot] = useState(null);
  const [connected, setConnected] = useState(false);
  const [toasts, setToasts] = useState([]);
  const known = useRef(null);          // id агрегатов, по которым тревога уже была
  const lastToast = useRef(new Map()); // id → когда последний раз показывали уведомление

  useEffect(() => {
    const source = new EventSource(`${API_BASE}/api/telemetry/stream`);
    source.onopen = () => setConnected(true);
    source.onerror = () => setConnected(false);   // EventSource переподключится сам
    source.onmessage = (e) => {
      const data = JSON.parse(e.data);
      setSnapshot(data);
      setConnected(true);
      const alarms = data.alarms.filter(a => a.zone === 'D');
      if (known.current === null) {
        // Первый снимок: тревоги, что уже были до открытия страницы, не всплывают
        known.current = new Set(alarms.map(a => a.id));
        return;
      }
      // Значение около границы зоны может «дребезжать» 7.1 ↔ 7.2: по одному
      // агрегату показываем уведомление не чаще раза в 2 минуты
      const fresh = alarms.filter(a => !known.current.has(a.id) && Date.now() - (lastToast.current.get(a.id) || 0) > 120000);
      fresh.forEach(a => lastToast.current.set(a.id, Date.now()));
      known.current = new Set(alarms.map(a => a.id));
      if (fresh.length) {
        const now = Date.now();
        setToasts(t => [...t, ...fresh.map(a => ({ ...a, key: `${a.id}-${now}`, at: now }))].slice(-4));
      }
    };
    return () => source.close();
  }, []);

  // Уведомления исчезают сами
  useEffect(() => {
    if (!toasts.length) return undefined;
    const timer = setTimeout(() => setToasts(t => t.filter(x => Date.now() - x.at < TOAST_MS)), 1000);
    return () => clearTimeout(timer);
  }, [toasts]);

  const value = useMemo(() => ({
    snapshot, connected, byId: new Map((snapshot?.units || []).map(u => [u.id, u]))
  }), [snapshot, connected]);

  return (
    <TelemetryContext.Provider value={value}>
      {children}
      <div className="fixed bottom-4 right-4 left-4 sm:left-auto z-50 flex flex-col gap-2 sm:w-[380px]" aria-live="assertive">
        {toasts.map(t => (
          <div key={t.key} role="alert" className="toast-in bg-black text-white rounded-xl border border-white/15 shadow-lg p-3 pr-2 flex gap-3 items-start">
            <AlertTriangle className="w-5 h-5 text-alarm flex-shrink-0 mt-0.5" />
            <button className="text-left flex-1 min-w-0" onClick={() => { onOpenProduct(t.id); setToasts(x => x.filter(y => y.key !== t.key)); }}>
              <span className="block text-sm font-medium">Вибрация {t.vibration} мм/с — недопустимо</span>
              <span className="block text-sm text-white/70 truncate">{t.name}</span>
              <span className="block text-xs text-white/45 truncate">{t.location} · открыть карточку</span>
            </button>
            <button onClick={() => setToasts(x => x.filter(y => y.key !== t.key))} aria-label="Закрыть уведомление" className="p-1 text-white/50 hover:text-white">
              <X className="w-4 h-4" />
            </button>
          </div>
        ))}
      </div>
    </TelemetryContext.Provider>
  );
};

export default TelemetryProvider;
