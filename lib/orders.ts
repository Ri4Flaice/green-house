export type OrderItem = {
  name: string;
  price: number;
  rawPrice: string;
  sheetTitle?: string;
};

export type ParsedInvoice = {
  id: string;
  rowNumber: number;
  rawName: string;
  clientName: string;
  rawPhone: string;
  normalizedPhone: string;
  chatId: string;
  sheetTitles: string[];
  sourceLabel: string;
  items: OrderItem[];
  cashTotal: number;
  remoteTotal: number;
  message: string;
};

export type InvalidRow = {
  id: string;
  sheetTitle?: string;
  rowNumber: number;
  rawName: string;
  rawPhone: string;
  reason: string;
};

export type ParseResult = {
  invoices: ParsedInvoice[];
  invalidRows: InvalidRow[];
};

export type SendItem = {
  invoiceId?: string;
  rowNumber: number;
  clientName: string;
  phone: string;
  message: string;
};

export type SheetRows = {
  sheetTitle: string;
  values: string[][];
};

export const DEFAULT_TEMPLATE = [
  "Здравствуйте, {имя_клиента}!",
  "Ваш заказ:",
  "{список_заказов}",
  "Итого наличными: {сумма_наличными} ₸",
  "Удаленная оплата: {сумма_удаленно} ₸"
].join("\n");

export function parseCurrency(value: string) {
  const numericMatch = String(value).match(/-?\d[\d\s.,]*/);

  if (!numericMatch) {
    return null;
  }

  const normalized = numericMatch[0]
    .replace(/\s+/g, "")
    .replace(",", ".")
    .trim();

  if (!normalized) {
    return null;
  }

  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : null;
}

export function normalizeKazakhstanPhone(value: string) {
  const digits = String(value).replace(/\D/g, "");

  if (!digits) {
    return null;
  }

  if (digits.length === 10) {
    return `7${digits}`;
  }

  if (digits.length === 11 && digits.startsWith("8")) {
    return `7${digits.slice(1)}`;
  }

  if (digits.length === 11 && digits.startsWith("7")) {
    return digits;
  }

  if (digits.length > 11 && digits.startsWith("7")) {
    return digits;
  }

  return null;
}

export function extractClientName(value: string) {
  const trimmed = String(value).trim();
  const withoutFourDigitPrefix = trimmed.replace(/^\d{4}\s*[-–—:]?\s*/, "").trim();

  if (!withoutFourDigitPrefix && /^\d{4}$/.test(trimmed)) {
    return "";
  }

  return withoutFourDigitPrefix || trimmed;
}

export function formatMoney(value: number) {
  return new Intl.NumberFormat("ru-RU", {
    maximumFractionDigits: 0
  }).format(value).replace(/\u00a0/g, " ");
}

export function formatOrderList(items: OrderItem[], showSheetPrefix = false) {
  return items
    .map((item) => {
      const prefix = showSheetPrefix && item.sheetTitle ? `[${item.sheetTitle}] ` : "";
      return `${prefix}${item.name} — ${item.rawPrice}`;
    })
    .join("\n");
}

export function renderInvoiceMessage(template: string, invoice: Omit<ParsedInvoice, "message">) {
  const clientName = invoice.clientName.trim();
  const greetingName = clientName ? clientName : "";
  const showSheetPrefix = invoice.sheetTitles.length > 1;

  return template
    .replaceAll("{имя_клиента}", greetingName)
    .replaceAll("{список_заказов}", formatOrderList(invoice.items, showSheetPrefix))
    .replaceAll("{итоговая_сумма}", formatMoney(invoice.cashTotal))
    .replaceAll("{сумма_наличными}", formatMoney(invoice.cashTotal))
    .replaceAll("{сумма_удаленно}", formatMoney(invoice.remoteTotal))
    .replace(/^Здравствуйте,\s*!/m, "Здравствуйте!");
}

export function looksLikeHeader(row: string[]) {
  const phone = row[1] ?? "";
  const normalizedPhone = normalizeKazakhstanPhone(phone);
  const joined = row.join(" ").toLowerCase();

  return !normalizedPhone && /(имя|клиент|телефон|номер|товар|цена)/i.test(joined);
}

