import { useState } from 'react';

const today = () => new Date().toISOString().split('T')[0];
const newSpecId = () => `spec-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;

const EMPTY_PRODUCT = {
  id: null,
  name: '',
  type: '',
  manufacturer: '',
  serialNumber: '',
  manufactureDate: '',
  commissioningDate: '',
  currentStage: 'design',
  image: '',
  specifications: {},
  lifecycleHistory: [],
  maintenance: {}
};

// В редакторе характеристики хранятся списком (чтобы можно было менять ключ),
// а в API — объектом { "Параметр": "Значение" }.
const specsObjectToList = (obj) =>
  Object.entries(obj || {}).map(([key, value]) => ({ id: newSpecId(), key, value }));

const specsListToObject = (list) =>
  Object.fromEntries(list.filter(s => s.key && s.key.trim()).map(s => [s.key, s.value]));

// Состояние формы редактирования изделия и все операции над ней
export default function useProductEditor() {
  const [editedProduct, setEditedProduct] = useState(null);
  const [specsList, setSpecsList] = useState([]);
  const [editorTab, setEditorTab] = useState('basic');

  const startNew = () => {
    setEditedProduct({ ...EMPTY_PRODUCT, manufactureDate: today() });
    setSpecsList([]);
    setEditorTab('basic');
  };

  const startEdit = (fullProduct) => {
    setEditedProduct({ ...fullProduct });
    setSpecsList(specsObjectToList(fullProduct.specifications));
    setEditorTab('basic');
  };

  const reset = () => {
    setEditedProduct(null);
    setSpecsList([]);
    setEditorTab('basic');
  };

  // Изделие в том виде, в котором его ждёт API
  const toPayload = () => ({ ...editedProduct, specifications: specsListToObject(specsList) });

  const handleImageUpload = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (event) => setEditedProduct(p => ({ ...p, image: event.target.result }));
    reader.readAsDataURL(file);
  };

  const lifecycle = {
    add: () => setEditedProduct(p => ({
      ...p,
      lifecycleHistory: [
        ...(p.lifecycleHistory || []),
        { date: today(), event: '', status: 'completed', description: '' }
      ]
    })),
    update: (index, field, value) => setEditedProduct(p => ({
      ...p,
      lifecycleHistory: p.lifecycleHistory.map((ev, i) => i === index ? { ...ev, [field]: value } : ev)
    })),
    remove: (index) => setEditedProduct(p => ({
      ...p,
      lifecycleHistory: p.lifecycleHistory.filter((_, i) => i !== index)
    })),
  };

  const specs = {
    add: () => setSpecsList(list => [...list, { id: newSpecId(), key: '', value: '' }]),
    updateKey: (id, key) => setSpecsList(list => list.map(s => s.id === id ? { ...s, key } : s)),
    updateValue: (id, value) => setSpecsList(list => list.map(s => s.id === id ? { ...s, value } : s)),
    remove: (id) => setSpecsList(list => list.filter(s => s.id !== id)),
  };

  return {
    editedProduct, setEditedProduct, specsList, editorTab, setEditorTab,
    startNew, startEdit, reset, toPayload, handleImageUpload, lifecycle, specs
  };
}
