import { useState, useEffect, useCallback, useLayoutEffect, useRef } from 'react';
import { FileText, Clock, Wrench, Brain, Upload, RefreshCw, Activity } from 'lucide-react';
import { api } from './api/client';
import { STAGE_STYLES } from './constants/stages';
// Библиотеки PDF и Excel тяжёлые (≈700 КБ) и нужны только по кнопке:
// загружаем их отдельным файлом в момент первого использования
const pdfLib = () => import('./lib/passportPdf');
const excelLib = () => import('./lib/importExport');
import useProductEditor from './hooks/useProductEditor';
import AppHeader from './components/layout/AppHeader';
import TelemetryProvider from './telemetry/TelemetryProvider';
import CommandPalette from './components/layout/CommandPalette';
import ServerUnavailableBanner from './components/common/ServerUnavailableBanner';
import Dashboard from './components/dashboard/Dashboard';
import CatalogPage from './pages/CatalogPage';
import ImportPage from './pages/ImportPage';
import AssistantPage from './pages/AssistantPage';
import ImportPreviewModal from './components/import/ImportPreviewModal';
import RulesManager from './components/rules/RulesManager';
import ProductEditor from './components/product/ProductEditor';
import DetailView from './components/product/DetailView';

const DETAIL_TABS = [
  { id: 'general', label: 'Общие сведения', icon: FileText },
  { id: 'monitoring', label: 'Мониторинг и прогноз', icon: Activity },
  { id: 'lifecycle', label: 'Жизненный цикл', icon: Clock },
  { id: 'maintenance', label: 'Обслуживание', icon: Wrench },
  { id: 'expert', label: 'Экспертная оценка', icon: Brain },
  { id: 'documents', label: 'Документация', icon: Upload }
];

const EDITOR_TABS = [
  { id: 'basic', label: 'Основное' },
  { id: 'specs', label: 'Характеристики' },
  { id: 'lifecycle', label: 'Жизненный цикл' },
  { id: 'maintenance', label: 'Обслуживание' }
];

const MAIN_VIEWS = ['dashboard', 'catalog', 'assistant', 'rules', 'import'];
const urlFor = (view, pid) => (pid ? `#/product/${pid}` : view === 'dashboard' ? '#/' : `#/${view}`);

