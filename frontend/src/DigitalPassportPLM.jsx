import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { Upload, FileText, Package, Factory, Clock, CheckCircle, AlertCircle, Download, Plus, Search, Filter, Wrench, Edit, Trash2, RefreshCw, Brain, ChevronDown, ChevronUp, AlertTriangle, Info, ShieldCheck, FileDown, QrCode } from 'lucide-react';
import * as XLSX from 'xlsx';
import Papa from 'papaparse';
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import QRCode from 'qrcode';

// ============================================================================
// Слой работы с API.
// Все обращения к бэкенду вынесены в отдельные функции, чтобы UI-код их вызывал
// единообразно (не разводя fetch'ы по всем компонентам).
// ============================================================================

const API_BASE = 'http://localhost:4000';

async function apiRequest(path, options = {}) {
  let response;
  try {
    response = await fetch(`${API_BASE}${path}`, options);
  } catch (err) {
    throw new Error('SERVER_UNAVAILABLE');
  }
  if (!response.ok) {
    let message = `Ошибка ${response.status}`;
    try {
      const body = await response.json();
      if (body.error) message = body.error;
    } catch { /* тело не JSON — оставляем дефолтное сообщение */ }
    throw new Error(message);
  }
  const text = await response.text();
  return text ? JSON.parse(text) : null;
}

const api = {
  getProducts: () => apiRequest('/api/products'),
  getProduct: (id) => apiRequest(`/api/products/${id}`),
  createProduct: (product) => apiRequest('/api/products', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(product)
  }),
  updateProduct: (id, product) => apiRequest(`/api/products/${id}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(product)
  }),
  deleteProduct: (id) => apiRequest(`/api/products/${id}`, { method: 'DELETE' }),
  getStages: () => apiRequest('/api/lifecycle-stages'),
  uploadDocument: (productId, file) => {
    const formData = new FormData();
    formData.append('file', file);
    return apiRequest(`/api/products/${productId}/documents`, {
      method: 'POST',
      body: formData
      // ВАЖНО: НЕ ставим Content-Type вручную — fetch сам выставит правильный
      // с boundary для multipart/form-data.
    });
  },
  documentDownloadUrl: (docId) => `${API_BASE}/api/documents/${docId}/download`,
  deleteDocument: (docId) => apiRequest(`/api/documents/${docId}`, { method: 'DELETE' }),
  evaluateProduct: (id) => apiRequest(`/api/products/${id}/evaluate`),

  // Работа с базой правил экспертной системы
  getRules: () => apiRequest('/api/expert-rules'),
  createRule: (rule) => apiRequest('/api/expert-rules', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(rule)
  }),
  updateRule: (id, rule) => apiRequest(`/api/expert-rules/${id}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(rule)
  }),
  deleteRule: (id) => apiRequest(`/api/expert-rules/${id}`, { method: 'DELETE' }),
  toggleRule: (id) => apiRequest(`/api/expert-rules/${id}/toggle`, { method: 'PATCH' }),

  // Дашборд
  getDashboardSummary: () => apiRequest('/api/dashboard/summary'),
};

// ============================================================================
// Генерация PDF-паспорта изделия с QR-кодом.
// ----------------------------------------------------------------------------
// Использует jsPDF + jspdf-autotable для красивых таблиц и библиотеку qrcode
// для встраивания QR-кода. Кириллица поддерживается через встроенный шрифт,
// который подгружается единожды и кешируется.
// ============================================================================

// Кеш для загруженного шрифта, чтобы повторные генерации не качали его заново
let fontCache = null;

// Грузим Roboto Regular для поддержки кириллицы.
// Источник — jsDelivr (зеркало npm-пакета @fontsource/roboto), TTF-файл с кириллическим subset.
// Если не загрузится — паспорт сформируется без кастомного шрифта (кириллица превратится в квадратики).
async function loadCyrillicFont() {
  if (fontCache) return fontCache;

  // Возможные источники шрифта (последовательно пробуем, пока не получится)
  const sources = [
    'https://cdn.jsdelivr.net/npm/@fontsource/roboto@5.0.13/files/roboto-cyrillic-400-normal.woff',
    'https://cdn.jsdelivr.net/npm/@fontsource/roboto@5.0.13/files/roboto-latin-400-normal.woff',
  ];

  // Но jsPDF плохо ест WOFF, нужен TTF. Возьмём TTF из googlefonts/roboto-2 (raw.githubusercontent).
  // Этот источник содержит полный шрифт с кириллицей в TrueType-формате.
  const ttfSources = [
    'https://cdn.jsdelivr.net/gh/googlefonts/roboto-2@main/src/hinted/Roboto-Regular.ttf',
    'https://raw.githubusercontent.com/openmaptiles/fonts/master/roboto/Roboto-Regular.ttf',
  ];

  for (const url of ttfSources) {
    try {
      const response = await fetch(url);
      if (!response.ok) continue;
      const buffer = await response.arrayBuffer();
      const bytes = new Uint8Array(buffer);
      let binary = '';
      // Конвертация ArrayBuffer -> base64 чанками, чтобы не упасть на больших файлах
      const chunk = 8192;
      for (let i = 0; i < bytes.length; i += chunk) {
        binary += String.fromCharCode.apply(null, bytes.subarray(i, i + chunk));
      }
      fontCache = btoa(binary);
      return fontCache;
    } catch (err) {
      console.warn('[PDF] Не удалось загрузить шрифт с', url, err);
    }
  }
  console.warn('[PDF] Не удалось загрузить кириллический шрифт, используется латиница');
  return null;
}

// Формат даты в стиле "15 марта 2024"
function formatDateRu(isoDate) {
  if (!isoDate) return '—';
  try {
    const d = new Date(isoDate);
    if (isNaN(d.getTime())) return isoDate;
    return d.toLocaleDateString('ru-RU', { year: 'numeric', month: 'long', day: 'numeric' });
  } catch {
    return isoDate;
  }
}

