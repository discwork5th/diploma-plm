// ============================================================================
// Импорт и экспорт каталога изделий.
// ----------------------------------------------------------------------------
// Чистые функции без React: разбор файлов (Excel / CSV / JSON), анализ того,
// что нашлось в файле, преобразование строки файла в изделие и выгрузка
// каталога в Excel. UI только вызывает их и показывает результат.
// ============================================================================
import * as XLSX from 'xlsx';
import Papa from 'papaparse';

// Известные поля и их русские/английские названия.
// Используется и при импорте, и при анализе того, что мы нашли в файле.
export const KNOWN_FIELDS = [
  { key: 'name',              aliases: ['name', 'Наименование'],                 label: 'Наименование' },
  { key: 'type',              aliases: ['type', 'Тип'],                          label: 'Тип' },
  { key: 'manufacturer',      aliases: ['manufacturer', 'Производитель'],        label: 'Производитель' },
  { key: 'serialNumber',      aliases: ['serialNumber', 'Серийный номер'],       label: 'Серийный номер' },
  { key: 'manufactureDate',   aliases: ['manufactureDate', 'Дата производства'], label: 'Дата производства' },
  { key: 'commissioningDate', aliases: ['commissioningDate', 'Дата ввода'],      label: 'Дата ввода' },
  { key: 'currentStage',      aliases: ['currentStage', 'Этап'],                 label: 'Этап ЖЦ' },
];

const aliasesOf = (key) => KNOWN_FIELDS.find(f => f.key === key).aliases;

// Достать из строки значение по любому из его псевдонимов
export function pickField(row, aliases) {
  for (const a of aliases) {
    if (row[a] !== undefined && row[a] !== null && row[a] !== '') return row[a];
  }
  return null;
}

const isRow = (row) => row && typeof row === 'object';
const hasIdentity = (row) => pickField(row, aliasesOf('name')) || pickField(row, aliasesOf('serialNumber'));

// Проанализировать, что нашлось в файле, — для показа превью пользователю
export function analyzeImportData(rawData) {
  if (!Array.isArray(rawData) || rawData.length === 0) {
    return { ok: false, reason: 'Файл не содержит данных или формат не распознан.' };
  }

  // Какие колонки реально есть в файле (берём ключи первой непустой строки)
  const columnsInFile = Object.keys(rawData.find(isRow) || {});

  // Какие из них мы умеем распознавать
  const recognizedFields = KNOWN_FIELDS.filter(f =>
    f.aliases.some(a => columnsInFile.includes(a))
  );

  // Сколько строк выглядят разумно, то есть имеют хотя бы name или serialNumber
  const validRows = rawData.filter(row => isRow(row) && hasIdentity(row)).length;

  if (recognizedFields.length === 0) {
    const shown = columnsInFile.slice(0, 6).join(', ') + (columnsInFile.length > 6 ? '...' : '');
    return {
      ok: false,
      reason: `Не найдено ни одного знакомого столбца. В файле есть: ${shown}. Ожидаются колонки вроде "Наименование", "Тип", "Серийный номер".`
    };
  }

  if (validRows === 0) {
    return {
      ok: false,
      reason: 'Ни в одной строке файла не нашлось значений в полях "Наименование" или "Серийный номер". Импорт невозможен.'
    };
  }

  return { ok: true, totalRows: rawData.length, validRows, columnsInFile, recognizedFields, rawData };
}

// Превратить строку файла в изделие для API. null — строку нужно пропустить.
export function rowToProduct(row) {
  if (!isRow(row) || !hasIdentity(row)) return null;
  const get = (key) => pickField(row, aliasesOf(key));
  return {
    name: get('name') || 'Без названия',
    type: get('type') || 'Не указан',
    manufacturer: get('manufacturer') || '',
    serialNumber: get('serialNumber') || '',
    manufactureDate: get('manufactureDate') || new Date().toISOString().split('T')[0],
    commissioningDate: get('commissioningDate') || '',
    currentStage: get('currentStage') || 'design',
    image: row.image || '',
    specifications: row.specifications || {},
    lifecycleHistory: row.lifecycleHistory || [],
    maintenance: row.maintenance || {}
  };
}

const readFile = (file, method) => new Promise((resolve, reject) => {
  const reader = new FileReader();
  reader.onload = (e) => resolve(e.target.result);
  reader.onerror = () => reject(new Error('Ошибка чтения файла'));
  reader[method](file);
});

// Прочитать файл и вернуть массив строк. Ошибки — с понятным текстом для пользователя.
export async function parseImportFile(file) {
  const ext = file.name.split('.').pop().toLowerCase();

  if (ext === 'xlsx' || ext === 'xls') {
    const buffer = await readFile(file, 'readAsArrayBuffer');
    try {
      const workbook = XLSX.read(new Uint8Array(buffer), { type: 'array' });
      return XLSX.utils.sheet_to_json(workbook.Sheets[workbook.SheetNames[0]]);
    } catch (err) {
      throw new Error(`Не удалось прочитать Excel-файл: ${err.message}`, { cause: err });
    }
  }

  if (ext === 'csv') {
    return new Promise((resolve, reject) => {
      Papa.parse(file, {
        header: true,
        skipEmptyLines: true,
        complete: (results) => {
          if (results.errors?.length) reject(new Error(`Ошибка чтения CSV: ${results.errors[0].message}`));
          else resolve(results.data);
        },
        error: (err) => reject(new Error(`Не удалось прочитать CSV: ${err.message}`))
      });
    });
  }

  if (ext === 'json') {
    const text = await readFile(file, 'readAsText');
    try {
      const data = JSON.parse(text);
      return Array.isArray(data) ? data : [data];
    } catch (err) {
      throw new Error(`Файл не является валидным JSON: ${err.message}`, { cause: err });
    }
  }

  throw new Error(`Неподдерживаемый формат: .${ext}. Используйте .xlsx, .xls, .csv или .json.`);
}

// Выгрузить каталог в Excel
export function exportProductsToExcel(products, stages) {
  const rows = products.map(p => ({
    'ID': p.id,
    'Наименование': p.name,
    'Тип': p.type,
    'Производитель': p.manufacturer,
    'Серийный номер': p.serialNumber,
    'Дата производства': p.manufactureDate,
    'Этап жизненного цикла': stages.find(s => s.id === p.currentStage)?.name
  }));
  const ws = XLSX.utils.json_to_sheet(rows);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Цифровые паспорта');
  XLSX.writeFile(wb, 'digital_passports_export.xlsx');
}
