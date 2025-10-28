const { GoogleSpreadsheet } = require('google-spreadsheet');
const { JWT } = require('google-auth-library');

// Проверка наличия обязательных переменных окружения для Google Sheets
const requiredEnv = ['GOOGLE_SHEET_ID', 'GOOGLE_SERVICE_ACCOUNT_EMAIL', 'GOOGLE_PRIVATE_KEY'];
for (const varName of requiredEnv) {
  if (!process.env[varName]) {
    throw new Error(`Ошибка: Переменная окружения ${varName} не установлена.`);
  }
}

const SHEET_ID = process.env.GOOGLE_SHEET_ID;
const SERVICE_ACCOUNT_EMAIL = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL;
const PRIVATE_KEY = process.env.GOOGLE_PRIVATE_KEY.replace(/\\n/g, '\n');

// Настройка аутентификации
const serviceAccountAuth = new JWT({
  email: SERVICE_ACCOUNT_EMAIL,
  key: PRIVATE_KEY,
  scopes: ['https://www.googleapis.com/auth/spreadsheets'],
});

const doc = new GoogleSpreadsheet(SHEET_ID, serviceAccountAuth);
let headersCache = [];

/**
 * Загружает информацию о таблице и кеширует заголовки.
 * @returns {Promise<{sheet: GoogleSpreadsheetWorksheet, headers: string[]}>}
 */
async function loadSheetAndHeaders() {
  await doc.loadInfo();
  const sheet = doc.sheetsByIndex[0];
  await sheet.loadHeaderRow();
  headersCache = sheet.headerValues;
  return { sheet, headers: headersCache };
}

/**
 * Получает уникальные значения из указанного столбца.
 * @param {string} columnName - Название столбца.
 * @returns {Promise<string[]>} - Массив уникальных значений.
 */
async function getUniqueColumnValues(columnName) {
  const { sheet } = await loadSheetAndHeaders();
  const rows = await sheet.getRows();
  const values = new Set();

  rows.forEach(row => {
    const cellValue = row.get(columnName);
    if (cellValue !== null && cellValue !== undefined && cellValue.toString().trim() !== '') {
      values.add(cellValue.toString().trim());
    }
  });

  return Array.from(values);
}

/**
 * Находит строку по значению в определенном столбце.
 * @param {string} columnName - Название столбца для поиска.
 * @param {string} value - Искомое значение.
 * @returns {Promise<Object|null>} - Объект с данными строки или null.
 */
async function findRowByValue(columnName, value) {
  const { sheet, headers } = await loadSheetAndHeaders(); // Убедимся, что заголовки загружены
  const rows = await sheet.getRows();

  const foundRow = rows.find(row => {
    const cellValue = row.get(columnName);
    return cellValue !== null && cellValue !== undefined && cellValue.toString().trim() === value;
  });

  if (!foundRow) return null;

  // Преобразуем найденную строку в простой объект {header: value}
  const rowData = {};
  headers.forEach(header => {
    rowData[header] = foundRow.get(header) || '—';
  });

  return rowData;
}

/**
 * Получает кешированные заголовки.
 * @returns {Promise<string[]>}
 */
async function getHeaders() {
    if (headersCache.length === 0) {
        await loadSheetAndHeaders();
    }
    return headersCache;
}


module.exports = {
  getHeaders,
  getUniqueColumnValues,
  findRowByValue,
};