async function generateProductPassportPDF(product, stages, evaluation) {
  const doc = new jsPDF({ unit: 'mm', format: 'a4' });

  // Подгружаем кириллический шрифт
  const fontBase64 = await loadCyrillicFont();
  if (fontBase64) {
    doc.addFileToVFS('Roboto-Regular.ttf', fontBase64);
    doc.addFont('Roboto-Regular.ttf', 'Roboto', 'normal');
    doc.setFont('Roboto');
  }

  const pageWidth = doc.internal.pageSize.getWidth();
  const margin = 15;
  let y = margin;

  // ---- Шапка ----
  doc.setFontSize(18);
  doc.text('ЦИФРОВОЙ ПАСПОРТ ИЗДЕЛИЯ', margin, y);
  y += 8;
  doc.setFontSize(10);
  doc.setTextColor(100, 100, 100);
  doc.text(`Сформирован: ${new Date().toLocaleString('ru-RU')}`, margin, y);
  doc.text('Система управления ЖЦИ • СГТУ им. Гагарина Ю.А.', pageWidth - margin, y, { align: 'right' });
  y += 4;
  doc.setDrawColor(200, 200, 200);
  doc.line(margin, y, pageWidth - margin, y);
  y += 8;

  // ---- Генерируем QR-код, который указывает на электронную карточку ----
  const qrUrl = `${window.location.origin}/?productId=${product.id}`;
  const qrDataUrl = await QRCode.toDataURL(qrUrl, { width: 200, margin: 1 });
  const qrSize = 35;
  const qrTop = y;
  doc.addImage(qrDataUrl, 'PNG', pageWidth - margin - qrSize, qrTop, qrSize, qrSize);

  // ---- Название и тип ----
  doc.setTextColor(0, 0, 0);
  doc.setFontSize(14);
  const maxNameWidth = pageWidth - margin * 2 - 40;
  const nameLines = doc.splitTextToSize(product.name || 'Без названия', maxNameWidth);
  doc.text(nameLines, margin, y + 5);
  y += 5 + nameLines.length * 6;

  doc.setFontSize(11);
  doc.setTextColor(80, 80, 80);
  const manufacturer = product.manufacturer || '—';
  const manufacturerLines = doc.splitTextToSize(manufacturer, maxNameWidth);
  doc.text(manufacturerLines, margin, y);
  y += manufacturerLines.length * 5 + 2;

  const stageName = stages.find(s => s.id === product.currentStage)?.name || product.currentStage;
  doc.text(`Этап жизненного цикла: ${stageName}`, margin, y);
  y += 12;

  // Если текст оказался короче QR-кода — опускаем y ниже QR, чтобы следующий блок не наложился
  const qrBottom = qrTop + qrSize + 4;
  if (y < qrBottom) y = qrBottom;

  // ---- Основные данные ----
  doc.setTextColor(0, 0, 0);
  doc.setFontSize(12);
  doc.text('Идентификационные данные', margin, y);
  y += 2;

  autoTable(doc, {
    startY: y,
    margin: { left: margin, right: margin },
    styles: { font: fontBase64 ? 'Roboto' : 'helvetica', fontSize: 10, cellPadding: 2 },
    headStyles: { fillColor: [59, 130, 246], textColor: 255, font: fontBase64 ? 'Roboto' : 'helvetica', fontStyle: 'normal' },
    body: [
      ['Тип', product.type || '—'],
      ['Серийный номер', product.serialNumber || '—'],
      ['Дата производства', formatDateRu(product.manufactureDate)],
      ['Дата ввода в эксплуатацию', formatDateRu(product.commissioningDate)],
    ],
    theme: 'grid',
  });
  y = doc.lastAutoTable.finalY + 6;

  // ---- Технические характеристики ----
  const specsEntries = Object.entries(product.specifications || {});
  if (specsEntries.length > 0) {
    doc.setFontSize(12);
    doc.text('Технические характеристики', margin, y);
    y += 2;

    autoTable(doc, {
      startY: y,
      margin: { left: margin, right: margin },
      styles: { font: fontBase64 ? 'Roboto' : 'helvetica', fontSize: 10, cellPadding: 2 },
      headStyles: { fillColor: [59, 130, 246], textColor: 255, font: fontBase64 ? 'Roboto' : 'helvetica', fontStyle: 'normal' },
      head: [['Параметр', 'Значение']],
      body: specsEntries.map(([k, v]) => [k, String(v)]),
      theme: 'striped',
    });
    y = doc.lastAutoTable.finalY + 6;
  }

  // ---- Данные обслуживания ----
  const m = product.maintenance || {};
  if (m.nextTO || m.operatingHours || m.workingDays || m.remainingResource) {
    doc.setFontSize(12);
    doc.text('Данные обслуживания', margin, y);
    y += 2;

    autoTable(doc, {
      startY: y,
      margin: { left: margin, right: margin },
      styles: { font: fontBase64 ? 'Roboto' : 'helvetica', fontSize: 10, cellPadding: 2 },
      headStyles: { fillColor: [59, 130, 246], textColor: 255, font: fontBase64 ? 'Roboto' : 'helvetica', fontStyle: 'normal' },
      body: [
        ['Дата следующего ТО', formatDateRu(m.nextTO)],
        ['Моточасов наработано', m.operatingHours ? m.operatingHours.toLocaleString('ru-RU') : '—'],
        ['Дней в работе', m.workingDays ? String(m.workingDays) : '—'],
        ['Остаток ресурса (часы)', m.remainingResource ? m.remainingResource.toLocaleString('ru-RU') : '—'],
      ],
      theme: 'grid',
    });
    y = doc.lastAutoTable.finalY + 6;
  }

  // ---- История жизненного цикла ----
  const history = product.lifecycleHistory || [];
  if (history.length > 0) {
    // Если осталось слишком мало места на странице — переходим на новую
    if (y > 220) {
      doc.addPage();
      y = margin;
    }
    doc.setFontSize(12);
    doc.text('История жизненного цикла', margin, y);
    y += 2;

    autoTable(doc, {
      startY: y,
      margin: { left: margin, right: margin },
      styles: { font: fontBase64 ? 'Roboto' : 'helvetica', fontSize: 9, cellPadding: 2 },
      headStyles: { fillColor: [59, 130, 246], textColor: 255, font: fontBase64 ? 'Roboto' : 'helvetica', fontStyle: 'normal' },
      head: [['Дата', 'Событие', 'Статус', 'Описание']],
      body: history.map(ev => [
        formatDateRu(ev.date),
        ev.event || '—',
        ev.status === 'completed' ? 'Выполнено' : 'Запланировано',
        ev.description || '—'
      ]),
      theme: 'striped',
      columnStyles: {
        0: { cellWidth: 28 },
        1: { cellWidth: 50 },
        2: { cellWidth: 30 },
        3: { cellWidth: 'auto' },
      }
    });
    y = doc.lastAutoTable.finalY + 6;
  }

  // ---- Заключение экспертной системы ----
  if (evaluation) {
    if (y > 220) {
      doc.addPage();
      y = margin;
    }
    doc.setFontSize(12);
    doc.text('Заключение экспертной системы', margin, y);
    y += 2;

    const severityLabels = {
      normal: 'Норма',
      info: 'Информация',
      warning: 'Предупреждение',
      critical: 'Критическое'
    };
    autoTable(doc, {
      startY: y,
      margin: { left: margin, right: margin },
      styles: { font: fontBase64 ? 'Roboto' : 'helvetica', fontSize: 10, cellPadding: 2 },
      headStyles: { fillColor: [59, 130, 246], textColor: 255, font: fontBase64 ? 'Roboto' : 'helvetica', fontStyle: 'normal' },
      body: [
        ['Общая оценка', severityLabels[evaluation.overallSeverity] || evaluation.overallSeverity],
        ['Правил сработало', `${evaluation.triggeredRules.length} из ${evaluation.totalRulesChecked}`],
      ],
      theme: 'grid',
    });
    y = doc.lastAutoTable.finalY + 4;

    if (evaluation.triggeredRules.length > 0) {
      autoTable(doc, {
        startY: y,
        margin: { left: margin, right: margin },
        styles: { font: fontBase64 ? 'Roboto' : 'helvetica', fontSize: 9, cellPadding: 2 },
        headStyles: { fillColor: [100, 100, 100], textColor: 255, font: fontBase64 ? 'Roboto' : 'helvetica', fontStyle: 'normal' },
        head: [['Правило', 'Уровень', 'Рекомендация']],
        body: evaluation.triggeredRules.map(r => [
          r.name,
          severityLabels[r.severity] || r.severity,
          r.recommendation
        ]),
        theme: 'striped',
        columnStyles: {
          0: { cellWidth: 50 },
          1: { cellWidth: 32 },
          2: { cellWidth: 'auto' },
        }
      });
      y = doc.lastAutoTable.finalY + 4;
    }
  }

  // ---- Подвал на каждой странице ----
  const pageCount = doc.internal.getNumberOfPages();
  for (let i = 1; i <= pageCount; i++) {
    doc.setPage(i);
    doc.setFontSize(8);
    doc.setTextColor(150, 150, 150);
    doc.text(
      'Дипломный проект • Елисеев Д.Д. • СГТУ ИнЭТиП б-УПТС-41 • 2026',
      margin,
      doc.internal.pageSize.getHeight() - 8
    );
    doc.text(
      `Страница ${i} из ${pageCount}`,
      pageWidth - margin,
      doc.internal.pageSize.getHeight() - 8,
      { align: 'right' }
    );
  }

  // ---- Сохраняем в файл ----
  const filename = `passport_${(product.serialNumber || product.id).toString().replace(/[^a-zA-Zа-яА-Я0-9-]/g, '_')}.pdf`;
  doc.save(filename);
}

// ============================================================================
// Статический маппинг tailwind-классов по цвету этапа.
// ============================================================================
const STAGE_STYLES = {
  blue:   { badge: 'bg-blue-100 text-blue-700',     dot: 'bg-blue-500' },
  purple: { badge: 'bg-purple-100 text-purple-700', dot: 'bg-purple-500' },
  green:  { badge: 'bg-green-100 text-green-700',   dot: 'bg-green-500' },
  yellow: { badge: 'bg-yellow-100 text-yellow-700', dot: 'bg-yellow-500' },
  red:    { badge: 'bg-red-100 text-red-700',       dot: 'bg-red-500' },
};

const ProductImage = ({ src, alt, className }) => {
  const [error, setError] = useState(false);
  useEffect(() => { setError(false); }, [src]);

  if (!src || error) {
    return (
      <div className={`${className} bg-slate-100 flex items-center justify-center`}>
        <Package className="w-12 h-12 text-slate-300" />
      </div>
    );
  }
  return <img src={src} alt={alt} className={className} onError={() => setError(true)} />;
};

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

