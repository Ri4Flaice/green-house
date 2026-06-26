import { describe, expect, it } from "vitest";
import {
  DEFAULT_TEMPLATE,
  normalizeKazakhstanPhone,
  parseCurrency,
  parseWorkbookSheets,
  parseSheetRows,
  renderInvoiceMessage
} from "../lib/orders";

describe("orders parsing", () => {
  it("normalizes Kazakhstan phone numbers", () => {
    expect(normalizeKazakhstanPhone("+7 701 123 45 67")).toBe("77011234567");
    expect(normalizeKazakhstanPhone("87011234567")).toBe("77011234567");
    expect(normalizeKazakhstanPhone("7011234567")).toBe("77011234567");
  });

  it("parses prices with spaces, comma and currency symbols", () => {
    expect(parseCurrency("1 500 ₸")).toBe(1500);
    expect(parseCurrency("2500 тг")).toBe(2500);
    expect(parseCurrency("1500 тенге")).toBe(1500);
    expect(parseCurrency("12,5")).toBe(12.5);
    expect(parseCurrency("abc")).toBeNull();
  });

  it("builds invoices and skips invalid rows", () => {
    const result = parseSheetRows([
      ["Имя", "Телефон", "Товар 1", "Цена 1", "Товар 2", "Цена 2"],
      ["1234 Иван", "+77011234567", "Роза", "1500 тенге", "Лилия", "2000"],
      ["Анна", "", "Кактус", "2500"]
    ]);

    expect(result.invoices).toHaveLength(1);
    expect(result.invalidRows).toHaveLength(1);
    expect(result.invoices[0].clientName).toBe("Иван");
    expect(result.invoices[0].cashTotal).toBe(3500);
    expect(result.invoices[0].remoteTotal).toBe(3675);
    expect(result.invoices[0].message).toContain("Роза — 1500 тенге");
  });

  it("renders default placeholders", () => {
    const result = parseSheetRows([
      ["Иван", "+77011234567", "Фикус", "3500"]
    ]);

    expect(renderInvoiceMessage(DEFAULT_TEMPLATE, result.invoices[0])).toContain("Удаленная оплата: 3 675 ₸");
  });

  it("merges duplicate clients across selected sheets by phone", () => {
    const result = parseWorkbookSheets([
      {
        sheetTitle: "Лист 1",
        values: [
          ["Имя", "Телефон", "Товар 1", "Цена 1"],
          ["1234 Иван", "+77011234567", "Роза", "1500"]
        ]
      },
      {
        sheetTitle: "Лист 2",
        values: [
          ["Имя", "Телефон", "Товар 1", "Цена 1"],
          ["Иван", "87011234567", "Лилия", "2000"]
        ]
      }
    ]);

    expect(result.invoices).toHaveLength(1);
    expect(result.invoices[0].sheetTitles).toEqual(["Лист 1", "Лист 2"]);
    expect(result.invoices[0].sourceLabel).toBe("Лист 1, Лист 2");
    expect(result.invoices[0].cashTotal).toBe(3500);
    expect(result.invoices[0].remoteTotal).toBe(3675);
    expect(result.invoices[0].message).toContain("[Лист 1] Роза — 1500");
    expect(result.invoices[0].message).toContain("[Лист 2] Лилия — 2000");
  });

  it("does not use four digit nicknames as client names", () => {
    const result = parseSheetRows([
      ["1234", "+77011234567", "Фикус", "3500"]
    ]);

    expect(result.invoices[0].clientName).toBe("");
    expect(result.invoices[0].message).toContain("Здравствуйте!");
    expect(result.invoices[0].message).not.toContain("Здравствуйте, 1234!");
  });

  it("does not merge rows with the same phone inside one selected sheet", () => {
    const result = parseWorkbookSheets([
      {
        sheetTitle: "Тест",
        values: [
          ["Имя", "Телефон", "Товар 1", "Цена 1"],
          ["Иван", "+77011234567", "Роза", "1500"],
          ["Анна", "+77011234567", "Кактус", "2500"]
        ]
      }
    ]);

    expect(result.invoices).toHaveLength(2);
    expect(result.invoices[0].clientName).toBe("Иван");
    expect(result.invoices[1].clientName).toBe("Анна");
  });

  it("keeps invalid row sheet titles", () => {
    const result = parseWorkbookSheets([
      {
        sheetTitle: "Ошибки",
        values: [
          ["Имя", "Телефон", "Товар 1", "Цена 1"],
          ["Анна", "+77011234567", "Кактус", "abc"]
        ]
      }
    ]);

    expect(result.invalidRows).toHaveLength(1);
    expect(result.invalidRows[0].sheetTitle).toBe("Ошибки");
    expect(result.invalidRows[0].rowNumber).toBe(2);
  });
});