export function parseSheetRows(values: string[][], template = DEFAULT_TEMPLATE, sheetTitle?: string): ParseResult {
  const dataRows = values.length > 0 && looksLikeHeader(values[0] ?? []) ? values.slice(1) : values;
  const rowOffset = values.length > dataRows.length ? 2 : 1;
  const invoices: ParsedInvoice[] = [];
  const invalidRows: InvalidRow[] = [];

  dataRows.forEach((row, index) => {
    const rowNumber = rowOffset + index;
    const rawName = String(row[0] ?? "").trim();
    const rawPhone = String(row[1] ?? "").trim();
    const id = `row-${rowNumber}`;
    const normalizedPhone = normalizeKazakhstanPhone(rawPhone);

    if (!rawName && !rawPhone && row.every((cell) => !String(cell ?? "").trim())) {
      return;
    }

    if (!normalizedPhone) {
      invalidRows.push({
        id,
        sheetTitle,
        rowNumber,
        rawName,
        rawPhone,
        reason: "Не указан корректный номер телефона"
      });
      return;
    }

    const items: OrderItem[] = [];

    for (let cellIndex = 2; cellIndex < row.length; cellIndex += 2) {
      const name = String(row[cellIndex] ?? "").trim();
      const rawPrice = String(row[cellIndex + 1] ?? "").trim();

      if (!name && !rawPrice) {
        continue;
      }

      if (!name || !rawPrice) {
        invalidRows.push({
          id,
          sheetTitle,
          rowNumber,
          rawName,
          rawPhone,
          reason: "В паре товар/цена отсутствует одно из значений"
        });
        return;
      }

      const price = parseCurrency(rawPrice);

      if (price === null) {
        invalidRows.push({
          id,
          sheetTitle,
          rowNumber,
          rawName,
          rawPhone,
          reason: `Цена "${rawPrice}" не является числом`
        });
        return;
      }

      items.push({ name, price, rawPrice, sheetTitle });
    }

    if (!items.length) {
      invalidRows.push({
        id,
        sheetTitle,
        rowNumber,
        rawName,
        rawPhone,
        reason: "Не найдено ни одного заказа"
      });
      return;
    }

    const cashTotal = items.reduce((sum, item) => sum + item.price, 0);
    const remoteTotal = Math.ceil(cashTotal * 1.05);
    const invoiceWithoutMessage = {
      id,
      rowNumber,
      rawName,
      clientName: extractClientName(rawName),
      rawPhone,
      normalizedPhone,
      chatId: `${normalizedPhone}@c.us`,
      sheetTitles: sheetTitle ? [sheetTitle] : [],
      sourceLabel: sheetTitle ?? "",
      items,
      cashTotal,
      remoteTotal
    };

    invoices.push({
      ...invoiceWithoutMessage,
      message: renderInvoiceMessage(template, invoiceWithoutMessage)
    });
  });

  return { invoices, invalidRows };
}

function mergeSheetTitles(left: string[], right: string[]) {
  return [...new Set([...left, ...right].filter(Boolean))];
}

export function parseWorkbookSheets(sheets: SheetRows[], template = DEFAULT_TEMPLATE): ParseResult {
  const invoicesByPhone = new Map<string, ParsedInvoice>();
  const invalidRows: InvalidRow[] = [];

  for (const sheet of sheets) {
    const parsedSheet = parseSheetRows(sheet.values, template, sheet.sheetTitle);
    invalidRows.push(...parsedSheet.invalidRows);

    for (const invoice of parsedSheet.invoices) {
      const existingInvoice = invoicesByPhone.get(invoice.normalizedPhone);

      if (!existingInvoice) {
        invoicesByPhone.set(invoice.normalizedPhone, invoice);
        continue;
      }

      const sheetTitles = mergeSheetTitles(existingInvoice.sheetTitles, invoice.sheetTitles);
      const items = [...existingInvoice.items, ...invoice.items];
      const cashTotal = items.reduce((sum, item) => sum + item.price, 0);
      const remoteTotal = Math.ceil(cashTotal * 1.05);
      const mergedInvoiceWithoutMessage = {
        ...existingInvoice,
        id: `phone-${existingInvoice.normalizedPhone}`,
        rawName: existingInvoice.rawName || invoice.rawName,
        clientName: existingInvoice.clientName || invoice.clientName,
        rawPhone: existingInvoice.rawPhone || invoice.rawPhone,
        sheetTitles,
        sourceLabel: sheetTitles.join(", "),
        items,
        cashTotal,
        remoteTotal
      };

      invoicesByPhone.set(existingInvoice.normalizedPhone, {
        ...mergedInvoiceWithoutMessage,
        message: renderInvoiceMessage(template, mergedInvoiceWithoutMessage)
      });
    }
  }

  const invoices = [...invoicesByPhone.values()].map((invoice) => {
    const sourceLabel = invoice.sheetTitles.join(", ");
    const invoiceWithoutMessage = {
      ...invoice,
      sourceLabel
    };

    return {
      ...invoiceWithoutMessage,
      message: renderInvoiceMessage(template, invoiceWithoutMessage)
    };
  });

  return { invoices, invalidRows };
}

export function toCsv(rows: Array<Record<string, string | number>>) {
  if (!rows.length) {
    return "";
  }

  const headers = Object.keys(rows[0]);
  const escapeCell = (value: string | number) => {
    const text = String(value ?? "");
    return /[",\n;]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
  };

  return [
    headers.join(";"),
    ...rows.map((row) => headers.map((header) => escapeCell(row[header] ?? "")).join(";"))
  ].join("\n");
}
