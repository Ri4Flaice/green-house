# Flower Orders Bot

Next.js-приложение для подготовки счетов из Google Sheets и отправки клиентам в WhatsApp через GreenAPI.

## Возможности

- вход через Google OAuth;
- список Google Sheets из Google Drive;
- выбор одной, нескольких или всех видимых вкладок выбранной таблицы;
- парсинг строк формата `A: имя/ник`, `B: телефон`, `C/D и далее: товар/цена`;
- объединение заказов одного клиента из нескольких вкладок по номеру телефона;
- расчет суммы наличными и удаленной оплаты `+5%`;
- вывод цены в сообщении ровно как в Google Sheets;
- предпросмотр сообщений перед рассылкой;
- отправка батчами через GreenAPI;
- отчет на экране и CSV.

## Локальный запуск

1. Установить зависимости:

```bash
npm install
```

2. Создать Google Cloud проект, включить Google Drive API и Google Sheets API.

3. Создать OAuth Client типа `Web application`.

4. Добавить redirect URI:

```text
http://localhost:3000/api/auth/callback/google
```

5. Скопировать `.env.example` в `.env.local` и заполнить значения:

```env
AUTH_SECRET=
AUTH_GOOGLE_ID=
AUTH_GOOGLE_SECRET=
AUTH_URL=http://localhost:3000

GREEN_API_URL=https://api.green-api.com
GREEN_API_ID_INSTANCE=
GREEN_API_TOKEN=

ALLOWED_GOOGLE_EMAILS=your-email@gmail.com
SEND_BATCH_SIZE=5
SEND_DELAY_MS=700
```

6. Запустить приложение:

```bash
npm run dev
```

Открыть `http://localhost:3000`.

## Формат таблицы

После выбора Google Sheet приложение покажет видимые листы таблицы. Первый лист отмечается автоматически, можно выбрать несколько листов или все сразу. Скрытые листы не показываются и не парсятся.

Первая строка каждого выбранного листа может быть заголовком. Данные читаются так:

| A | B | C | D | E | F |
| --- | --- | --- | --- | --- | --- |
| Имя или `1234 Имя` | Телефон | Товар 1 | Цена 1 | Товар 2 | Цена 2 |

Строки без корректного телефона, без заказов или с ошибочными ценами не отправляются и попадают в отчет.

Если один клиент найден на нескольких выбранных листах, его заказы объединяются в один счет по нормализованному номеру телефона. В сообщении у товаров появится источник листа, например `[Июнь] Роза — 1 500`.

Цена в списке заказов выводится без изменения текста из таблицы. Например, если в ячейке написано `1500 тенге`, в WhatsApp будет `Роза — 1500 тенге`; при этом сумма считается по числовой части цены.

## Деплой на Vercel

1. Залить проект на GitHub.
2. Создать Vercel Project из GitHub-репозитория.
3. В `Project Settings -> Environment Variables` указать те же переменные, что в `.env.example`.
4. Для production задать:

```env
AUTH_URL=https://your-domain.vercel.app
```

5. В Google Cloud OAuth Client добавить redirect URI:

```text
https://your-domain.vercel.app/api/auth/callback/google
```

6. Выполнить smoke-test:

- вход через Google;
- список таблиц;
- выбор таблицы и предпросмотр;
- отправка на тестовый номер;
- скачивание CSV-отчета.

## Команды проверки

```bash
npm run test
npm run build
```

`npm audit --omit=dev` может показывать advisory PostCSS внутри текущего Next.js. Не применяйте `npm audit fix --force`, потому что npm предлагает откатить Next.js на несовместимую старую версию.
