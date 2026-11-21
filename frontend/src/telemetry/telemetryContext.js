import { createContext, useContext } from 'react';

// Общий снимок телеметрии для всего приложения: один поток с сервера,
// а читать его может любой компонент через useTelemetry()
export const TelemetryContext = createContext({ snapshot: null, connected: false, byId: new Map() });
export const useTelemetry = () => useContext(TelemetryContext);
