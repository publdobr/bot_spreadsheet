require('dotenv').config();
const { Telegraf, Markup } = require('telegraf');
const { GoogleSpreadsheet } = require('google-spreadsheet');
const { JWT } = require('google-auth-library');

// Проверка наличия обязательных переменных окружения
const requiredEnv = ['TELEGRAM_BOT_TOKEN', 'GOOGLE_SHEET_ID', 'GOOGLE_SERVICE_ACCOUNT_EMAIL', 'GOOGLE_PRIVATE_KEY'];
for (const varName of requiredEnv) {
  if (!process.env[varName]) {
    console.error(`Ошибка: Переменная окружения ${varName} не установлена.`);
    process.exit(1);
  }
}

// Инициализация переменных из .env
const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const SHEET_ID = process.env.GOOGLE_SHEET_ID;
const SERVICE_ACCOUNT_EMAIL = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL;
const PRIVATE_KEY = process.env.GOOGLE_PRIVATE_KEY.replace(/\n/g, '\n');

// Настройка аутентификации с Google Sheets
const serviceAccountAuth = new JWT({
  email: SERVICE_ACCOUNT_EMAIL,
  key: PRIVATE_KEY,
  scopes: ['https://www.googleapis.com/auth/spreadsheets'],
});

const doc = new GoogleSpreadsheet(SHEET_ID, serviceAccountAuth);

// Инициализация бота
const bot = new Telegraf(BOT_TOKEN);

// Переменная для кеширования заголовков
let headersCache = [];

/**
 * Функция для доступа к таблице и загрузки заголовков
 * @returns {Promise<GoogleSpreadsheetWorksheet|null>}
 */
async function getSheet() {
  try {
    await doc.loadInfo(); // Загружаем информацию о документе
    const sheet = doc.sheetsByIndex[0]; // Получаем первый лист
    await sheet.loadHeaderRow(); // Загружаем строку с заголовками
    headersCache = sheet.headerValues; // Кешируем заголовки
    return sheet;
  } catch (error) {
    console.error('Ошибка доступа к Google Sheet:', error);
    return null;
  }
}

// Обработчик команды /start
bot.start((ctx) => {
  ctx.reply(
    'Добро пожаловать! Я бот для работы с Google Таблицей.\n\n' +
    'Используйте команду /columns, чтобы увидеть список доступных столбцов.\n\n' +
    'После этого отправьте мне название столбца, и я выведу все его уникальные значения.'
  );
});

// Обработчик команды /columns
bot.command('columns', async (ctx) => {
  try {
    await ctx.reply('Загружаю список столбцов...');
    const sheet = await getSheet();
    if (!sheet) {
      return ctx.reply('Не удалось получить доступ к таблице. Проверьте настройки и права доступа.');
    }

    const headers = headersCache;
    if (headers && headers.length > 0) {
      const headerList = headers.map((header, index) => `${index + 1}. ${header}`).join('\n');
      ctx.reply(`Вот список столбцов:\n\n${headerList}\n\nТеперь отправьте мне название нужного столбца.`);
    } else {
      ctx.reply('В таблице не найдены столбцы или она пуста.');
    }
  } catch (error) {
    console.error('Ошибка в команде /columns:', error);
    ctx.reply('Произошла ошибка при получении названий столбцов.');
  }
});

// Обработчик текстовых сообщений
bot.on('text', async (ctx) => {
  const columnName = ctx.message.text.trim();

  // Игнорируем команды
  if (columnName.startsWith('/')) {
    return;
  }

  try {
    await ctx.reply(`Ищу уникальные значения в столбце "${columnName}"...`);
    
    const sheet = await getSheet();
    if (!sheet) {
      return ctx.reply('Не удалось получить доступ к таблице. Проверьте настройки.');
    }

    // Проверяем, существует ли такой столбец
    if (!headersCache.includes(columnName)) {
      return ctx.reply(`Столбец с названием "${columnName}" не найден. Используйте /columns, чтобы увидеть правильные названия.`);
    }

    const rows = await sheet.getRows();
    const values = new Set();

    rows.forEach(row => {
      const cellValue = row.get(columnName);
      // Добавляем в Set только непустые значения
      if (cellValue !== null && cellValue !== undefined && cellValue.toString().trim() !== '') {
        values.add(cellValue.toString().trim());
      }
    });

    const uniqueValues = Array.from(values);

    if (uniqueValues.length > 0) {
      const resultMessage = `Уникальные значения для столбца "${columnName}":\n\n- ${uniqueValues.join('\n- ')}`;
       // Проверяем длину сообщения, чтобы избежать ошибки Telegram API
      if (resultMessage.length > 4096) {
        ctx.reply(`Найдено слишком много уникальных значений (${uniqueValues.length}). Telegram не может отправить такое длинное сообщение.`);
      } else {
        ctx.reply(resultMessage);
      }
    } else {
      ctx.reply(`В столбце "${columnName}" не найдено заполненных ячеек.`);
    }

  } catch (error) {
    console.error('Ошибка при обработке текстового сообщения:', error);
    ctx.reply('Произошла внутренняя ошибка. Попробуйте позже.');
  }
});

// Запуск бота
bot.launch().then(() => {
  console.log('Бот успешно запущен');
}).catch(err => {
  console.error('Ошибка при запуске бота:', err);
});

// Обработка graceful stop
process.once('SIGINT', () => bot.stop('SIGINT'));
process.once('SIGTERM', () => bot.stop('SIGTERM'));
