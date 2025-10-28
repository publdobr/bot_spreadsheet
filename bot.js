require('dotenv').config();
const { Telegraf, Markup } = require('telegraf');
const sheetService = require('./googleSheet');

// Проверка наличия токена бота
if (!process.env.TELEGRAM_BOT_TOKEN) {
  console.error('Ошибка: Переменная окружения TELEGRAM_BOT_TOKEN не установлена.');
  process.exit(1);
}

const bot = new Telegraf(process.env.TELEGRAM_BOT_TOKEN);

// --- Обработчики команд ---

// /start: Приветственное сообщение
bot.start((ctx) => {
  ctx.reply(
    'Добро пожаловать! Я бот для работы с Google Таблицей.\n\n' +
    'Используйте команду /columns, чтобы выбрать столбец и получить данные.'
  );
});

// /columns: Показывает кнопки с названиями столбцов
bot.command('columns', async (ctx) => {
  try {
    await ctx.reply('Загружаю список столбцов...');
    const headers = await sheetService.getHeaders();

    if (headers && headers.length > 0) {
      const buttons = headers.map(header => Markup.button.callback(header, `column_${header}`));
      const keyboard = Markup.inlineKeyboard(buttons, { columns: 2 });
      ctx.reply('Выберите столбец для просмотра:', keyboard);
    } else {
      ctx.reply('В таблице не найдены столбцы или она пуста.');
    }
  } catch (error) {
    console.error('Ошибка в команде /columns:', error);
    ctx.reply('Произошла ошибка при получении названий столбцов. Проверьте настройки доступа к таблице.');
  }
});

// --- Обработчики действий (нажатий на кнопки) ---

// Действие для выбора столбца
bot.action(/^column_(.+)/, async (ctx) => {
  const columnName = ctx.match[1];

  try {
    await ctx.answerCbQuery();
    await ctx.editMessageText(`Загружаю значения для столбца "${columnName}"...`);

    const uniqueValues = await sheetService.getUniqueColumnValues(columnName);

    if (uniqueValues.length > 0) {
      const valueButtons = uniqueValues.map(value => {
        const shortValue = value.length > 30 ? `${value.substring(0, 27)}...` : value;
        const callbackData = `value_${columnName}_${encodeURIComponent(value)}`;

        if (Buffer.byteLength(callbackData, 'utf8') > 64) {
          console.warn(`Callback data for value "${value}" is too long. Skipping button.`);
          return null;
        }
        return Markup.button.callback(shortValue, callbackData);
      }).filter(Boolean);

      if (valueButtons.length > 0) {
        const keyboard = Markup.inlineKeyboard(valueButtons, { columns: 2 });
        await ctx.editMessageText(`Выберите значение из столбца "${columnName}":`, keyboard);
      } else {
        await ctx.editMessageText('Не удалось создать кнопки. Возможно, текст значений слишком длинный.');
      }
    } else {
      await ctx.editMessageText(`В столбце "${columnName}" не найдено заполненных ячеек.`);
    }
  } catch (error) {
    console.error(`Ошибка при обработке столбца ${columnName}:`, error);
    ctx.reply('Произошла внутренняя ошибка. Попробуйте позже.');
  }
});

// Действие для выбора конкретного значения
bot.action(/^value_(.+)_(.+)/, async (ctx) => {
  const columnName = ctx.match[1];
  const value = decodeURIComponent(ctx.match[2]);

  try {
    await ctx.answerCbQuery();
    await ctx.editMessageText(`Ищу информацию по запросу: "${value}"...`);

    const rowData = await sheetService.findRowByValue(columnName, value);

    if (rowData) {
      let resultMessage = `*Найдена информация для "${value}":*\n\n`;
      for (const [header, cellValue] of Object.entries(rowData)) {
        resultMessage += `*${header}:* ${cellValue}\n`;
      }

      const keyboard = Markup.inlineKeyboard([
        Markup.button.callback('‹ Назад к выбору столбца', 'back_to_columns')
      ]);
      await ctx.editMessageText(resultMessage, { parse_mode: 'Markdown', reply_markup: keyboard.reply_markup });
    } else {
      await ctx.editMessageText(`Не удалось найти информацию для "${value}".`);
    }
  } catch (error) {
    console.error(`Ошибка при поиске значения ${value}:`, error);
    ctx.reply('Произошла внутренняя ошибка при поиске данных.');
  }
});

// Действие для кнопки "Назад"
bot.action('back_to_columns', async (ctx) => {
  try {
    await ctx.answerCbQuery();
    await ctx.deleteMessage();
    // Повторно вызываем команду /columns
    ctx.command = 'columns';
    await bot.handleUpdate(ctx.update);
  } catch (error) {
    console.error('Ошибка при возврате к выбору столбцов:', error);
    ctx.reply('Не удалось вернуться к списку столбцов.');
  }
});

// --- Обработка прочих сообщений ---

bot.on('text', (ctx) => {
  if (!ctx.message.text.startsWith('/')) {
    ctx.reply('Пожалуйста, используйте команду /columns для начала работы.');
  }
});

// --- Запуск и остановка бота ---

bot.launch().then(() => {
  console.log('Бот успешно запущен');
}).catch(err => {
  console.error('Ошибка при запуске бота:', err);
});

process.once('SIGINT', () => bot.stop('SIGINT'));
process.once('SIGTERM', () => bot.stop('SIGTERM'));