const DigitalPassportPLM = () => {
  const [products, setProducts] = useState([]);
  const [stages, setStages] = useState([]);
  const [loading, setLoading] = useState(true);
  const [serverError, setServerError] = useState(false);

  const [selectedProduct, setSelectedProduct] = useState(null);
  const [view, setView] = useState('dashboard');
  const [activeTab, setActiveTab] = useState('general');

  const [searchTerm, setSearchTerm] = useState('');
  const [filterStage, setFilterStage] = useState('all');

  const [editedProduct, setEditedProduct] = useState(null);
  const [editorTab, setEditorTab] = useState('basic');
  const [specsList, setSpecsList] = useState([]);
  const [saving, setSaving] = useState(false);

  const [uploadingDoc, setUploadingDoc] = useState(false);
  const [downloadingPDF, setDownloadingPDF] = useState(false);

  // Состояние превью импорта (от парсинга до подтверждения пользователем)
  const [importPreview, setImportPreview] = useState(null);
  const [importing, setImporting] = useState(false);

  const tabs = [
    { id: 'general', label: 'Общие сведения', icon: FileText },
    { id: 'lifecycle', label: 'Жизненный цикл', icon: Clock },
    { id: 'maintenance', label: 'Обслуживание', icon: Wrench },
    { id: 'expert', label: 'Экспертная оценка', icon: Brain },
    { id: 'documents', label: 'Документация', icon: Upload }
  ];

  const editorTabs = [
    { id: 'basic', label: 'Основное' },
    { id: 'specs', label: 'Характеристики' },
    { id: 'lifecycle', label: 'Жизненный цикл' },
    { id: 'maintenance', label: 'Обслуживание' }
  ];

  const loadCatalog = useCallback(async () => {
    setLoading(true);
    setServerError(false);
    try {
      const [productsData, stagesData] = await Promise.all([
        api.getProducts(),
        api.getStages()
      ]);
      setProducts(productsData);
      setStages(stagesData);
    } catch (err) {
      if (err.message === 'SERVER_UNAVAILABLE') {
        setServerError(true);
      } else {
        alert(`Не удалось загрузить данные: ${err.message}`);
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadCatalog(); }, [loadCatalog]);

  // Обработка URL-параметра ?productId=X — открыть карточку изделия,
  // если пользователь перешёл по ссылке с QR-кода паспорта.
  // Срабатывает после первой загрузки каталога.
  useEffect(() => {
    if (loading || serverError) return;
    const params = new URLSearchParams(window.location.search);
    const targetId = params.get('productId');
    if (!targetId) return;

    api.getProduct(parseInt(targetId, 10))
      .then(fullProduct => {
        setSelectedProduct(fullProduct);
        setView('details');
        setActiveTab('general');
        // Чистим URL, чтобы при повторной перезагрузке не дёргать снова
        window.history.replaceState({}, '', window.location.pathname);
      })
      .catch(() => { /* изделие не найдено — остаёмся на каталоге */ });
  }, [loading, serverError]);

  const specsObjectToList = (obj) =>
    Object.entries(obj || {}).map(([key, value], i) => ({
      id: `spec-${Date.now()}-${i}`,
      key,
      value
    }));

  const specsListToObject = (list) =>
    Object.fromEntries(
      list.filter(s => s.key && s.key.trim()).map(s => [s.key, s.value])
    );

  // Известные поля и их русские/английские названия
  // Используется и при импорте, и при анализе того, что мы нашли в файле
  const KNOWN_FIELDS = [
    { key: 'name',              aliases: ['name', 'Наименование'],       label: 'Наименование' },
    { key: 'type',              aliases: ['type', 'Тип'],                label: 'Тип' },
    { key: 'manufacturer',      aliases: ['manufacturer', 'Производитель'], label: 'Производитель' },
    { key: 'serialNumber',      aliases: ['serialNumber', 'Серийный номер'], label: 'Серийный номер' },
    { key: 'manufactureDate',   aliases: ['manufactureDate', 'Дата производства'], label: 'Дата производства' },
    { key: 'commissioningDate', aliases: ['commissioningDate', 'Дата ввода'],      label: 'Дата ввода' },
    { key: 'currentStage',      aliases: ['currentStage', 'Этап'],       label: 'Этап ЖЦ' },
  ];

  // Достать из строки значение по любому из его псевдонимов
  const pickField = (row, aliases) => {
    for (const a of aliases) {
      if (row[a] !== undefined && row[a] !== null && row[a] !== '') return row[a];
    }
    return null;
  };

  // Проанализировать что нашлось в файле — для показа превью пользователю
  const analyzeImportData = (rawData) => {
    if (!Array.isArray(rawData) || rawData.length === 0) {
      return { ok: false, reason: 'Файл не содержит данных или формат не распознан.' };
    }

    // Какие колонки реально есть в файле (берём ключи первой непустой строки)
    const firstRow = rawData.find(r => r && typeof r === 'object') || {};
    const columnsInFile = Object.keys(firstRow);

    // Какие из них мы умеем распознавать
    const recognizedFields = KNOWN_FIELDS.filter(f =>
      f.aliases.some(a => columnsInFile.includes(a))
    );

    // Сколько строк выглядят разумно — то есть имеют хотя бы name или serialNumber
    let validRowsCount = 0;
    for (const row of rawData) {
      if (!row || typeof row !== 'object') continue;
      const hasName = pickField(row, ['name', 'Наименование']);
      const hasSerial = pickField(row, ['serialNumber', 'Серийный номер']);
      if (hasName || hasSerial) validRowsCount++;
    }

    // Если ни одной знакомой колонки не нашли — файл явно не наш
    if (recognizedFields.length === 0) {
      return {
        ok: false,
        reason: `Не найдено ни одного знакомого столбца. В файле есть: ${columnsInFile.slice(0, 6).join(', ')}${columnsInFile.length > 6 ? '...' : ''}. Ожидаются колонки вроде "Наименование", "Тип", "Серийный номер".`
      };
    }

    // Если ни одной строки с минимальными данными — тоже мимо
    if (validRowsCount === 0) {
      return {
        ok: false,
        reason: 'Ни в одной строке файла не нашлось значений в полях "Наименование" или "Серийный номер". Импорт невозможен.'
      };
    }

    return {
      ok: true,
      totalRows: rawData.length,
      validRows: validRowsCount,
      columnsInFile,
      recognizedFields,
      rawData
    };
  };

  // Запустить сам импорт после подтверждения пользователем
  const runImport = async () => {
    if (!importPreview || !importPreview.ok) return;
    setImporting(true);
    let created = 0, skipped = 0, failed = 0;

    for (const item of importPreview.rawData) {
      if (!item || typeof item !== 'object') { skipped++; continue; }

      const nameVal = pickField(item, ['name', 'Наименование']);
      const serialVal = pickField(item, ['serialNumber', 'Серийный номер']);
      if (!nameVal && !serialVal) { skipped++; continue; }

      const newProduct = {
        name: nameVal || 'Без названия',
        type: pickField(item, ['type', 'Тип']) || 'Не указан',
        manufacturer: pickField(item, ['manufacturer', 'Производитель']) || '',
        serialNumber: serialVal || '',
        manufactureDate: pickField(item, ['manufactureDate', 'Дата производства']) || new Date().toISOString().split('T')[0],
        commissioningDate: pickField(item, ['commissioningDate', 'Дата ввода']) || '',
        currentStage: pickField(item, ['currentStage', 'Этап']) || 'design',
        image: item.image || '',
        specifications: item.specifications || {},
        lifecycleHistory: item.lifecycleHistory || [],
        maintenance: item.maintenance || {}
      };
      try {
        await api.createProduct(newProduct);
        created++;
      } catch {
        failed++;
      }
    }

    setImporting(false);
    setImportPreview(null);
    alert(`Импорт завершён.\n\nСоздано: ${created}\nПропущено (пустые строки): ${skipped}\nОшибок (например, дубль серийника): ${failed}`);
    loadCatalog();
  };

  const cancelImport = () => {
    setImportPreview(null);
  };

  // Загрузить и распарсить файл, показать превью с результатом анализа
  const handleFileUpload = (event) => {
    const file = event.target.files[0];
    if (!file) return;
    const fileType = file.name.split('.').pop().toLowerCase();
    const fileName = file.name;

    // Универсальная обёртка: получили rawData — проанализировали — показали превью
    const processAndPreview = (rawData) => {
      const analysis = analyzeImportData(rawData);
      setImportPreview({ ...analysis, fileName });
    };

    try {
      if (fileType === 'xlsx' || fileType === 'xls') {
        const reader = new FileReader();
        reader.onload = (e) => {
          try {
            const data = new Uint8Array(e.target.result);
            const workbook = XLSX.read(data, { type: 'array' });
            const sheetName = workbook.SheetNames[0];
            const worksheet = workbook.Sheets[sheetName];
            const jsonData = XLSX.utils.sheet_to_json(worksheet);
            processAndPreview(jsonData);
          } catch (err) {
            setImportPreview({ ok: false, reason: `Не удалось прочитать Excel-файл: ${err.message}`, fileName });
          }
        };
        reader.onerror = () => setImportPreview({ ok: false, reason: 'Ошибка чтения файла', fileName });
        reader.readAsArrayBuffer(file);
      } else if (fileType === 'csv') {
        Papa.parse(file, {
          header: true,
          skipEmptyLines: true,
          complete: (results) => {
            if (results.errors && results.errors.length > 0) {
              setImportPreview({ ok: false, reason: `Ошибка чтения CSV: ${results.errors[0].message}`, fileName });
            } else {
              processAndPreview(results.data);
            }
          },
          error: (err) => setImportPreview({ ok: false, reason: `Не удалось прочитать CSV: ${err.message}`, fileName })
        });
      } else if (fileType === 'json') {
        const reader = new FileReader();
        reader.onload = (e) => {
          try {
            const jsonData = JSON.parse(e.target.result);
            processAndPreview(Array.isArray(jsonData) ? jsonData : [jsonData]);
          } catch (err) {
            setImportPreview({ ok: false, reason: `Файл не является валидным JSON: ${err.message}`, fileName });
          }
        };
        reader.readAsText(file);
      } else {
        setImportPreview({ ok: false, reason: `Неподдерживаемый формат: .${fileType}. Используйте .xlsx, .xls, .csv или .json.`, fileName });
      }
    } catch (err) {
      setImportPreview({ ok: false, reason: `Ошибка обработки файла: ${err.message}`, fileName });
    }

    event.target.value = ''; // позволяет повторно выбрать тот же файл
  };

  const exportToExcel = () => {
    const exportData = products.map(p => ({
      'ID': p.id,
      'Наименование': p.name,
      'Тип': p.type,
      'Производитель': p.manufacturer,
      'Серийный номер': p.serialNumber,
      'Дата производства': p.manufactureDate,
      'Этап жизненного цикла': stages.find(s => s.id === p.currentStage)?.name
    }));
    const ws = XLSX.utils.json_to_sheet(exportData);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Цифровые паспорта");
    XLSX.writeFile(wb, "digital_passports_export.xlsx");
  };

  // В каталоге у нас summary без характеристик. Для карточки тянем полные данные.
  const openProductDetails = async (productSummary) => {
    try {
      const fullProduct = await api.getProduct(productSummary.id);
      setSelectedProduct(fullProduct);
      setView('details');
      setActiveTab('general');
    } catch (err) {
      alert(`Не удалось загрузить изделие: ${err.message}`);
    }
  };

  const addNewProduct = () => {
    setEditedProduct({
      id: null,
      name: '',
      type: '',
      manufacturer: '',
      serialNumber: '',
      manufactureDate: new Date().toISOString().split('T')[0],
      commissioningDate: '',
      currentStage: 'design',
      image: '',
      specifications: {},
      lifecycleHistory: [],
      maintenance: {}
    });
    setSpecsList([]);
    setEditorTab('basic');
    setView('editor');
  };

  const editProduct = async (product, e) => {
    if (e) e.stopPropagation();
    try {
      // Из каталога у нас только summary, из карточки уже полные данные.
      const full = product.specifications ? product : await api.getProduct(product.id);
      setEditedProduct({ ...full });
      setSpecsList(specsObjectToList(full.specifications));
      setEditorTab('basic');
      setView('editor');
    } catch (err) {
      alert(`Не удалось загрузить изделие для редактирования: ${err.message}`);
    }
  };

  const deleteProduct = async (productId, e) => {
    e.stopPropagation();
    if (!window.confirm('Вы уверены, что хотите удалить это изделие?\nБудут удалены все связанные данные.')) return;
    try {
      await api.deleteProduct(productId);
      if (selectedProduct?.id === productId) {
        setSelectedProduct(null);
        setView('catalog');
      }
      loadCatalog();
    } catch (err) {
      alert(`Не удалось удалить изделие: ${err.message}`);
    }
  };

  const saveProduct = async () => {
    if (!editedProduct.name || !editedProduct.type) {
      alert('Заполните обязательные поля: Наименование и Тип');
      return;
    }
    const productToSave = {
      ...editedProduct,
      specifications: specsListToObject(specsList)
    };
    setSaving(true);
    try {
      const saved = productToSave.id
        ? await api.updateProduct(productToSave.id, productToSave)
        : await api.createProduct(productToSave);
      setSelectedProduct(saved);
      setView('details');
      setActiveTab('general');
      loadCatalog();
    } catch (err) {
      alert(`Не удалось сохранить: ${err.message}`);
    } finally {
      setSaving(false);
    }
  };

  const cancelEdit = () => {
    setEditedProduct(null);
    setSpecsList([]);
    setEditorTab('basic');
    setView(selectedProduct ? 'details' : 'catalog');
  };

  const handleImageUpload = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (event) => {
      setEditedProduct({ ...editedProduct, image: event.target.result });
    };
    reader.readAsDataURL(file);
  };

  const handleDocumentUpload = async (e) => {
    const files = Array.from(e.target.files);
    if (!files.length || !selectedProduct) return;
    setUploadingDoc(true);
    try {
      for (const file of files) {
        await api.uploadDocument(selectedProduct.id, file);
      }
      const refreshed = await api.getProduct(selectedProduct.id);
      setSelectedProduct(refreshed);
    } catch (err) {
      alert(`Не удалось загрузить файл: ${err.message}`);
    } finally {
      setUploadingDoc(false);
      e.target.value = '';
    }
  };

  const deleteDocument = async (docId) => {
    if (!window.confirm('Удалить этот документ?')) return;
    try {
      await api.deleteDocument(docId);
      const refreshed = await api.getProduct(selectedProduct.id);
      setSelectedProduct(refreshed);
    } catch (err) {
      alert(`Не удалось удалить документ: ${err.message}`);
    }
  };

  // Генерация PDF-паспорта. Параллельно подтягиваем заключение экспертной системы,
  // чтобы вложить его в паспорт. Если не получилось — формируем без заключения.
  const handleDownloadPDF = async () => {
    if (!selectedProduct) return;
    setDownloadingPDF(true);
    try {
      let evaluation = null;
      try {
        evaluation = await api.evaluateProduct(selectedProduct.id);
      } catch {
        // Не критично — паспорт можно сформировать и без заключения
      }
      await generateProductPassportPDF(selectedProduct, stages, evaluation);
    } catch (err) {
      console.error('[PDF] Ошибка:', err);
      alert(`Не удалось сформировать PDF: ${err.message}`);
    } finally {
      setDownloadingPDF(false);
    }
  };

  const addLifecycleEvent = () => {
    setEditedProduct({
      ...editedProduct,
      lifecycleHistory: [
        ...(editedProduct.lifecycleHistory || []),
        { date: new Date().toISOString().split('T')[0], event: '', status: 'completed', description: '' }
      ]
    });
  };

  const updateLifecycleEvent = (index, field, value) => {
    const updated = [...editedProduct.lifecycleHistory];
    updated[index] = { ...updated[index], [field]: value };
    setEditedProduct({ ...editedProduct, lifecycleHistory: updated });
  };

  const deleteLifecycleEvent = (index) => {
    setEditedProduct({
      ...editedProduct,
      lifecycleHistory: editedProduct.lifecycleHistory.filter((_, i) => i !== index)
    });
  };

  const addSpecification = () => {
    setSpecsList([
      ...specsList,
      { id: `spec-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`, key: '', value: '' }
    ]);
  };

  const updateSpecKey = (id, newKey) =>
    setSpecsList(specsList.map(s => s.id === id ? { ...s, key: newKey } : s));
  const updateSpecValue = (id, newValue) =>
    setSpecsList(specsList.map(s => s.id === id ? { ...s, value: newValue } : s));
  const deleteSpec = (id) =>
    setSpecsList(specsList.filter(s => s.id !== id));

  const filteredProducts = useMemo(() => {
    const query = searchTerm.toLowerCase();
    return products.filter(p => {
      const matchesSearch = !query || [p.name, p.type, p.manufacturer, p.serialNumber]
        .filter(Boolean)
        .some(field => field.toLowerCase().includes(query));
      const matchesFilter = filterStage === 'all' || p.currentStage === filterStage;
      return matchesSearch && matchesFilter;
    });
  }, [products, searchTerm, filterStage]);

  const getStageStyle = (stageId) => {
    const stage = stages.find(s => s.id === stageId);
    return STAGE_STYLES[stage?.color] || STAGE_STYLES.blue;
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-blue-50">
      <header className="bg-white shadow-sm border-b border-slate-200">
        <div className="max-w-7xl mx-auto px-4 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <Factory className="w-8 h-8 text-blue-600" />
              <div>
                <h1 className="text-2xl font-bold text-slate-800">Система управления ЖЦИ</h1>
                <p className="text-sm text-slate-500">Цифровые паспорта промышленных изделий</p>
              </div>
            </div>
            <div className="flex gap-2">
              <button
                onClick={() => { setView('dashboard'); setSelectedProduct(null); }}
                className={`px-4 py-2 rounded-lg font-medium transition-colors ${
                  view === 'dashboard' ? 'bg-blue-600 text-white' : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                }`}
              >
                Дашборд
              </button>
              <button
                onClick={() => { setView('catalog'); setSelectedProduct(null); }}
                className={`px-4 py-2 rounded-lg font-medium transition-colors ${
                  view === 'catalog' ? 'bg-blue-600 text-white' : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                }`}
              >
                Каталог
              </button>
              <button
                onClick={() => { setView('rules'); setSelectedProduct(null); }}
                className={`px-4 py-2 rounded-lg font-medium transition-colors ${
                  view === 'rules' ? 'bg-blue-600 text-white' : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                }`}
              >
                База правил
              </button>
              <button
                onClick={() => setView('import')}
                className={`px-4 py-2 rounded-lg font-medium transition-colors ${
                  view === 'import' ? 'bg-blue-600 text-white' : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                }`}
              >
                Импорт данных
              </button>
            </div>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 py-6">
        {serverError && <ServerUnavailableBanner onRetry={loadCatalog} />}

        {!serverError && loading && (
          <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-12 text-center">
            <RefreshCw className="w-12 h-12 text-blue-500 mx-auto mb-4 animate-spin" />
            <p className="text-slate-600">Загрузка данных с сервера...</p>
          </div>
        )}

        {!serverError && !loading && view === 'dashboard' && (
          <Dashboard
            onOpenProduct={(productId) => {
              api.getProduct(productId)
                .then(fullProduct => {
                  setSelectedProduct(fullProduct);
                  setView('details');
                  setActiveTab('general');
                })
                .catch(err => alert(`Не удалось открыть изделие: ${err.message}`));
            }}
            onGoCatalog={() => setView('catalog')}
          />
        )}

        {!serverError && !loading && view === 'catalog' && (
          <div className="space-y-4">
            <div className="bg-white rounded-xl shadow-sm p-4 border border-slate-200">
              <div className="flex flex-wrap gap-4 items-center justify-between">
                <div className="flex gap-3 flex-1 min-w-[300px]">
                  <div className="relative flex-1">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" />
                    <input
                      type="text"
                      placeholder="Поиск по названию, типу, производителю или S/N..."
                      value={searchTerm}
                      onChange={(e) => setSearchTerm(e.target.value)}
                      className="w-full pl-10 pr-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    />
                  </div>
                  <div className="relative">
                    <Filter className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" />
                    <select
                      value={filterStage}
                      onChange={(e) => setFilterStage(e.target.value)}
                      className="pl-10 pr-8 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent appearance-none bg-white"
                    >
                      <option value="all">Все этапы</option>
                      {stages.map(stage => (
                        <option key={stage.id} value={stage.id}>{stage.name}</option>
                      ))}
                    </select>
                  </div>
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={addNewProduct}
                    className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors font-medium"
                  >
                    <Plus className="w-5 h-5" />
                    Добавить
                  </button>
                  <button
                    onClick={exportToExcel}
                    className="flex items-center gap-2 px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors font-medium"
                  >
                    <Download className="w-5 h-5" />
                    Экспорт
                  </button>
                </div>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {filteredProducts.map(product => {
                const stageStyle = getStageStyle(product.currentStage);
                const stageName = stages.find(s => s.id === product.currentStage)?.name;
                return (
                  <div
                    key={product.id}
                    className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden hover:shadow-md transition-shadow"
                  >
                    <ProductImage src={product.image} alt={product.name} className="w-full h-48 object-contain bg-slate-50 p-2" />
                    <div className="p-5">
                      <div className="flex items-start justify-between mb-3">
                        <span className="text-xs font-medium text-slate-500">ID: {product.id}</span>
                        <span className={`px-3 py-1 rounded-full text-xs font-medium ${stageStyle.badge}`}>
                          {stageName}
                        </span>
                      </div>
                      <h3 className="font-bold text-lg text-slate-800 mb-2">{product.name || 'Без названия'}</h3>
                      <div className="space-y-1 text-sm text-slate-600 mb-4">
                        <p><span className="font-medium">Тип:</span> {product.type || '—'}</p>
                        <p><span className="font-medium">S/N:</span> {product.serialNumber || '—'}</p>
                        <p className="flex items-center gap-2">
                          <Clock className="w-4 h-4" />
                          {product.manufactureDate || '—'}
                        </p>
                      </div>
                      <div className="flex gap-2">
                        <button
                          onClick={() => openProductDetails(product)}
                          className="flex-1 px-3 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors text-sm font-medium"
                        >
                          Открыть
                        </button>
                        <button
                          onClick={(e) => editProduct(product, e)}
                          className="px-3 py-2 bg-slate-100 text-slate-700 rounded-lg hover:bg-slate-200 transition-colors"
                        >
                          <Edit className="w-4 h-4" />
                        </button>
                        <button
                          onClick={(e) => deleteProduct(product.id, e)}
                          className="px-3 py-2 bg-red-100 text-red-700 rounded-lg hover:bg-red-200 transition-colors"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>

            {filteredProducts.length === 0 && (
              <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-12 text-center">
                <Package className="w-16 h-16 text-slate-300 mx-auto mb-4" />
                <h3 className="text-lg font-medium text-slate-600 mb-2">
                  {products.length === 0 ? 'В системе пока нет изделий' : 'Изделия не найдены'}
                </h3>
                <p className="text-slate-500 mb-4">
                  {products.length === 0
                    ? 'Добавьте первое изделие или импортируйте данные'
                    : 'Попробуйте изменить параметры поиска'}
                </p>
                <button
                  onClick={addNewProduct}
                  className="px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors font-medium"
                >
                  Добавить первое изделие
                </button>
              </div>
            )}
          </div>
        )}

        {!serverError && view === 'import' && (
          <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-8">
            <div className="max-w-2xl mx-auto">
              <h2 className="text-2xl font-bold text-slate-800 mb-6">Импорт данных</h2>
              <div className="space-y-6">
                <div className="border-2 border-dashed border-slate-300 rounded-xl p-8 text-center hover:border-blue-400 transition-colors">
                  <Upload className="w-12 h-12 text-slate-400 mx-auto mb-4" />
                  <h3 className="font-semibold text-lg text-slate-700 mb-2">Загрузите файл с данными</h3>
                  <p className="text-slate-500 mb-4">Поддерживаются форматы: Excel (.xlsx, .xls), CSV, JSON</p>
                  <label className="inline-flex items-center gap-2 px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors cursor-pointer font-medium">
                    <FileText className="w-5 h-5" />
                    Выбрать файл
                    <input type="file" accept=".xlsx,.xls,.csv,.json" onChange={handleFileUpload} className="hidden" />
                  </label>
                </div>

                {/* Ожидаемая структура файла */}
                <div className="bg-slate-50 border border-slate-200 rounded-lg p-4">
                  <h4 className="font-semibold text-slate-800 mb-3">Ожидаемая структура файла</h4>
                  <p className="text-sm text-slate-600 mb-3">
                    Первая строка должна содержать названия столбцов. Допустимы как русские, так и английские имена:
                  </p>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-sm">
                    <div className="bg-white border border-slate-200 rounded px-3 py-1.5"><strong>Наименование</strong> <span className="text-slate-500">/ name</span></div>
                    <div className="bg-white border border-slate-200 rounded px-3 py-1.5"><strong>Тип</strong> <span className="text-slate-500">/ type</span></div>
                    <div className="bg-white border border-slate-200 rounded px-3 py-1.5"><strong>Производитель</strong> <span className="text-slate-500">/ manufacturer</span></div>
                    <div className="bg-white border border-slate-200 rounded px-3 py-1.5"><strong>Серийный номер</strong> <span className="text-slate-500">/ serialNumber</span></div>
                    <div className="bg-white border border-slate-200 rounded px-3 py-1.5"><strong>Дата производства</strong> <span className="text-slate-500">/ manufactureDate</span></div>
                    <div className="bg-white border border-slate-200 rounded px-3 py-1.5"><strong>Этап</strong> <span className="text-slate-500">/ currentStage</span></div>
                  </div>
                  <p className="text-xs text-slate-500 mt-3">
                    Для корректного импорта достаточно хотя бы одного из полей «Наименование» или «Серийный номер» в каждой строке.
                    Перед окончательным импортом система покажет, что нашла в файле.
                  </p>
                </div>

                
                 
                </div>
              </div>
            </div>
        )}

        {/* Модальное окно превью импорта */}
        {importPreview && (
          <ImportPreviewModal
            preview={importPreview}
            importing={importing}
            onConfirm={runImport}
            onCancel={cancelImport}
          />
        )}

        {!serverError && view === 'rules' && <RulesManager />}

        {!serverError && view === 'editor' && editedProduct && (
          <ProductEditor
            editedProduct={editedProduct}
            setEditedProduct={setEditedProduct}
            specsList={specsList}
            stages={stages}
            editorTab={editorTab}
            setEditorTab={setEditorTab}
            editorTabs={editorTabs}
            saving={saving}
            onSave={saveProduct}
            onCancel={cancelEdit}
            onAddSpec={addSpecification}
            onUpdateSpecKey={updateSpecKey}
            onUpdateSpecValue={updateSpecValue}
            onDeleteSpec={deleteSpec}
            onAddLifecycleEvent={addLifecycleEvent}
            onUpdateLifecycleEvent={updateLifecycleEvent}
            onDeleteLifecycleEvent={deleteLifecycleEvent}
            onImageUpload={handleImageUpload}
          />
        )}

        {!serverError && view === 'details' && selectedProduct && (
          <DetailView
            selectedProduct={selectedProduct}
            stages={stages}
            getStageStyle={getStageStyle}
            tabs={tabs}
            activeTab={activeTab}
            setActiveTab={setActiveTab}
            onBack={() => { setView('catalog'); setSelectedProduct(null); }}
            onEdit={() => editProduct(selectedProduct)}
            onDocumentUpload={handleDocumentUpload}
            onDeleteDocument={deleteDocument}
            uploadingDoc={uploadingDoc}
            onDownloadPDF={handleDownloadPDF}
            downloadingPDF={downloadingPDF}
          />
        )}
      </main>
    </div>
  );
};

// ============================================================================
// Редактор изделия
// ============================================================================
const ProductEditor = ({
  editedProduct, setEditedProduct, specsList, stages,
  editorTab, setEditorTab, editorTabs, saving,
  onSave, onCancel,
  onAddSpec, onUpdateSpecKey, onUpdateSpecValue, onDeleteSpec,
  onAddLifecycleEvent, onUpdateLifecycleEvent, onDeleteLifecycleEvent,
  onImageUpload
}) => (
  <div className="space-y-4">
    <div className="flex items-center justify-between">
      <button onClick={onCancel} className="flex items-center gap-2 text-slate-600 hover:text-slate-800 font-medium">
        ← Отмена
      </button>
      <button
        onClick={onSave}
        disabled={saving}
        className="px-6 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors font-medium disabled:opacity-60 disabled:cursor-not-allowed"
      >
        {saving ? 'Сохранение...' : 'Сохранить изделие'}
      </button>
    </div>

    <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6">
      <h2 className="text-2xl font-bold text-slate-800 mb-6">
        {editedProduct.id ? 'Редактирование изделия' : 'Новое изделие'}
      </h2>

      <div className="border-b border-slate-200 mb-6">
        <div className="flex gap-2 overflow-x-auto">
          {editorTabs.map(tab => (
            <button
              key={tab.id}
              onClick={() => setEditorTab(tab.id)}
              className={`px-4 py-2 font-medium transition whitespace-nowrap rounded-t-lg ${
                editorTab === tab.id ? 'bg-blue-50 text-blue-600 border-b-2 border-blue-600' : 'text-slate-600 hover:text-slate-800 hover:bg-slate-50'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {editorTab === 'basic' && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="md:col-span-2">
            <label className="block text-sm font-medium text-slate-700 mb-2">
              Наименование <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              value={editedProduct.name}
              onChange={(e) => setEditedProduct({ ...editedProduct, name: e.target.value })}
              className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500"
              placeholder="Например: Электродвигатель АИР 132M4"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-2">
              Тип <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              value={editedProduct.type}
              onChange={(e) => setEditedProduct({ ...editedProduct, type: e.target.value })}
              className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-2">Производитель</label>
            <input
              type="text"
              value={editedProduct.manufacturer || ''}
              onChange={(e) => setEditedProduct({ ...editedProduct, manufacturer: e.target.value })}
              className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-2">Серийный номер</label>
            <input
              type="text"
              value={editedProduct.serialNumber || ''}
              onChange={(e) => setEditedProduct({ ...editedProduct, serialNumber: e.target.value })}
              className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-2">Дата производства</label>
            <input
              type="date"
              value={editedProduct.manufactureDate || ''}
              onChange={(e) => setEditedProduct({ ...editedProduct, manufactureDate: e.target.value })}
              className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-2">Дата ввода в эксплуатацию</label>
            <input
              type="date"
              value={editedProduct.commissioningDate || ''}
              onChange={(e) => setEditedProduct({ ...editedProduct, commissioningDate: e.target.value })}
              className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-2">Этап жизненного цикла</label>
            <select
              value={editedProduct.currentStage}
              onChange={(e) => setEditedProduct({ ...editedProduct, currentStage: e.target.value })}
              className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500"
            >
              {stages.map(stage => (
                <option key={stage.id} value={stage.id}>{stage.name}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-2">Фотография изделия</label>
            <label className="w-full px-4 py-2 border border-slate-300 rounded-lg hover:bg-slate-50 transition cursor-pointer flex items-center justify-center gap-2 text-slate-600">
              <Upload className="w-5 h-5" />
              {editedProduct.image ? 'Изменить фото' : 'Загрузить фото'}
              <input type="file" accept="image/*" onChange={onImageUpload} className="hidden" />
            </label>
            {editedProduct.image && (
              <div className="mt-2">
                <ProductImage src={editedProduct.image} alt="Preview" className="w-full h-32 object-cover rounded-lg" />
              </div>
            )}
          </div>
        </div>
      )}

      {editorTab === 'specs' && (
        <div className="space-y-4">
          <div className="flex justify-between items-center">
            <h3 className="text-lg font-semibold text-slate-800">Технические характеристики</h3>
            <button onClick={onAddSpec} className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 text-sm">
              <Plus className="w-4 h-4" />
              Добавить
            </button>
          </div>
          {specsList.length > 0 ? (
            <div className="space-y-3">
              {specsList.map(spec => (
                <div key={spec.id} className="flex gap-3 items-start">
                  <div className="flex-1 grid grid-cols-2 gap-3">
                    <input
                      type="text"
                      value={spec.key}
                      onChange={(e) => onUpdateSpecKey(spec.id, e.target.value)}
                      className="px-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                      placeholder="Название (напр. Мощность)"
                    />
                    <input
                      type="text"
                      value={spec.value}
                      onChange={(e) => onUpdateSpecValue(spec.id, e.target.value)}
                      className="px-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                      placeholder="Значение (напр. 11 кВт)"
                    />
                  </div>
                  <button onClick={() => onDeleteSpec(spec.id)} className="px-3 py-2 bg-red-100 text-red-700 rounded-lg hover:bg-red-200">
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-slate-500 text-center py-8">Характеристики не добавлены. Нажмите «Добавить», чтобы создать первую запись.</p>
          )}
        </div>
      )}

      {editorTab === 'lifecycle' && (
        <div className="space-y-4">
          <div className="flex justify-between items-center">
            <h3 className="text-lg font-semibold text-slate-800">История жизненного цикла</h3>
            <button onClick={onAddLifecycleEvent} className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 text-sm">
              <Plus className="w-4 h-4" />
              Добавить событие
            </button>
          </div>
          {(editedProduct.lifecycleHistory || []).length > 0 ? (
            <div className="space-y-4">
              {editedProduct.lifecycleHistory.map((event, index) => (
                <div key={index} className="bg-slate-50 p-4 rounded-lg border border-slate-200 space-y-3">
                  <div className="flex justify-between items-start">
                    <h4 className="font-medium text-slate-800">Событие #{index + 1}</h4>
                    <button onClick={() => onDeleteLifecycleEvent(index)} className="text-red-600 hover:text-red-700">
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                    <input
                      type="date"
                      value={event.date}
                      onChange={(e) => onUpdateLifecycleEvent(index, 'date', e.target.value)}
                      className="px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                    />
                    <input
                      type="text"
                      value={event.event}
                      onChange={(e) => onUpdateLifecycleEvent(index, 'event', e.target.value)}
                      className="px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                      placeholder="Название события"
                    />
                    <select
                      value={event.status}
                      onChange={(e) => onUpdateLifecycleEvent(index, 'status', e.target.value)}
                      className="px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                    >
                      <option value="completed">Выполнено</option>
                      <option value="scheduled">Запланировано</option>
                    </select>
                  </div>
                  <textarea
                    value={event.description || ''}
                    onChange={(e) => onUpdateLifecycleEvent(index, 'description', e.target.value)}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                    placeholder="Описание события"
                    rows="2"
                  />
                </div>
              ))}
            </div>
          ) : (
            <p className="text-slate-500 text-center py-8">События не добавлены</p>
          )}
        </div>
      )}

      {editorTab === 'maintenance' && (
        <div className="space-y-6">
          <h3 className="text-lg font-semibold text-slate-800">Данные обслуживания</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="md:col-span-2">
              <label className="block text-sm font-medium text-slate-700 mb-2">Дата следующего ТО</label>
              <input
                type="date"
                value={editedProduct.maintenance?.nextTO || ''}
                onChange={(e) => setEditedProduct({ ...editedProduct, maintenance: { ...(editedProduct.maintenance || {}), nextTO: e.target.value } })}
                className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500"
              />
              <p className="text-xs text-slate-500 mt-1">Дней до ТО рассчитывается автоматически от текущей даты.</p>
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-2">Моточасов наработано</label>
              <input
                type="number"
                value={editedProduct.maintenance?.operatingHours || ''}
                onChange={(e) => setEditedProduct({ ...editedProduct, maintenance: { ...(editedProduct.maintenance || {}), operatingHours: parseInt(e.target.value) || 0 } })}
                className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-2">Дней в работе</label>
              <input
                type="number"
                value={editedProduct.maintenance?.workingDays || ''}
                onChange={(e) => setEditedProduct({ ...editedProduct, maintenance: { ...(editedProduct.maintenance || {}), workingDays: parseInt(e.target.value) || 0 } })}
                className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <div className="md:col-span-2">
              <label className="block text-sm font-medium text-slate-700 mb-2">Остаток ресурса (часы)</label>
              <input
                type="number"
                value={editedProduct.maintenance?.remainingResource || ''}
                onChange={(e) => setEditedProduct({ ...editedProduct, maintenance: { ...(editedProduct.maintenance || {}), remainingResource: parseInt(e.target.value) || 0 } })}
                className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500"
              />
            </div>
          </div>
        </div>
      )}
    </div>
  </div>
);

// ============================================================================
// Детальный просмотр карточки
// ============================================================================
const DetailView = ({
  selectedProduct, stages, getStageStyle, tabs, activeTab, setActiveTab,
  onBack, onEdit, onDocumentUpload, onDeleteDocument, uploadingDoc,
  onDownloadPDF, downloadingPDF
}) => {
  const stageStyle = getStageStyle(selectedProduct.currentStage);
  const stageName = stages.find(s => s.id === selectedProduct.currentStage)?.name;

  return (
    <div className="space-y-4">
      <button onClick={onBack} className="flex items-center gap-2 text-slate-600 hover:text-slate-800 font-medium">
        ← Назад к каталогу
      </button>

      <div className="bg-white rounded-xl shadow-lg border border-slate-200 p-6">
        <div className="flex flex-wrap items-start gap-6 mb-6">
          <ProductImage src={selectedProduct.image} alt={selectedProduct.name} className="w-48 h-36 object-cover rounded-lg shadow-md" />
          <div className="flex-1 min-w-[280px]">
            <div className="flex flex-wrap items-start justify-between gap-3 mb-4">
              <div>
                <h2 className="text-3xl font-bold text-slate-800 mb-2">{selectedProduct.name}</h2>
                <p className="text-slate-600 mb-3">{selectedProduct.manufacturer}</p>
                <div className="flex flex-wrap gap-3">
                  <span className="bg-blue-100 text-blue-700 px-3 py-1 rounded-full text-sm font-medium">
                    {selectedProduct.type}
                  </span>
                  <span className={`px-3 py-1 rounded-full text-sm font-medium flex items-center gap-1 ${stageStyle.badge}`}>
                    <CheckCircle className="w-4 h-4" />
                    {stageName}
                  </span>
                </div>
              </div>
              <div className="flex gap-2 flex-wrap">
                <button
                  onClick={onDownloadPDF}
                  disabled={downloadingPDF}
                  className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
                  title="Сформировать PDF-паспорт с QR-кодом"
                >
                  <FileDown className="w-5 h-5" />
                  {downloadingPDF ? 'Формирование...' : 'Скачать паспорт'}
                </button>
                <button onClick={onEdit} className="flex items-center gap-2 px-4 py-2 bg-slate-600 text-white rounded-lg hover:bg-slate-700 transition-colors">
                  <Edit className="w-5 h-5" />
                  Редактировать
                </button>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4 pt-4 border-t">
              <div>
                <p className="text-sm text-slate-500">Серийный номер</p>
                <p className="font-mono font-semibold text-slate-800">{selectedProduct.serialNumber || '—'}</p>
              </div>
              <div>
                <p className="text-sm text-slate-500">Дата производства</p>
                <p className="font-semibold text-slate-800">{selectedProduct.manufactureDate || '—'}</p>
              </div>
            </div>
          </div>
        </div>

        <div className="border-b border-slate-200 mb-6">
          <div className="flex overflow-x-auto">
            {tabs.map(tab => {
              const Icon = tab.icon;
              return (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  className={`flex items-center gap-2 px-6 py-4 font-medium transition whitespace-nowrap ${
                    activeTab === tab.id ? 'border-b-2 border-blue-600 text-blue-600' : 'text-slate-600 hover:text-slate-800'
                  }`}
                >
                  <Icon size={20} />
                  {tab.label}
                </button>
              );
            })}
          </div>
        </div>

        {activeTab === 'general' && <GeneralTab selectedProduct={selectedProduct} />}
        {activeTab === 'lifecycle' && <LifecycleTab selectedProduct={selectedProduct} />}
        {activeTab === 'maintenance' && <MaintenanceTab selectedProduct={selectedProduct} />}
        {activeTab === 'expert' && <ExpertSystemTab selectedProduct={selectedProduct} />}
        {activeTab === 'documents' && (
          <DocumentsTab
            selectedProduct={selectedProduct}
            onDocumentUpload={onDocumentUpload}
            onDeleteDocument={onDeleteDocument}
            uploadingDoc={uploadingDoc}
          />
        )}
      </div>

      <div className="text-center text-sm text-slate-500">
        <p>Прототип системы управления жизненным циклом изделия</p>
        <p className="mt-1">Дипломный проект • УПТС • 2026</p>
      </div>
    </div>
  );
};

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

const MaintenanceTab = ({ selectedProduct }) => {
  const daysUntilTO = useMemo(() => {
    if (!selectedProduct.maintenance?.nextTO) return null;
    const target = new Date(selectedProduct.maintenance.nextTO);
    if (isNaN(target.getTime())) return null;
    const now = new Date();
    return Math.ceil((target - now) / (1000 * 60 * 60 * 24));
  }, [selectedProduct.maintenance?.nextTO]);

  // Фильтр событий ЖЦ — оставляем только те, что относятся к обслуживанию.
  // Ключевые слова подобраны так, чтобы отлавливать ТО, ремонты, замены, проверки,
  // и при этом отсеивать "Производство", "Приёмочные испытания", "Ввод в эксплуатацию".
  // Используем includes по списку, потому что \b в регулярках JS не работает с кириллицей.
  const maintenanceEvents = useMemo(() => {
    const history = selectedProduct.lifecycleHistory || [];
    const keywords = ['то', 'обслуживани', 'ремонт', 'замен', 'проверк', 'осмотр', 'диагностик', 'регламент'];
    return history
      .filter(e => {
        if (!e.event) return false;
        const text = e.event.toLowerCase();
        return keywords.some(kw => text.includes(kw));
      })
      .sort((a, b) => (b.date || '').localeCompare(a.date || '')); // от свежих к старым
  }, [selectedProduct.lifecycleHistory]);

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

const DocumentsTab = ({ selectedProduct, onDocumentUpload, onDeleteDocument, uploadingDoc }) => (
  <div className="space-y-6">
    <div>
      <div className="flex justify-between items-center mb-4">
        <h3 className="text-xl font-bold text-slate-800">Документация</h3>
        <label className={`flex items-center gap-2 px-4 py-2 rounded-lg transition-colors cursor-pointer font-medium ${
          uploadingDoc ? 'bg-slate-400 text-white cursor-not-allowed' : 'bg-blue-600 text-white hover:bg-blue-700'
        }`}>
          <Upload className="w-5 h-5" />
          {uploadingDoc ? 'Загрузка...' : 'Загрузить файл'}
          <input
            type="file"
            multiple
            onChange={onDocumentUpload}
            disabled={uploadingDoc}
            className="hidden"
          />
        </label>
      </div>

      <div className="space-y-2">
        {selectedProduct.documents && selectedProduct.documents.length > 0 ? (
          selectedProduct.documents.map((doc) => (
            <div key={doc.id} className="bg-slate-50 p-4 rounded-lg border border-slate-200 hover:border-blue-300 transition flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-blue-100 rounded flex items-center justify-center">
                  <FileText className="text-blue-600" size={20} />
                </div>
                <div>
                  <p className="font-medium text-slate-800">{doc.name}</p>
                  <p className="text-sm text-slate-500">{doc.type} • {doc.size} • {doc.date}</p>
                </div>
              </div>
              <div className="flex gap-2">
                <a
                  href={api.documentDownloadUrl(doc.id)}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="px-3 py-2 bg-blue-100 text-blue-700 rounded hover:bg-blue-200 transition flex items-center gap-1"
                  title="Скачать"
                >
                  <Download size={16} />
                </a>
                <button
                  onClick={() => onDeleteDocument(doc.id)}
                  className="px-3 py-2 bg-red-100 text-red-700 rounded hover:bg-red-200 transition"
                  title="Удалить"
                >
                  <Trash2 size={16} />
                </button>
              </div>
            </div>
          ))
        ) : (
          <p className="text-slate-500 text-center py-8">Документы не загружены</p>
        )}
      </div>
    </div>

    <div className="bg-blue-50 border border-blue-200 p-4 rounded-lg">
      <h4 className="font-semibold text-blue-900 mb-2">Поддерживаемые форматы</h4>
      <p className="text-sm text-blue-700">
        PDF, DOC, DOCX, XLS, XLSX, DWG, DXF, STEP, IGES, JPG, PNG, CSV, JSON, XML и другие.
        Максимальный размер файла: 50 МБ.
      </p>
    </div>
  </div>
);

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
              <select
                value={form.condition_type}
                onChange={(e) => setForm({ ...form, condition_type: e.target.value })}
                className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500"
              >
                {CONDITION_TYPE_OPTIONS.map(o => (
                  <option key={o.value} value={o.value}>{o.label}</option>
                ))}
              </select>
            </div>
            <div className="md:col-span-1">
              <label className="block text-sm font-medium text-slate-700 mb-2">Оператор</label>
              <select
                value={form.operator}
                onChange={(e) => setForm({ ...form, operator: e.target.value })}
                className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500"
              >
                {OPERATOR_OPTIONS.map(o => (
                  <option key={o.value} value={o.value}>{o.label}</option>
                ))}
              </select>
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
            <select
              value={form.severity}
              onChange={(e) => setForm({ ...form, severity: e.target.value })}
              className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500"
            >
              {SEVERITY_OPTIONS.map(o => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
            </select>
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
              className="px-6 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors font-medium disabled:opacity-60"
            >
              {saving ? 'Сохранение...' : 'Сохранить правило'}
            </button>
            <button
              onClick={cancelEdit}
              className="px-6 py-2 bg-slate-100 text-slate-700 rounded-lg hover:bg-slate-200 transition-colors font-medium"
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
            className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors font-medium"
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
            className="px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors font-medium"
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

// ============================================================================
// Дашборд — стартовый экран со сводной статистикой
// ----------------------------------------------------------------------------
// Отображает общее состояние парка оборудования, распределение по этапам ЖЦ,
// типам и уровням критичности, а также списки изделий, требующих внимания.
// Данные получает одним запросом с /api/dashboard/summary.
// ============================================================================

// Палитра для диаграмм
const STAGE_COLORS = {
  blue:   '#3b82f6',
  purple: '#a855f7',
  green:  '#10b981',
  yellow: '#f59e0b',
  red:    '#ef4444',
};

// Сегмент круговой диаграммы (SVG)
function describeArcPath(cx, cy, r, startAngle, endAngle) {
  const start = polarToCartesian(cx, cy, r, endAngle);
  const end = polarToCartesian(cx, cy, r, startAngle);
  const largeArcFlag = endAngle - startAngle <= 180 ? '0' : '1';
  return `M ${cx} ${cy} L ${start.x} ${start.y} A ${r} ${r} 0 ${largeArcFlag} 0 ${end.x} ${end.y} Z`;
}
function polarToCartesian(cx, cy, r, angleInDegrees) {
  const angleInRadians = (angleInDegrees - 90) * Math.PI / 180.0;
  return { x: cx + r * Math.cos(angleInRadians), y: cy + r * Math.sin(angleInRadians) };
}

const PieChart = ({ data, size = 200 }) => {
  const total = data.reduce((sum, d) => sum + d.value, 0);
  if (total === 0) {
    return (
      <div className="flex items-center justify-center" style={{ width: size, height: size }}>
        <p className="text-slate-400 text-sm">Нет данных</p>
      </div>
    );
  }
  const cx = size / 2;
  const cy = size / 2;
  const r = size / 2 - 4;
  let angleStart = 0;
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
      {data.map((d, i) => {
        const angle = (d.value / total) * 360;
        if (angle === 0) return null;
        // Если только один сегмент и он = 100%, рисуем круг
        if (angle >= 360) {
          return <circle key={i} cx={cx} cy={cy} r={r} fill={d.color} />;
        }
        const path = describeArcPath(cx, cy, r, angleStart, angleStart + angle);
        angleStart += angle;
        return <path key={i} d={path} fill={d.color} />;
      })}
    </svg>
  );
};

// Столбчатая диаграмма
const BarChart = ({ data, height = 220 }) => {
  if (data.length === 0) {
    return <p className="text-slate-400 text-sm text-center py-8">Нет данных</p>;
  }
  const max = Math.max(...data.map(d => d.value), 1);
  return (
    <div className="space-y-2">
      {data.map((d, i) => (
        <div key={i} className="flex items-center gap-3">
          <div className="w-32 flex-shrink-0 text-sm text-slate-700 truncate" title={d.label}>
            {d.label}
          </div>
          <div className="flex-1 bg-slate-100 rounded-full h-7 overflow-hidden relative">
            <div
              className="h-full rounded-full transition-all flex items-center justify-end pr-2"
              style={{ width: `${(d.value / max) * 100}%`, backgroundColor: d.color || '#3b82f6', minWidth: '24px' }}
            >
              <span className="text-xs font-semibold text-white">{d.value}</span>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
};

// Плитка с числом для верхнего ряда
const SummaryTile = ({ label, value, icon: Icon, color, onClick }) => (
  <div
    onClick={onClick}
    className={`bg-white rounded-xl shadow-sm border border-slate-200 p-5 ${onClick ? 'cursor-pointer hover:shadow-md hover:border-slate-300 transition-all' : ''}`}
  >
    <div className="flex items-start justify-between mb-3">
      <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${color}`}>
        <Icon className="w-5 h-5 text-white" />
      </div>
    </div>
    <div className="text-3xl font-bold text-slate-800 mb-1">{value}</div>
    <div className="text-sm text-slate-500">{label}</div>
  </div>
);

// ============================================================================
// Модальное окно превью импорта.
// ----------------------------------------------------------------------------
// Показывает результат анализа загруженного файла перед фактическим импортом.
// Если файл не подошёл — показывает причину и кнопку «Закрыть».
// Если подошёл — показывает статистику и кнопку «Импортировать».
// ============================================================================
const ImportPreviewModal = ({ preview, importing, onConfirm, onCancel }) => (
  <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
    <div className="bg-white rounded-xl shadow-2xl max-w-2xl w-full max-h-[90vh] overflow-y-auto">
      <div className="p-6">
        <div className="flex items-start justify-between mb-4">
          <div className="flex items-center gap-3">
            {preview.ok ? (
              <CheckCircle className="w-8 h-8 text-green-600 flex-shrink-0" />
            ) : (
              <AlertCircle className="w-8 h-8 text-red-600 flex-shrink-0" />
            )}
            <h2 className="text-xl font-bold text-slate-800">
              {preview.ok ? 'Готово к импорту' : 'Импорт невозможен'}
            </h2>
          </div>
        </div>

        <div className="text-sm text-slate-600 mb-4">
          Файл: <code className="bg-slate-100 px-2 py-0.5 rounded font-mono">{preview.fileName}</code>
        </div>

        {!preview.ok ? (
          // Случай ошибки
          <div className="bg-red-50 border border-red-200 rounded-lg p-4 mb-4">
            <p className="text-red-900 font-medium mb-1">Причина:</p>
            <p className="text-red-800 text-sm">{preview.reason}</p>
          </div>
        ) : (
          // Успешный анализ
          <>
            <div className="grid grid-cols-2 gap-3 mb-4">
              <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 text-center">
                <div className="text-2xl font-bold text-blue-700">{preview.totalRows}</div>
                <div className="text-xs text-blue-900">Всего строк в файле</div>
              </div>
              <div className="bg-green-50 border border-green-200 rounded-lg p-3 text-center">
                <div className="text-2xl font-bold text-green-700">{preview.validRows}</div>
                <div className="text-xs text-green-900">Готовы к импорту</div>
              </div>
            </div>

            {preview.validRows < preview.totalRows && (
              <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 mb-4 text-sm">
                <p className="text-amber-900">
                  <strong>{preview.totalRows - preview.validRows}</strong> строк не имеют ни «Наименования», ни «Серийного номера» — они будут пропущены.
                </p>
              </div>
            )}

            <div className="mb-4">
              <h4 className="font-semibold text-slate-800 mb-2 text-sm">Распознанные поля:</h4>
              <div className="flex flex-wrap gap-2">
                {preview.recognizedFields.map(f => (
                  <span key={f.key} className="bg-green-100 text-green-800 text-xs px-2 py-1 rounded-full">
                    ✓ {f.label}
                  </span>
                ))}
              </div>
            </div>

            <div className="mb-4">
              <h4 className="font-semibold text-slate-800 mb-2 text-sm">Все столбцы в файле:</h4>
              <div className="flex flex-wrap gap-2">
                {preview.columnsInFile.map((col, i) => {
                  const isKnown = preview.recognizedFields.some(f => f.aliases.includes(col));
                  return (
                    <span
                      key={i}
                      className={`text-xs px-2 py-1 rounded-full ${
                        isKnown ? 'bg-slate-100 text-slate-700' : 'bg-slate-50 text-slate-500'
                      }`}
                      title={isKnown ? 'Будет импортирован' : 'Будет проигнорирован'}
                    >
                      {col}
                    </span>
                  );
                })}
              </div>
              <p className="text-xs text-slate-500 mt-2">
                Серым отмечены столбцы, которые система не распознала — они будут проигнорированы.
              </p>
            </div>

            <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 mb-4 text-sm text-blue-900">
              <strong>Примечание:</strong> при попытке создать изделие с уже существующим серийным номером запись будет пропущена. Итоговый отчёт покажет точные числа.
            </div>
          </>
        )}

        <div className="flex gap-3 justify-end pt-4 border-t border-slate-200">
          <button
            onClick={onCancel}
            disabled={importing}
            className="px-5 py-2 bg-slate-100 text-slate-700 rounded-lg hover:bg-slate-200 transition-colors font-medium disabled:opacity-50"
          >
            {preview.ok ? 'Отмена' : 'Закрыть'}
          </button>
          {preview.ok && (
            <button
              onClick={onConfirm}
              disabled={importing}
              className="px-5 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors font-medium disabled:opacity-60 flex items-center gap-2"
            >
              {importing && <RefreshCw className="w-4 h-4 animate-spin" />}
              {importing ? 'Импортируется...' : `Импортировать ${preview.validRows} строк`}
            </button>
          )}
        </div>
      </div>
    </div>
  </div>
);

const Dashboard = ({ onOpenProduct, onGoCatalog }) => {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await api.getDashboardSummary();
      setData(result);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  if (loading) {
    return (
      <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-12 text-center">
        <RefreshCw className="w-10 h-10 text-blue-500 mx-auto mb-3 animate-spin" />
        <p className="text-slate-600">Загрузка статистики...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-red-50 border border-red-200 rounded-xl p-6">
        <p className="text-red-900 font-medium mb-2">Не удалось загрузить дашборд</p>
        <p className="text-red-700 text-sm mb-3">{error}</p>
        <button
          onClick={load}
          className="px-4 py-2 bg-red-600 text-white rounded hover:bg-red-700 text-sm font-medium"
        >
          Повторить
        </button>
      </div>
    );
  }

  if (!data) return null;

  // Подготовка данных для диаграмм
  const stagePieData = data.byStage
    .filter(s => s.count > 0)
    .map(s => ({
      label: s.name,
      value: s.count,
      color: STAGE_COLORS[s.color] || '#6b7280'
    }));

  const typeBarData = data.byType.map(t => ({
    label: t.type,
    value: t.count,
    color: '#3b82f6'
  }));

  const inOperation = data.byStage.find(s => s.id === 'operation')?.count || 0;
  const warningCount = data.bySeverity.warning + data.bySeverity.critical;

  return (
    <div className="space-y-6">
      {/* Заголовок */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h2 className="text-2xl font-bold text-slate-800">Сводная панель</h2>
          <p className="text-sm text-slate-500">
            Текущее состояние парка промышленного оборудования
          </p>
        </div>
        <button
          onClick={load}
          className="flex items-center gap-2 px-4 py-2 bg-white border border-slate-300 text-slate-700 rounded-lg hover:bg-slate-50 transition-colors text-sm font-medium"
        >
          <RefreshCw className="w-4 h-4" />
          Обновить
        </button>
      </div>

      {/* Верхний ряд — 4 плитки */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <SummaryTile
          label="Всего изделий в системе"
          value={data.totalProducts}
          icon={Package}
          color="bg-blue-500"
          onClick={onGoCatalog}
        />
        <SummaryTile
          label="В эксплуатации"
          value={inOperation}
          icon={Factory}
          color="bg-green-500"
        />
        <SummaryTile
          label="Требуют внимания"
          value={warningCount}
          icon={AlertTriangle}
          color="bg-amber-500"
        />
        <SummaryTile
          label="Критическое состояние"
          value={data.bySeverity.critical}
          icon={AlertCircle}
          color="bg-red-500"
        />
      </div>

      {/* Диаграммы */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Круговая — этапы ЖЦ */}
        <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-5">
          <h3 className="font-bold text-slate-800 mb-4">Распределение по этапам ЖЦ</h3>
          {stagePieData.length > 0 ? (
            <div className="flex items-center gap-6">
              <PieChart data={stagePieData} size={180} />
              <div className="flex-1 space-y-2">
                {stagePieData.map((s, i) => (
                  <div key={i} className="flex items-center gap-2 text-sm">
                    <div className="w-3 h-3 rounded-sm flex-shrink-0" style={{ backgroundColor: s.color }} />
                    <span className="text-slate-700 flex-1">{s.label}</span>
                    <span className="font-semibold text-slate-800">{s.value}</span>
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <p className="text-slate-400 text-sm text-center py-8">Нет данных</p>
          )}
        </div>

        {/* Столбчатая — типы оборудования */}
        <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-5">
          <h3 className="font-bold text-slate-800 mb-4">Распределение по типам оборудования</h3>
          <BarChart data={typeBarData} />
        </div>
      </div>

      {/* Списки изделий */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Критические */}
        <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-5">
          <div className="flex items-center gap-2 mb-4">
            <AlertCircle className="w-5 h-5 text-red-600" />
            <h3 className="font-bold text-slate-800">Требуют немедленного внимания</h3>
          </div>
          {data.criticalProducts.length === 0 && data.warningProducts.length === 0 ? (
            <div className="text-center py-8">
              <ShieldCheck className="w-12 h-12 text-green-500 mx-auto mb-2" />
              <p className="text-slate-600 text-sm">Все изделия в норме</p>
            </div>
          ) : (
            <div className="space-y-2">
              {[...data.criticalProducts, ...data.warningProducts].slice(0, 6).map((p, i) => {
                const isCritical = data.criticalProducts.some(c => c.id === p.id);
                return (
                  <div
                    key={p.id}
                    onClick={() => onOpenProduct(p.id)}
                    className={`border rounded-lg p-3 cursor-pointer transition-colors ${
                      isCritical ? 'bg-red-50 border-red-200 hover:border-red-400' : 'bg-amber-50 border-amber-200 hover:border-amber-400'
                    }`}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex-1 min-w-0">
                        <p className="font-medium text-slate-800 truncate">{p.name}</p>
                        <p className="text-xs text-slate-500 font-mono mt-0.5">{p.serialNumber || '—'}</p>
                      </div>
                      <span className={`px-2 py-0.5 rounded text-xs font-medium flex-shrink-0 ${
                        isCritical ? 'bg-red-200 text-red-900' : 'bg-amber-200 text-amber-900'
                      }`}>
                        {isCritical ? 'Критическое' : 'Предупреждение'} ({p.triggeredCount})
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Ближайшие ТО */}
        <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-5">
          <div className="flex items-center gap-2 mb-4">
            <Clock className="w-5 h-5 text-blue-600" />
            <h3 className="font-bold text-slate-800">Ближайшие ТО (30 дней)</h3>
          </div>
          {data.upcomingTO.length === 0 ? (
            <div className="text-center py-8">
              <CheckCircle className="w-12 h-12 text-green-500 mx-auto mb-2" />
              <p className="text-slate-600 text-sm">Нет запланированных ТО в ближайшие 30 дней</p>
            </div>
          ) : (
            <div className="space-y-2">
              {data.upcomingTO.slice(0, 6).map(p => {
                const overdue = p.daysUntilTO < 0;
                const urgent = p.daysUntilTO >= 0 && p.daysUntilTO <= 7;
                return (
                  <div
                    key={p.id}
                    onClick={() => onOpenProduct(p.id)}
                    className={`border rounded-lg p-3 cursor-pointer transition-colors ${
                      overdue ? 'bg-red-50 border-red-200 hover:border-red-400'
                        : urgent ? 'bg-amber-50 border-amber-200 hover:border-amber-400'
                        : 'bg-blue-50 border-blue-200 hover:border-blue-400'
                    }`}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex-1 min-w-0">
                        <p className="font-medium text-slate-800 truncate">{p.name}</p>
                        <p className="text-xs text-slate-500 font-mono mt-0.5">{p.serialNumber || '—'}</p>
                      </div>
                      <div className="text-right flex-shrink-0">
                        <p className={`text-xs font-semibold ${
                          overdue ? 'text-red-700' : urgent ? 'text-amber-700' : 'text-blue-700'
                        }`}>
                          {overdue
                            ? `Просрочено на ${Math.abs(p.daysUntilTO)} дн.`
                            : p.daysUntilTO === 0 ? 'Сегодня'
                            : `Через ${p.daysUntilTO} дн.`}
                        </p>
                        <p className="text-xs text-slate-500 mt-0.5">{p.nextTO}</p>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* Подпись внизу */}
      <div className="text-center text-xs text-slate-400">
        Данные обновлены: {new Date(data.generatedAt).toLocaleString('ru-RU')}
      </div>
    </div>
  );
};

export default DigitalPassportPLM;