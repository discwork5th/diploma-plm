import { useState } from 'react';
import { Package } from 'lucide-react';

const ProductImage = ({ src, alt, className }) => {
  // Запоминаем, какая именно картинка не загрузилась: при смене src ошибка сбрасывается сама
  const [failedSrc, setFailedSrc] = useState(null);
  const error = failedSrc === src;

  if (!src || error) {
    return (
      <div className={`${className} bg-slate-100 flex items-center justify-center`}>
        <Package className="w-12 h-12 text-slate-300" />
      </div>
    );
  }
  return <img src={src} alt={alt} className={className} onError={() => setFailedSrc(src)} />;
};

export default ProductImage;
