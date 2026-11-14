import { Clock, CheckCircle } from 'lucide-react';

const LifecycleTab = ({ selectedProduct }) => (
  <div>
    <h3 className="text-xl font-bold text-slate-800 mb-4">История жизненного цикла</h3>
    {selectedProduct.lifecycleHistory && selectedProduct.lifecycleHistory.length > 0 ? (
      <div className="space-y-4">
        {selectedProduct.lifecycleHistory.map((event, idx) => (
          <div key={idx} className="flex gap-4">
            <div className="flex flex-col items-center">
              <div className={`w-10 h-10 rounded-full flex items-center justify-center ${
                event.status === 'completed' ? 'bg-green-100' : 'bg-blue-100'
              }`}>
                {event.status === 'completed' ? (
                  <CheckCircle className="text-green-600" size={20} />
                ) : (
                  <Clock className="text-blue-600" size={20} />
                )}
              </div>
              {idx < selectedProduct.lifecycleHistory.length - 1 && (
                <div className="w-0.5 flex-1 bg-slate-200 my-2"></div>
              )}
            </div>
            <div className="flex-1 pb-6">
              <div className="bg-slate-50 p-4 rounded-lg border border-slate-200">
                <div className="flex justify-between items-start mb-2">
                  <h4 className="font-semibold text-slate-800">{event.event}</h4>
                  <span className="text-sm text-slate-500">{event.date}</span>
                </div>
                <p className="text-slate-600 text-sm">{event.description}</p>
              </div>
            </div>
          </div>
        ))}
      </div>
    ) : (
      <p className="text-slate-500 text-center py-8">История не заполнена</p>
    )}
  </div>
);

export default LifecycleTab;
