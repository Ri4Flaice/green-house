"use client";

import { Fragment, type DragEvent, type ReactNode, useEffect, useMemo, useRef, useState } from "react";
import {
  AlertTriangle,
  CheckCircle2,
  Download,
  Eye,
  FileSpreadsheet,
  Search,
  Loader2,
  RefreshCw,
  Send
} from "lucide-react";
import { DEFAULT_TEMPLATE, formatMoney, toCsv, type InvalidRow, type ParsedInvoice } from "@/lib/orders";

type Spreadsheet = {
  id: string;
  name: string;
  modifiedTime?: string;
};

type SpreadsheetSheet = {
  title: string;
  index: number;
};

type PreviewResponse = {
  spreadsheetId: string;
  sheetTitles: string[];
  invoices: ParsedInvoice[];
  invalidRows: InvalidRow[];
  summary: {
    valid: number;
    invalid: number;
  };
  error?: string;
};

type PreviewSnapshot = {
  spreadsheetId: string;
  sheetTitles: string[];
  template: string;
};

type SendResult = {
  invoiceId?: string;
  rowNumber: number;
  clientName: string;
  phone: string;
  status: "success" | "error";
  idMessage?: string;
  error?: string;
};

type RecipientStatus = "PENDING" | "SUCCESS" | "ERROR" | "SKIPPED";

type BroadcastRecipient = {
  id: string;
  invoiceId: string;
  rowNumber: number;
  clientName: string;
  rawName: string;
  phone: string;
  message: string;
  sourceLabel: string;
  sheetTitles: string[];
  itemCount: number;
  cashTotal: number;
  remoteTotal: number;
  status: RecipientStatus;
  idMessage: string;
  error: string;
  sentAt: string | null;
};

type Broadcast = {
  id: string;
  status: "CREATED" | "SENDING" | "COMPLETED" | "FAILED";
  totalCount: number;
  sentCount: number;
  errorCount: number;
  skippedCount: number;
  recipients: BroadcastRecipient[];
};

type CreateBroadcastResponse = {
  broadcast?: Broadcast;
  error?: string;
  databaseConfigured?: boolean;
};

type ReportRow = {
  id: string;
  Листы: string;
  Строка: number;
  Клиент: string;
  Телефон: string;
  Статус: string;
  "ID сообщения": string;
  Ошибка: string;
  Сообщение: string;
};

type LoadState = "idle" | "loading" | "error" | "success";
const PAGE_SIZE = 20;
const TEMPLATE_TOKENS = ["{имя_клиента}", "{список_заказов}", "{сумма_наличными}", "{сумма_удаленно}"];
const TEMPLATE_TOKEN_DRAG_TYPE = "text/flower-order-template-token";
const TEMPLATE_TOKEN_PATTERN = new RegExp(`(${TEMPLATE_TOKENS.map(escapeRegExp).join("|")})`, "g");

