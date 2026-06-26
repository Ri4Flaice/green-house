import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { createBroadcast } from "@/lib/broadcasts";
import { isDatabaseConfigured } from "@/lib/prisma";
import { logServerError } from "@/lib/server-log";
import type { InvalidRow, ParsedInvoice } from "@/lib/orders";

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((item) => typeof item === "string");
}

function isInvoice(value: unknown): value is ParsedInvoice {
  const invoice = value as ParsedInvoice;

  return (
    typeof invoice?.id === "string" &&
    typeof invoice.rowNumber === "number" &&
    typeof invoice.rawName === "string" &&
    typeof invoice.clientName === "string" &&
    typeof invoice.rawPhone === "string" &&
    typeof invoice.normalizedPhone === "string" &&
    Array.isArray(invoice.items) &&
    typeof invoice.cashTotal === "number" &&
    typeof invoice.remoteTotal === "number" &&
    typeof invoice.message === "string"
  );
}

function isInvalidRow(value: unknown): value is InvalidRow {
  const row = value as InvalidRow;

  return (
    typeof row?.id === "string" &&
    typeof row.rowNumber === "number" &&
    typeof row.rawName === "string" &&
    typeof row.rawPhone === "string" &&
    typeof row.reason === "string"
  );
}

export async function POST(request: Request) {
  const session = await auth();
  const userEmail = session?.user?.email ?? "";

  if (!session?.accessToken || !userEmail) {
    return NextResponse.json({ error: "Необходим вход через Google" }, { status: 401 });
  }

  try {
    if (!isDatabaseConfigured()) {
      return NextResponse.json(
        {
          error: "DATABASE_URL is not configured",
          databaseConfigured: false
        },
        { status: 503 }
      );
    }

    const body = (await request.json().catch(() => ({}))) as {
      spreadsheetId?: unknown;
      spreadsheetName?: unknown;
      sheetTitles?: unknown;
      invoices?: unknown;
      invalidRows?: unknown;
    };

    if (typeof body.spreadsheetId !== "string" || !body.spreadsheetId.trim()) {
      return NextResponse.json({ error: "Не указан ID таблицы" }, { status: 400 });
    }

    if (typeof body.spreadsheetName !== "string" || !body.spreadsheetName.trim()) {
      return NextResponse.json({ error: "Не указано название таблицы" }, { status: 400 });
    }

    if (!isStringArray(body.sheetTitles)) {
      return NextResponse.json({ error: "Некорректный список листов" }, { status: 400 });
    }

    const invoices = Array.isArray(body.invoices) ? body.invoices : [];
    const invalidRows = Array.isArray(body.invalidRows) ? body.invalidRows : [];

    if (!invoices.every(isInvoice) || !invalidRows.every(isInvalidRow)) {
      return NextResponse.json({ error: "Некорректный формат предпросмотра" }, { status: 400 });
    }

    const broadcast = await createBroadcast({
      userEmail,
      spreadsheetId: body.spreadsheetId,
      spreadsheetName: body.spreadsheetName,
      sheetTitles: body.sheetTitles,
      invoices,
      invalidRows
    });

    return NextResponse.json({ broadcast });
  } catch (error) {
    await logServerError({
      endpoint: "POST /api/broadcasts",
      error,
      userEmail
    });

    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Не удалось создать рассылку"
      },
      { status: 500 }
    );
  }
}
