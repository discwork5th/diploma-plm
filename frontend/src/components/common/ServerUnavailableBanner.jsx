import { AlertCircle, RefreshCw } from 'lucide-react';

const ServerUnavailableBanner = ({ onRetry }) => (
  <div className="bg-red-50 border border-red-200 rounded-xl p-6 max-w-2xl mx-auto mt-8">
    <div className="flex items-start gap-3">
      <AlertCircle className="text-red-600 flex-shrink-0 mt-1" size={24} />
      <div className="flex-1">
        <h3 className="text-lg font-semibold text-red-900 mb-2">Сервер недоступен</h3>
        <p className="text-red-700 mb-4">
          Не удалось подключиться к Backend. Убедитесь, что сервер запущен.
        </p>
        <button
          onClick={onRetry}
          className="flex items-center gap-2 px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors font-medium"
        >
          <RefreshCw className="w-4 h-4" />
          Повторить попытку
        </button>
      </div>
    </div>
  </div>
);

export default ServerUnavailableBanner;