export function Dashboard({ userEmail }: { userEmail: string }) {
  const templateInputRef = useRef<HTMLTextAreaElement>(null);
  const [templateScrollTop, setTemplateScrollTop] = useState(0);
  const [spreadsheets, setSpreadsheets] = useState<Spreadsheet[]>([]);
  const [sheetsState, setSheetsState] = useState<LoadState>("idle");
  const [sheetsError, setSheetsError] = useState("");
  const [selectedSheet, setSelectedSheet] = useState<Spreadsheet | null>(null);
  const [spreadsheetSheets, setSpreadsheetSheets] = useState<SpreadsheetSheet[]>([]);
  const [selectedSheetTitles, setSelectedSheetTitles] = useState<string[]>([]);
  const [sheetSelectionState, setSheetSelectionState] = useState<LoadState>("idle");
  const [sheetSelectionError, setSheetSelectionError] = useState("");
  const [template, setTemplate] = useState(DEFAULT_TEMPLATE);
  const [preview, setPreview] = useState<PreviewResponse | null>(null);
  const [previewSnapshot, setPreviewSnapshot] = useState<PreviewSnapshot | null>(null);
  const [previewState, setPreviewState] = useState<LoadState>("idle");
  const [previewError, setPreviewError] = useState("");
  const [sendState, setSendState] = useState<LoadState>("idle");
  const [sendError, setSendError] = useState("");
  const [sendResults, setSendResults] = useState<SendResult[]>([]);
  const [sentCount, setSentCount] = useState(0);
  const [previewSearch, setPreviewSearch] = useState("");
  const [expandedInvoices, setExpandedInvoices] = useState<string[]>([]);
  const [reportSearch, setReportSearch] = useState("");
  const [expandedReportRows, setExpandedReportRows] = useState<string[]>([]);
  const [previewPage, setPreviewPage] = useState(1);
  const [reportPage, setReportPage] = useState(1);
  const [activeBroadcastId, setActiveBroadcastId] = useState("");
  const [broadcastReport, setBroadcastReport] = useState<Broadcast | null>(null);
  const [sendModalOpen, setSendModalOpen] = useState(false);
  const [sendModalText, setSendModalText] = useState("");

  useEffect(() => {
    void loadSpreadsheets();
  }, []);

  const reportRows = useMemo<ReportRow[]>(() => {
    if (broadcastReport) {
      return broadcastReport.recipients.map((recipient) => ({
        id: recipient.id,
        Листы: recipient.sourceLabel,
        Строка: recipient.rowNumber,
        Клиент: recipient.clientName || recipient.rawName,
        Телефон: recipient.phone,
        Статус: getRecipientStatusLabel(recipient.status),
        "ID сообщения": recipient.idMessage,
        Ошибка: recipient.error,
        Сообщение: recipient.message
      }));
    }

    const invoicesByPhone = new Map((preview?.invoices ?? []).map((invoice) => [invoice.normalizedPhone, invoice]));
    const successRows = sendResults.map((result) => ({
      id: `sent-${result.rowNumber}-${result.phone}`,
      Листы: invoicesByPhone.get(result.phone)?.sourceLabel ?? "",
      Строка: result.rowNumber,
      Клиент: result.clientName,
      Телефон: result.phone,
      Статус: result.status === "success" ? "Отправлено" : "Ошибка",
      "ID сообщения": result.idMessage || "",
      Ошибка: result.error || "",
      Сообщение: invoicesByPhone.get(result.phone)?.message ?? ""
    }));

    const invalidRows = (preview?.invalidRows ?? []).map((row) => ({
      id: `invalid-${row.sheetTitle ?? "sheet"}-${row.rowNumber}`,
      Листы: row.sheetTitle ?? "",
      Строка: row.rowNumber,
      Клиент: row.rawName,
      Телефон: row.rawPhone,
      Статус: "Пропущено",
      "ID сообщения": "",
      Ошибка: row.reason,
      Сообщение: ""
    }));

    return [...successRows, ...invalidRows];
  }, [broadcastReport, preview?.invalidRows, preview?.invoices, sendResults]);

  const filteredInvoices = useMemo(() => {
    const query = previewSearch.trim().toLowerCase();

    if (!query) {
      return preview?.invoices ?? [];
    }

    return (preview?.invoices ?? []).filter((invoice) => {
      const searchableText = [
        invoice.clientName,
        invoice.rawName,
        invoice.rawPhone,
        invoice.normalizedPhone,
        invoice.sourceLabel,
        invoice.items.map((item) => `${item.name} ${item.rawPrice}`).join(" ")
      ]
        .join(" ")
        .toLowerCase();

      return searchableText.includes(query);
    });
  }, [preview?.invoices, previewSearch]);

  const filteredReportRows = useMemo(() => {
    const query = reportSearch.trim().toLowerCase();

    if (!query) {
      return reportRows;
    }

    return reportRows.filter((row) =>
      Object.values(row)
        .join(" ")
        .toLowerCase()
        .includes(query)
    );
  }, [reportRows, reportSearch]);

  const previewTotalPages = Math.max(1, Math.ceil(filteredInvoices.length / PAGE_SIZE));
  const reportTotalPages = Math.max(1, Math.ceil(filteredReportRows.length / PAGE_SIZE));
  const currentPreviewPage = Math.min(previewPage, previewTotalPages);
  const currentReportPage = Math.min(reportPage, reportTotalPages);
  const paginatedInvoices = filteredInvoices.slice((currentPreviewPage - 1) * PAGE_SIZE, currentPreviewPage * PAGE_SIZE);
  const paginatedReportRows = filteredReportRows.slice((currentReportPage - 1) * PAGE_SIZE, currentReportPage * PAGE_SIZE);
  const isPreviewStale = Boolean(
    preview &&
      (!previewSnapshot ||
        !selectedSheet ||
        previewSnapshot.spreadsheetId !== selectedSheet.id ||
        previewSnapshot.template !== template ||
        !areStringArraysEqual(previewSnapshot.sheetTitles, selectedSheetTitles))
  );

  async function loadSpreadsheets() {
    setSheetsState("loading");
    setSheetsError("");

    try {
      const response = await fetch("/api/spreadsheets", { cache: "no-store" });
      const data = (await response.json()) as { spreadsheets?: Spreadsheet[]; error?: string };

      if (!response.ok) {
        throw new Error(data.error ?? "Не удалось загрузить таблицы");
      }

      setSpreadsheets(data.spreadsheets ?? []);
      setSheetsState("success");
    } catch (error) {
      setSheetsState("error");
      setSheetsError(error instanceof Error ? error.message : "Неизвестная ошибка");
    }
  }

  async function selectSpreadsheet(sheet: Spreadsheet) {
    setSelectedSheet(sheet);
    setSpreadsheetSheets([]);
    setSelectedSheetTitles([]);
    setPreview(null);
    setPreviewSnapshot(null);
    setSendResults([]);
    setSentCount(0);
    setExpandedInvoices([]);
    setExpandedReportRows([]);
    setPreviewPage(1);
    setReportPage(1);
    setActiveBroadcastId("");
    setBroadcastReport(null);
    setSendModalOpen(false);
    setSendModalText("");
    setSendState("idle");
    setSheetSelectionState("loading");
    setSheetSelectionError("");

    try {
      const response = await fetch(`/api/spreadsheets/${encodeURIComponent(sheet.id)}/sheets`, {
        cache: "no-store"
      });
      const data = (await response.json()) as { sheets?: SpreadsheetSheet[]; error?: string };

      if (!response.ok) {
        throw new Error(data.error ?? "Не удалось загрузить листы таблицы");
      }

      const loadedSheets = data.sheets ?? [];
      const defaultSelection = loadedSheets[0]?.title ? [loadedSheets[0].title] : [];

      setSpreadsheetSheets(loadedSheets);
      setSelectedSheetTitles(defaultSelection);
      setSheetSelectionState("success");

      if (defaultSelection.length) {
        await buildPreview(sheet, defaultSelection);
      }
    } catch (error) {
      setSheetSelectionState("error");
      setSheetSelectionError(error instanceof Error ? error.message : "Неизвестная ошибка");
    }
  }

  async function buildPreview(sheet = selectedSheet, sheetTitles = selectedSheetTitles) {
    if (!sheet) {
      return;
    }

    if (!sheetTitles.length) {
      setPreviewState("error");
      setPreviewError("Выберите хотя бы один лист таблицы");
      return;
    }

    setSelectedSheet(sheet);
    setPreviewState("loading");
    setPreviewError("");
    setPreview(null);
    setPreviewSnapshot(null);
    setSendResults([]);
    setSentCount(0);
    setExpandedInvoices([]);
    setExpandedReportRows([]);
    setPreviewPage(1);
    setReportPage(1);
    setActiveBroadcastId("");
    setBroadcastReport(null);
    setSendModalOpen(false);
    setSendModalText("");
    setSendState("idle");
    const templateForPreview = template;

    try {
      const response = await fetch(`/api/spreadsheets/${encodeURIComponent(sheet.id)}/preview`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({ sheetTitles, template: templateForPreview })
      });
      const data = (await response.json()) as PreviewResponse;

      if (!response.ok) {
        throw new Error(data.error ?? "Не удалось подготовить предпросмотр");
      }

      setPreview(data);
      setPreviewSnapshot({
        spreadsheetId: sheet.id,
        sheetTitles: [...sheetTitles],
        template: templateForPreview
      });
      setPreviewState("success");
    } catch (error) {
      setPreviewState("error");
      setPreviewError(error instanceof Error ? error.message : "Неизвестная ошибка");
    }
  }

  async function fetchBroadcastReport(broadcastId: string) {
    const response = await fetch(`/api/broadcasts/${encodeURIComponent(broadcastId)}`, {
      cache: "no-store"
    });
    const data = (await response.json()) as { broadcast?: Broadcast; error?: string };

    if (!response.ok || !data.broadcast) {
      throw new Error(data.error ?? "Не удалось загрузить отчет рассылки");
    }

    setBroadcastReport(data.broadcast);
    return data.broadcast;
  }

  async function sendInvoices() {
    if (!preview?.invoices.length || !selectedSheet) {
      return;
    }

    if (isPreviewStale) {
      setSendState("error");
      setSendError("Шаблон или листы изменились. Обновите предпросмотр перед рассылкой.");
      return;
    }

    setSendState("loading");
    setSendError("");
    setSendResults([]);
    setSentCount(0);
    setExpandedReportRows([]);
    setReportPage(1);
    setActiveBroadcastId("");
    setBroadcastReport(null);
    setSendModalOpen(true);
    setSendModalText("Создаем журнал рассылки...");

    const batchSize = 1;
    const allResults: SendResult[] = [];
    let broadcastId = "";
    let shouldUseDatabaseReport = true;

    try {
      const createResponse = await fetch("/api/broadcasts", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          spreadsheetId: selectedSheet.id,
          spreadsheetName: selectedSheet.name,
          sheetTitles: preview.sheetTitles,
          invoices: preview.invoices,
          invalidRows: preview.invalidRows
        })
      });
      const createData = (await createResponse.json()) as CreateBroadcastResponse;

      if (!createResponse.ok && createData.databaseConfigured === false) {
        shouldUseDatabaseReport = false;
        setSendModalText("База данных не настроена. Отправляем без сохранения журнала...");
      } else if (!createResponse.ok || !createData.broadcast) {
        throw new Error(createData.error ?? "Не удалось создать журнал рассылки");
      }

      if (createData.broadcast) {
        broadcastId = createData.broadcast.id;
        setActiveBroadcastId(broadcastId);
        setBroadcastReport(createData.broadcast);
      }

      setSendModalText(`Отправляем сообщение 1 из ${preview.invoices.length}`);

      for (let start = 0; start < preview.invoices.length; start += batchSize) {
        const batch = preview.invoices.slice(start, start + batchSize).map((invoice) => ({
          invoiceId: invoice.id,
          rowNumber: invoice.rowNumber,
          clientName: invoice.clientName,
          phone: invoice.normalizedPhone,
          message: invoice.message
        }));

        const response = await fetch("/api/send-batch", {
          method: "POST",
          headers: {
            "Content-Type": "application/json"
          },
          body: JSON.stringify({ broadcastId, items: batch })
        });
        const data = (await response.json()) as { results?: SendResult[]; error?: string };

        if (!response.ok) {
          throw new Error(data.error ?? "Не удалось отправить батч сообщений");
        }

        allResults.push(...(data.results ?? []));
        setSendResults([...allResults]);
        setSentCount(Math.min(start + batch.length, preview.invoices.length));
        setSendModalText(
          start + batch.length >= preview.invoices.length
            ? "Получаем финальный отчет..."
            : `Отправляем сообщение ${start + batch.length + 1} из ${preview.invoices.length}`
        );
      }

      if (shouldUseDatabaseReport && broadcastId) {
        await fetchBroadcastReport(broadcastId);
      }

      setSendModalText("Рассылка завершена");
      setSendState("success");
    } catch (error) {
      setSendState("error");
      setSendError(error instanceof Error ? error.message : "Неизвестная ошибка отправки");
      setSendModalText("Рассылка остановлена из-за ошибки");

      if (broadcastId) {
        try {
          await fetchBroadcastReport(broadcastId);
        } catch {
          // The visible send error is more useful than a secondary report-loading error.
        }
      }
    }
  }

  function downloadReport() {
    const csv = toCsv(
      reportRows.map((row) => ({
        Листы: row.Листы,
        Строка: row.Строка,
        Клиент: row.Клиент,
        Телефон: row.Телефон,
        Статус: row.Статус,
        "ID сообщения": row["ID сообщения"],
        Ошибка: row.Ошибка
      }))
    );
    const blob = new Blob([`\uFEFF${csv}`], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `flower-orders-report-${new Date().toISOString().slice(0, 10)}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  }

  function toggleExpandedInvoice(invoiceId: string) {
    setExpandedInvoices((currentIds) =>
      currentIds.includes(invoiceId)
        ? currentIds.filter((id) => id !== invoiceId)
        : [...currentIds, invoiceId]
    );
  }

  function toggleExpandedReportRow(rowId: string) {
    setExpandedReportRows((currentIds) =>
      currentIds.includes(rowId)
        ? currentIds.filter((id) => id !== rowId)
        : [...currentIds, rowId]
    );
  }

  function updatePreviewSearch(value: string) {
    setPreviewSearch(value);
    setPreviewPage(1);
  }

  function updateReportSearch(value: string) {
    setReportSearch(value);
    setReportPage(1);
  }

  function insertTemplateToken(token: string) {
    const input = templateInputRef.current;

    if (!input) {
      setTemplate((currentTemplate) => `${currentTemplate}${token}`);
      return;
    }

    const selectionStart = input.selectionStart ?? template.length;
    const selectionEnd = input.selectionEnd ?? selectionStart;
    const nextTemplate = `${template.slice(0, selectionStart)}${token}${template.slice(selectionEnd)}`;
    const nextCursorPosition = selectionStart + token.length;

    setTemplate(nextTemplate);

    window.requestAnimationFrame(() => {
      input.focus();
      input.setSelectionRange(nextCursorPosition, nextCursorPosition);
    });
  }

  function handleTemplateTokenDragStart(event: DragEvent<HTMLButtonElement>, token: string) {
    event.dataTransfer.effectAllowed = "copy";
    event.dataTransfer.setData(TEMPLATE_TOKEN_DRAG_TYPE, token);
    event.dataTransfer.setData("text/plain", token);
  }

  function handleTemplateDrop(event: DragEvent<HTMLTextAreaElement>) {
    const token =
      event.dataTransfer.getData(TEMPLATE_TOKEN_DRAG_TYPE) ||
      event.dataTransfer.getData("text/plain");

    if (!TEMPLATE_TOKENS.includes(token)) {
      return;
    }

    event.preventDefault();
    insertTemplateToken(token);
  }

  if (!selectedSheet) {
    return (
      <article className="panel sheets-panel">
        <div className="panel-heading">
          <div>
            <h1>Ваши таблицы Google Sheets</h1>
            <p>{userEmail}</p>
          </div>
          <button className="icon-button" type="button" onClick={loadSpreadsheets} title="Обновить список">
            {sheetsState === "loading" ? <Loader2 className="spin" size={18} /> : <RefreshCw size={18} />}
          </button>
        </div>

        {sheetsState === "loading" ? <StatusLine icon={<Loader2 className="spin" size={18} />} text="Загружаем таблицы..." /> : null}
        {sheetsState === "error" ? <StatusLine icon={<AlertTriangle size={18} />} text={sheetsError} tone="error" /> : null}
        {sheetsState === "success" && spreadsheets.length === 0 ? (
          <StatusLine icon={<FileSpreadsheet size={18} />} text="Таблицы не найдены. Проверьте доступ Google Drive." />
        ) : null}

        <div className="sheet-list">
          {spreadsheets.map((sheet) => (
            <div className="sheet-row" key={sheet.id}>
              <div className="sheet-name">
                <FileSpreadsheet size={18} />
                <span>{sheet.name}</span>
              </div>
              <button className="primary-button compact" type="button" onClick={() => void selectSpreadsheet(sheet)}>
                Выбрать
              </button>
            </div>
          ))}
        </div>
      </article>
    );
  }

  const successCount = reportRows.filter((row) => row.Статус === "Отправлено").length;
  const errorCount = reportRows.filter((row) => row.Статус === "Ошибка").length;
  const skippedCount = reportRows.filter((row) => row.Статус === "Пропущено").length;
  const sendTotal = preview?.invoices.length ?? 0;
  const progressPercent = sendTotal > 0 ? Math.min(100, Math.round((sentCount / sendTotal) * 100)) : 0;

  return (
    <article className="panel work-panel">
      <div className="panel-heading">
        <div>
          <h1>Выбрана таблица</h1>
          <p>{selectedSheet.name}</p>
          <p>Google Sheet ID: {selectedSheet.id}</p>
          {preview?.sheetTitles?.length ? <p>Листы: {preview.sheetTitles.join(", ")}</p> : null}
        </div>
        <button className="secondary-button" type="button" onClick={() => {
          setSelectedSheet(null);
          setPreview(null);
          setSpreadsheetSheets([]);
          setSelectedSheetTitles([]);
          setPreviewSearch("");
          setReportSearch("");
          setPreviewPage(1);
          setReportPage(1);
          setActiveBroadcastId("");
          setBroadcastReport(null);
          setSendModalOpen(false);
          setSendModalText("");
          setSendState("idle");
        }}>
          К списку
        </button>
      </div>

      <section className="sheet-picker" aria-label="Листы таблицы">
        <div className="subheading-row">
          <h2>Листы таблицы</h2>
          <div className="mini-actions">
            <button
              className="text-button"
              type="button"
              onClick={() => setSelectedSheetTitles(spreadsheetSheets.map((sheet) => sheet.title))}
              disabled={!spreadsheetSheets.length}
            >
              Выбрать все
            </button>
            <button
              className="text-button"
              type="button"
              onClick={() => setSelectedSheetTitles([])}
              disabled={!spreadsheetSheets.length}
            >
              Снять все
            </button>
          </div>
        </div>

        {sheetSelectionState === "loading" ? <StatusLine icon={<Loader2 className="spin" size={18} />} text="Загружаем листы..." /> : null}
        {sheetSelectionState === "error" ? <StatusLine icon={<AlertTriangle size={18} />} text={sheetSelectionError} tone="error" /> : null}
        {sheetSelectionState === "success" && spreadsheetSheets.length === 0 ? (
          <StatusLine icon={<FileSpreadsheet size={18} />} text="В таблице нет видимых листов." />
        ) : null}

        <div className="sheet-chip-list">
          {spreadsheetSheets.map((sheet) => {
            const checked = selectedSheetTitles.includes(sheet.title);

            return (
              <label className="sheet-chip" key={sheet.title}>
                <input
                  type="checkbox"
                  checked={checked}
                  onChange={(event) => {
                    setSelectedSheetTitles((currentTitles) =>
                      event.target.checked
                        ? [...currentTitles, sheet.title]
                        : currentTitles.filter((title) => title !== sheet.title)
                    );
                  }}
                />
                <span>{sheet.title}</span>
              </label>
            );
          })}
        </div>
      </section>

      <label className="template-label" htmlFor="template">
        Шаблон сообщения
      </label>
      <div className="tokens" aria-label="Доступные переменные шаблона">
        {TEMPLATE_TOKENS.map((token) => (
          <button
            className="token-button"
            draggable
            key={token}
            title="Нажмите, чтобы вставить в шаблон"
            type="button"
            onClick={() => insertTemplateToken(token)}
            onDragStart={(event) => handleTemplateTokenDragStart(event, token)}
          >
            {token}
          </button>
        ))}
      </div>
      <div className="template-editor">
        <div className="template-highlight-viewport" aria-hidden="true">
          <div
            className="template-highlight-content"
            style={{ transform: `translateY(-${templateScrollTop}px)` }}
          >
            {renderHighlightedTemplate(template)}
          </div>
        </div>
        <textarea
          ref={templateInputRef}
          id="template"
          className="template-input"
          value={template}
          onChange={(event) => setTemplate(event.target.value)}
          onDragOver={(event) => {
            if (event.dataTransfer.types.includes(TEMPLATE_TOKEN_DRAG_TYPE)) {
              event.preventDefault();
              event.dataTransfer.dropEffect = "copy";
            }
          }}
          onDrop={handleTemplateDrop}
          onScroll={(event) => setTemplateScrollTop(event.currentTarget.scrollTop)}
          spellCheck={false}
        />
      </div>

      <div className="action-row">
        <button
          className="secondary-button"
          type="button"
          onClick={() => void buildPreview()}
          disabled={previewState === "loading" || !selectedSheetTitles.length}
        >
          {previewState === "loading" ? <Loader2 className="spin" size={18} /> : <Eye size={18} />}
          Обновить предпросмотр
        </button>
        <button
          className="send-button"
          type="button"
          onClick={() => void sendInvoices()}
          disabled={!preview?.invoices.length || isPreviewStale || sendState === "loading" || sendModalOpen}
        >
          {sendState === "loading" ? <Loader2 className="spin" size={18} /> : <Send size={18} />}
          Начать рассылку
        </button>
      </div>

      {isPreviewStale ? (
        <StatusLine
          icon={<AlertTriangle size={18} />}
          text="Шаблон или листы изменились. Обновите предпросмотр перед рассылкой."
          tone="warning"
        />
      ) : null}
      {previewState === "loading" ? <StatusLine icon={<Loader2 className="spin" size={18} />} text="Готовим счета..." /> : null}
      {previewState === "error" ? <StatusLine icon={<AlertTriangle size={18} />} text={previewError} tone="error" /> : null}

      {preview ? (
        <>
          <div className="metrics">
            <Metric label="Готово к отправке" value={preview.summary.valid} />
            <Metric label="Будет пропущено" value={preview.summary.invalid} />
            <Metric label="Отправлено" value={sentCount} />
          </div>

          <section className="preview-section" aria-label="Предпросмотр счетов">
            <div className="section-header">
              <h2>Предпросмотр</h2>
              <SearchBox
                value={previewSearch}
                onChange={updatePreviewSearch}
                placeholder="Поиск по клиенту, телефону, листу или товару"
              />
            </div>
            <div className="table-shell">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Клиент</th>
                    <th>Телефон</th>
                    <th>Листы</th>
                    <th>Позиций</th>
                    <th>Наличными</th>
                    <th>Удаленно</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {paginatedInvoices.map((invoice) => {
                    const expanded = expandedInvoices.includes(invoice.id);

                    return (
                      <Fragment key={invoice.id}>
                        <tr className="data-row" onClick={() => toggleExpandedInvoice(invoice.id)}>
                          <td data-label="Клиент">{invoice.clientName || invoice.rawName || "Без имени"}</td>
                          <td data-label="Телефон">{invoice.normalizedPhone}</td>
                          <td data-label="Листы">{invoice.sourceLabel || "—"}</td>
                          <td data-label="Позиций">{invoice.items.length}</td>
                          <td data-label="Наличными">{formatMoney(invoice.cashTotal)} ₸</td>
                          <td data-label="Удаленно">{formatMoney(invoice.remoteTotal)} ₸</td>
                          <td data-label="">
                            <button className="text-button" type="button" onClick={(event) => {
                              event.stopPropagation();
                              toggleExpandedInvoice(invoice.id);
                            }}>
                              {expanded ? "Скрыть" : "Открыть"}
                            </button>
                          </td>
                        </tr>
                        {expanded ? (
                          <tr className="details-row">
                            <td colSpan={7}>
                              <div className="row-details">
                                <div className="order-lines">
                                  {invoice.items.map((item, itemIndex) => (
                                    <span key={`${invoice.id}-${itemIndex}`}>
                                      {item.sheetTitle && invoice.sheetTitles.length > 1 ? `[${item.sheetTitle}] ` : ""}
                                      {item.name} — {item.rawPrice}
                                    </span>
                                  ))}
                                </div>
                                <pre>{invoice.message}</pre>
                              </div>
                            </td>
                          </tr>
                        ) : null}
                      </Fragment>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <Pagination
              page={currentPreviewPage}
              totalPages={previewTotalPages}
              totalItems={filteredInvoices.length}
              pageSize={PAGE_SIZE}
              onPageChange={setPreviewPage}
            />
            {!filteredInvoices.length ? <p className="muted">По этому поиску счетов не найдено.</p> : null}
          </section>

          {preview.invalidRows.length ? (
            <section className="preview-section" aria-label="Ошибки строк">
              <h2>Строки с ошибками</h2>
              <div className="invalid-list">
                {preview.invalidRows.slice(0, 8).map((row) => (
                  <div className="invalid-row" key={row.id}>
                    <AlertTriangle size={17} />
                    <span>
                      {row.sheetTitle ? `Лист "${row.sheetTitle}", ` : ""}строка {row.rowNumber}: {row.reason}
                    </span>
                  </div>
                ))}
              </div>
            </section>
          ) : null}
        </>
      ) : null}

      {sendState === "loading" ? <StatusLine icon={<Loader2 className="spin" size={18} />} text={`Отправка: ${sentCount} из ${preview?.invoices.length ?? 0}`} /> : null}
      {sendState === "error" ? <StatusLine icon={<AlertTriangle size={18} />} text={sendError} tone="error" /> : null}
      {(sendState === "success" || (sendState === "error" && reportRows.length > 0)) ? (
        <section className="preview-section" aria-label="Отчет по рассылке">
          <div className="report-box">
            <StatusLine
              icon={sendState === "success" ? <CheckCircle2 size={18} /> : <AlertTriangle size={18} />}
              text={
                sendState === "success"
                  ? `Рассылка завершена: успешно ${successCount}, ошибок ${errorCount}, пропущено ${skippedCount}.`
                  : `Рассылка остановлена: успешно ${successCount}, ошибок ${errorCount}, пропущено ${skippedCount}.`
              }
              tone={sendState === "success" ? "success" : "error"}
            />
            <button className="secondary-button" type="button" onClick={downloadReport} disabled={!reportRows.length}>
              <Download size={18} />
              Скачать CSV отчет
            </button>
          </div>
          <div className="section-header">
            <h2>Отчет</h2>
            <SearchBox
              value={reportSearch}
              onChange={updateReportSearch}
              placeholder="Поиск по статусу, клиенту, телефону или ID"
            />
          </div>
          <div className="table-shell">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Статус</th>
                  <th>Клиент</th>
                  <th>Телефон</th>
                  <th>Листы</th>
                  <th>ID сообщения</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {paginatedReportRows.map((row) => {
                  const expanded = expandedReportRows.includes(row.id);

                  return (
                    <Fragment key={row.id}>
                      <tr className="data-row" onClick={() => toggleExpandedReportRow(row.id)}>
                        <td data-label="Статус">{row.Статус}</td>
                        <td data-label="Клиент">{row.Клиент || "—"}</td>
                        <td data-label="Телефон">{row.Телефон || "—"}</td>
                        <td data-label="Листы">{row.Листы || "—"}</td>
                        <td data-label="ID сообщения">{row["ID сообщения"] || "—"}</td>
                        <td data-label="">
                          <button className="text-button" type="button" onClick={(event) => {
                            event.stopPropagation();
                            toggleExpandedReportRow(row.id);
                          }}>
                            {expanded ? "Скрыть" : "Открыть"}
                          </button>
                        </td>
                      </tr>
                      {expanded ? (
                        <tr className="details-row">
                          <td colSpan={6}>
                            <div className="row-details">
                              <span>Строка: {row.Строка}</span>
                              <span>Ошибка: {row.Ошибка || "—"}</span>
                              <span>ID сообщения: {row["ID сообщения"] || "—"}</span>
                              {row.Сообщение ? <pre>{row.Сообщение}</pre> : null}
                            </div>
                          </td>
                        </tr>
                      ) : null}
                    </Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
          <Pagination
            page={currentReportPage}
            totalPages={reportTotalPages}
            totalItems={filteredReportRows.length}
            pageSize={PAGE_SIZE}
            onPageChange={setReportPage}
          />
          {!filteredReportRows.length ? <p className="muted">По этому поиску записей отчета не найдено.</p> : null}
        </section>
      ) : null}
      {sendModalOpen ? (
        <BroadcastProgressModal
          state={sendState}
          sentCount={sentCount}
          totalCount={sendTotal}
          successCount={successCount}
          errorCount={errorCount}
          skippedCount={skippedCount}
          progressPercent={progressPercent}
          message={sendModalText}
          broadcastId={activeBroadcastId}
          onClose={() => {
            if (sendState !== "loading") {
              setSendModalOpen(false);
            }
          }}
          onDownload={downloadReport}
          hasReport={reportRows.length > 0}
        />
      ) : null}
    </article>
  );
}

function getRecipientStatusLabel(status: RecipientStatus) {
  const labels: Record<RecipientStatus, string> = {
    PENDING: "В очереди",
    SUCCESS: "Отправлено",
    ERROR: "Ошибка",
    SKIPPED: "Пропущено"
  };

  return labels[status];
}

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function areStringArraysEqual(left: string[], right: string[]) {
  return left.length === right.length && left.every((value, index) => value === right[index]);
}

function renderHighlightedTemplate(value: string) {
  return value.split(TEMPLATE_TOKEN_PATTERN).map((part, index) =>
    TEMPLATE_TOKENS.includes(part) ? (
      <span className="template-highlight-token" key={`${part}-${index}`}>
        {part}
      </span>
    ) : (
      <span key={`${part}-${index}`}>{part}</span>
    )
  );
}

function BroadcastProgressModal({
  state,
  sentCount,
  totalCount,
  successCount,
  errorCount,
  skippedCount,
  progressPercent,
  message,
  broadcastId,
  onClose,
  onDownload,
  hasReport
}: {
  state: LoadState;
  sentCount: number;
  totalCount: number;
  successCount: number;
  errorCount: number;
  skippedCount: number;
  progressPercent: number;
  message: string;
  broadcastId: string;
  onClose: () => void;
  onDownload: () => void;
  hasReport: boolean;
}) {
  const isSending = state === "loading";
  const isSuccess = state === "success";
  const isError = state === "error";

  return (
    <div className="modal-backdrop" role="presentation">
      <div className="send-modal" role="dialog" aria-modal="true" aria-labelledby="send-modal-title">
        <div className="send-modal-header">
          <div>
            <h2 id="send-modal-title">
              {isSuccess ? "Рассылка завершена" : isError ? "Рассылка остановлена" : "Идет рассылка"}
            </h2>
            {broadcastId ? <p>Журнал: {broadcastId}</p> : null}
          </div>
          <button className="secondary-button" type="button" onClick={onClose} disabled={isSending}>
            Закрыть
          </button>
        </div>

        <div className="modal-status">
          {isSuccess ? <CheckCircle2 size={26} /> : isError ? <AlertTriangle size={26} /> : <Loader2 className="spin" size={26} />}
          <span>{message || "Подготавливаем рассылку..."}</span>
        </div>

        <div className="progress-block" aria-label="Прогресс рассылки">
          <div className="progress-meta">
            <span>
              {sentCount} из {totalCount}
            </span>
            <strong>{progressPercent}%</strong>
          </div>
          <div className="progress-track">
            <div className="progress-fill" style={{ width: `${progressPercent}%` }} />
          </div>
        </div>

        {isSending ? (
          <p className="modal-warning">
            Не закрывайте и не перезагружайте страницу до завершения рассылки. Иначе новые сообщения не будут отправлены,
            но уже обработанные результаты останутся в журнале.
          </p>
        ) : null}

        {!isSending ? (
          <div className="modal-summary">
            <Metric label="Отправлено" value={successCount} />
            <Metric label="Ошибок" value={errorCount} />
            <Metric label="Пропущено" value={skippedCount} />
          </div>
        ) : null}

        {!isSending ? (
          <div className="modal-actions">
            <button className="secondary-button" type="button" onClick={onDownload} disabled={!hasReport}>
              <Download size={18} />
              Скачать CSV отчет
            </button>
            <button className="primary-button" type="button" onClick={onClose}>
              Готово
            </button>
          </div>
        ) : null}
      </div>
    </div>
  );
}

function StatusLine({
  icon,
  text,
  tone = "default"
}: {
  icon: ReactNode;
  text: string;
  tone?: "default" | "error" | "success" | "warning";
}) {
  return (
    <div className={`status-line ${tone}`}>
      {icon}
      <span>{text}</span>
    </div>
  );
}

function Pagination({
  page,
  totalPages,
  totalItems,
  pageSize,
  onPageChange
}: {
  page: number;
  totalPages: number;
  totalItems: number;
  pageSize: number;
  onPageChange: (page: number) => void;
}) {
  if (totalItems <= pageSize) {
    return null;
  }

  const startItem = (page - 1) * pageSize + 1;
  const endItem = Math.min(page * pageSize, totalItems);

  return (
    <div className="pagination">
      <span>
        {startItem}-{endItem} из {totalItems}
      </span>
      <div className="pagination-actions">
        <button className="secondary-button" type="button" onClick={() => onPageChange(page - 1)} disabled={page <= 1}>
          Назад
        </button>
        <span>
          {page} / {totalPages}
        </span>
        <button className="secondary-button" type="button" onClick={() => onPageChange(page + 1)} disabled={page >= totalPages}>
          Далее
        </button>
      </div>
    </div>
  );
}

function SearchBox({
  value,
  onChange,
  placeholder
}: {
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
}) {
  return (
    <label className="search-box">
      <Search size={17} />
      <input value={value} onChange={(event) => onChange(event.target.value)} placeholder={placeholder} />
    </label>
  );
}

function Metric({ label, value }: { label: string; value: number }) {
  return (
    <div className="metric">
      <strong>{value}</strong>
      <span>{label}</span>
    </div>
  );
}
