import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import QRCode from 'qrcode';
import { formatDateRu } from './format';

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

  // jsPDF нужен шрифт в формате TTF (WOFF он не понимает). Пробуем источники по очереди.
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

export async function generateProductPassportPDF(product, stages, evaluation) {
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
