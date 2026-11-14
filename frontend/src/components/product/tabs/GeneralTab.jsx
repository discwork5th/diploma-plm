const GeneralTab = ({ selectedProduct }) => (
  <div className="space-y-6">
    {Object.keys(selectedProduct.specifications || {}).length > 0 && (
      <div>
        <h3 className="text-xl font-bold text-slate-800 mb-4">Технические характеристики</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {Object.entries(selectedProduct.specifications).map(([key, value]) => (
            <div key={key} className="bg-slate-50 p-4 rounded-lg border border-slate-200">
              <p className="text-sm text-slate-600 mb-1">{key}</p>
              <p className="text-lg font-semibold text-slate-800">{value}</p>
            </div>
          ))}
        </div>
      </div>
    )}
  </div>
);

export default GeneralTab;