// Корневой компонент: держит каталог, текущий раздел и выбранное изделие,
// а сами экраны отрисовывают страницы и компоненты из соседних папок.
const DigitalPassportPLM = () => {
  const [products, setProducts] = useState([]);
  const [stages, setStages] = useState([]);
  const [loading, setLoading] = useState(true);
  const [serverError, setServerError] = useState(false);

  // Раздел берём из адреса (#/catalog), чтобы ссылка и обновление страницы
  // открывали тот же экран
  const [view, setView] = useState(() => {
    const m = window.location.hash.match(/^#\/(\w+)/);
    return m && MAIN_VIEWS.includes(m[1]) ? m[1] : 'dashboard';
  });
  // Карточка из адреса (#/product/56) — откроется после загрузки каталога
  const initialProductId = useRef((window.location.hash.match(/^#\/product\/(\d+)/) || [])[1] || null);
  const [selectedProduct, setSelectedProduct] = useState(null);
  // Откуда открыли карточку (каталог, помощник, дашборд) — туда и возвращаемся,
  // причём на то же место прокрутки
  const [returnTo, setReturnTo] = useState('catalog');
  const scrollPositions = useRef({});
  // Фильтр каталога по месту, заданный извне (например, кликом по корпусу на генплане)
  const [catalogFilter, setCatalogFilter] = useState(null);
  // Командная строка Ctrl+K и вопрос помощнику из неё
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [askRequest, setAskRequest] = useState(null);
  useEffect(() => {
    const onKey = (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k' || (e.ctrlKey || e.metaKey) && e.code === 'KeyK') {
        e.preventDefault();
        setPaletteOpen(o => !o);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);
  const [activeTab, setActiveTab] = useState('general');

  const [saving, setSaving] = useState(false);
  const [uploadingDoc, setUploadingDoc] = useState(false);
  const [downloadingPDF, setDownloadingPDF] = useState(false);

  // Превью импорта: от парсинга файла до подтверждения пользователем
  const [importPreview, setImportPreview] = useState(null);
  const [importing, setImporting] = useState(false);

  const editor = useProductEditor();

  const loadCatalog = useCallback(async () => {
    setLoading(true);
    setServerError(false);
    try {
      const [productsData, stagesData] = await Promise.all([api.getProducts(), api.getStages()]);
      setProducts(productsData);
      setStages(stagesData);
    } catch (err) {
      if (err.message === 'SERVER_UNAVAILABLE') setServerError(true);
      else alert(`Не удалось загрузить данные: ${err.message}`);
    } finally {
      setLoading(false);
    }
  }, []);

  // eslint-disable-next-line react-hooks/set-state-in-effect -- первичная загрузка данных с сервера
  useEffect(() => { loadCatalog(); }, [loadCatalog]);

  const showProduct = (fullProduct) => {
    setSelectedProduct(fullProduct);
    setView('details');
    setActiveTab('general');
  };

  // Ссылка из QR-кода паспорта (?productId=X) открывает карточку изделия
  // после первой загрузки каталога.
  useEffect(() => {
    if (loading || serverError) return;
    const fromQr = new URLSearchParams(window.location.search).get('productId');
    const targetId = fromQr || initialProductId.current;
    initialProductId.current = null;
    if (!targetId) return;

    api.getProduct(parseInt(targetId, 10))
      .then(fullProduct => {
        showProduct(fullProduct);
        // Убираем ?productId из адреса: дальше карточку описывает #/product/N
        if (fromQr) window.history.replaceState(window.history.state, '', window.location.pathname + window.location.hash);
      })
      .catch(() => { /* изделие не найдено: остаёмся на текущем экране */ });
  }, [loading, serverError]);

  // ---------------- Кнопки «назад/вперёд» браузера ----------------
  // Сайт одностраничный: экраны переключаются состоянием React, страница не
  // перезагружается. Чтобы браузерные стрелки работали, каждый переход
  // записываем в историю браузера (pushState) вместе с адресом #/раздел,
  // а нажатие «назад/вперёд» (событие popstate) превращаем обратно в состояние.
  useEffect(() => {
    if ('scrollRestoration' in window.history) window.history.scrollRestoration = 'manual';
  }, []);

  useEffect(() => {
    if (view === 'editor') return;                       // редактор — не отдельный шаг истории
    const pid = view === 'details' ? selectedProduct?.id : null;
    if (view === 'details' && !pid) return;
    const st = window.history.state;
    if (st?.plm && st.view === view && st.pid === pid) return;   // уже здесь (в т.ч. после «назад»)
    if (!st?.plm) {
      window.history.replaceState({ plm: true, view, pid, idx: 0 }, '', urlFor(view, pid));
    } else {
      window.history.pushState({ plm: true, view, pid, idx: (st.idx || 0) + 1 }, '', urlFor(view, pid));
    }
  }, [view, selectedProduct?.id]);

  useEffect(() => {
    const onPop = async (e) => {
      // Адрес вписан руками (#/catalog, #/product/56) — у такого шага нет нашего
      // состояния, разбираем сам адрес
      const st = e.state?.plm ? e.state : (() => {
        const prod = window.location.hash.match(/^#\/product\/(\d+)/);
        if (prod) return { pid: Number(prod[1]) };
        const m = window.location.hash.match(/^#\/(\w+)/);
        return { view: m && MAIN_VIEWS.includes(m[1]) ? m[1] : 'dashboard' };
      })();
      if (st.pid) {
        try {
          const full = await api.getProduct(st.pid);
          setSelectedProduct(full);
          setActiveTab('general');
          setView('details');
        } catch { setSelectedProduct(null); setView('catalog'); }
      } else {
        if (scrollPositions.current[st.view] === undefined) window.scrollTo(0, 0);
        setSelectedProduct(null);
        setView(st.view);
      }
    };
    const onHash = (e) => { if (!window.history.state?.plm) onPop(e); };
    window.addEventListener('popstate', onPop);
    window.addEventListener('hashchange', onHash);
    return () => { window.removeEventListener('popstate', onPop); window.removeEventListener('hashchange', onHash); };
  }, []);

  const navigate = (target) => {
    setView(target);
    if (target !== 'import') setSelectedProduct(null);
    window.scrollTo(0, 0);
  };

  // Назад из карточки: на экран, откуда пришли, и на ту же прокрутку
  // Если карточку открыли с другого экрана сайта, это тот же шаг, что и
  // браузерная стрелка — используем её, чтобы история не раздваивалась
  const goBack = () => {
    if (window.history.state?.plm && window.history.state.idx > 0) { window.history.back(); return; }
    setSelectedProduct(null);
    setView(returnTo);
  };

  // Прокрутку восстанавливаем после отрисовки экрана, но до показа кадра
  useLayoutEffect(() => {
    const saved = scrollPositions.current[view];
    if (saved !== undefined) {
      window.scrollTo(0, saved);
      delete scrollPositions.current[view];
    }
  }, [view]);

  // В каталоге у нас summary без характеристик, для карточки тянем полные данные
  const openProduct = async (productId) => {
    try {
      const fullProduct = await api.getProduct(productId);
      if (['catalog', 'assistant', 'dashboard'].includes(view)) {
        setReturnTo(view);
        scrollPositions.current[view] = window.scrollY;
      }
      showProduct(fullProduct);
      window.scrollTo(0, 0);
    } catch (err) {
      alert(`Не удалось открыть изделие: ${err.message}`);
    }
  };

  // ---------------- Редактирование изделий ----------------

  const addNewProduct = () => {
    editor.startNew();
    setView('editor');
  };

  const editProduct = async (product, e) => {
    if (e) e.stopPropagation();
    try {
      const full = product.specifications ? product : await api.getProduct(product.id);
      editor.startEdit(full);
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
    const { editedProduct } = editor;
    if (!editedProduct.name || !editedProduct.type) {
      alert('Заполните обязательные поля: Наименование и Тип');
      return;
    }
    const payload = editor.toPayload();
    setSaving(true);
    try {
      const saved = payload.id
        ? await api.updateProduct(payload.id, payload)
        : await api.createProduct(payload);
      showProduct(saved);
      loadCatalog();
    } catch (err) {
      alert(`Не удалось сохранить: ${err.message}`);
    } finally {
      setSaving(false);
    }
  };

  const cancelEdit = () => {
    editor.reset();
    setView(selectedProduct ? 'details' : 'catalog');
  };

  // ---------------- Документы и паспорт ----------------

  const refreshSelected = async () => setSelectedProduct(await api.getProduct(selectedProduct.id));

  const handleDocumentUpload = async (e) => {
    const files = Array.from(e.target.files);
    if (!files.length || !selectedProduct) return;
    setUploadingDoc(true);
    try {
      for (const file of files) await api.uploadDocument(selectedProduct.id, file);
      await refreshSelected();
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
      await refreshSelected();
    } catch (err) {
      alert(`Не удалось удалить документ: ${err.message}`);
    }
  };

  // PDF-паспорт. Заодно запрашиваем заключение экспертной системы, чтобы вложить
  // его в паспорт. Если не получилось, формируем паспорт без заключения.
  const handleDownloadPDF = async () => {
    if (!selectedProduct) return;
    setDownloadingPDF(true);
    try {
      const evaluation = await api.evaluateProduct(selectedProduct.id).catch(() => null);
      const { generateProductPassportPDF } = await pdfLib();
      await generateProductPassportPDF(selectedProduct, stages, evaluation);
    } catch (err) {
      console.error('[PDF] Ошибка:', err);
      alert(`Не удалось сформировать PDF: ${err.message}`);
    } finally {
      setDownloadingPDF(false);
    }
  };

  // ---------------- Импорт ----------------

  const handleFileSelected = async (event) => {
    const file = event.target.files[0];
    event.target.value = ''; // позволяет повторно выбрать тот же файл
    if (!file) return;
    try {
      const { parseImportFile, analyzeImportData } = await excelLib();
      const rows = await parseImportFile(file);
      setImportPreview({ ...analyzeImportData(rows), fileName: file.name });
    } catch (err) {
      setImportPreview({ ok: false, reason: err.message, fileName: file.name });
    }
  };

  const runImport = async () => {
    if (!importPreview?.ok) return;
    setImporting(true);
    let created = 0, skipped = 0, failed = 0;
    const { rowToProduct } = await excelLib();
    for (const row of importPreview.rawData) {
      const product = rowToProduct(row);
      if (!product) { skipped++; continue; }
      try {
        await api.createProduct(product);
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

  const getStageStyle = (stageId) => {
    const stage = stages.find(s => s.id === stageId);
    return STAGE_STYLES[stage?.color] || STAGE_STYLES.blue;
  };

  const ready = !serverError && !loading;

  return (
    <TelemetryProvider onOpenProduct={openProduct}>
    <div className="min-h-screen bg-slate-100">
      <AppHeader view={view} onNavigate={navigate} onOpenSearch={() => setPaletteOpen(true)} />
      <CommandPalette
        open={paletteOpen}
        onClose={() => setPaletteOpen(false)}
        products={products}
        onNavigate={navigate}
        onOpenProduct={openProduct}
        onAsk={(q) => { setAskRequest({ q, at: Date.now() }); navigate('assistant'); }}
      />

      <main className="max-w-[1680px] mx-auto px-3 sm:px-6 py-4 sm:py-6">
        {serverError && <ServerUnavailableBanner onRetry={loadCatalog} />}

        {!serverError && loading && (
          <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-12 text-center">
            <RefreshCw className="w-12 h-12 text-blue-500 mx-auto mb-4 animate-spin" />
            <p className="text-slate-600">Загрузка данных с сервера...</p>
          </div>
        )}

        {ready && view === 'dashboard' && (
          <Dashboard
            onOpenProduct={openProduct}
            onGoCatalog={() => { setCatalogFilter({ at: Date.now() }); navigate('catalog'); }}
            onShowInCatalog={(filter) => { setCatalogFilter({ ...filter, at: Date.now() }); navigate('catalog'); }}
          />
        )}

        {/* Каталог и помощник не размонтируются при уходе в карточку изделия:
            иначе сбросились бы поиск, фильтры, подгруженные карточки и диалог */}
        {ready && (
          <div hidden={view !== 'catalog'}>
          <CatalogPage
            products={products}
            stages={stages}
            getStageStyle={getStageStyle}
            onAdd={addNewProduct}
            onExport={async () => (await excelLib()).exportProductsToExcel(products, stages)}
            onOpen={(product) => openProduct(product.id)}
            onEdit={editProduct}
            onDelete={deleteProduct}
            filterRequest={catalogFilter}
          />
          </div>
        )}

        {ready && (
          <div hidden={view !== 'assistant'}>
            <AssistantPage getStageStyle={getStageStyle} onOpenProduct={openProduct} askRequest={askRequest} />
          </div>
        )}

        {!serverError && view === 'import' && <ImportPage onFileSelected={handleFileSelected} />}

        {importPreview && (
          <ImportPreviewModal
            preview={importPreview}
            importing={importing}
            onConfirm={runImport}
            onCancel={() => setImportPreview(null)}
          />
        )}

        {!serverError && view === 'rules' && <RulesManager />}

        {!serverError && view === 'editor' && editor.editedProduct && (
          <ProductEditor
            editedProduct={editor.editedProduct}
            setEditedProduct={editor.setEditedProduct}
            specsList={editor.specsList}
            stages={stages}
            editorTab={editor.editorTab}
            setEditorTab={editor.setEditorTab}
            editorTabs={EDITOR_TABS}
            saving={saving}
            onSave={saveProduct}
            onCancel={cancelEdit}
            onAddSpec={editor.specs.add}
            onUpdateSpecKey={editor.specs.updateKey}
            onUpdateSpecValue={editor.specs.updateValue}
            onDeleteSpec={editor.specs.remove}
            onAddLifecycleEvent={editor.lifecycle.add}
            onUpdateLifecycleEvent={editor.lifecycle.update}
            onDeleteLifecycleEvent={editor.lifecycle.remove}
            onImageUpload={editor.handleImageUpload}
          />
        )}

        {!serverError && view === 'details' && selectedProduct && (
          <DetailView
            selectedProduct={selectedProduct}
            stages={stages}
            getStageStyle={getStageStyle}
            tabs={DETAIL_TABS}
            activeTab={activeTab}
            setActiveTab={setActiveTab}
            onBack={goBack}
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
    </TelemetryProvider>
  );
};

export default DigitalPassportPLM;
