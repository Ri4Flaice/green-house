import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { getAccessToken, readSelectedSheetValues } from "@/lib/google";
import { DEFAULT_TEMPLATE, parseWorkbookSheets } from "@/lib/orders";
import { logServerError } from "@/lib/server-log";

type RouteContext = {
  params: Promise<{
    spreadsheetId: string;
  }>;
};

export async function POST(request: Request, context: RouteContext) {
  const session = await auth();

  try {
    const { spreadsheetId } = await context.params;
    const { sheetTitles, template } = (await request.json().catch(() => ({}))) as {
      sheetTitles?: string[];
      template?: string;
    };

    if (!Array.isArray(sheetTitles) || sheetTitles.length === 0) {
      return NextResponse.json({ error: "Выберите хотя бы один лист таблицы" }, { status: 400 });
    }

    const accessToken = await getAccessToken();
    const sheets = await readSelectedSheetValues(spreadsheetId, sheetTitles, accessToken);
    const result = parseWorkbookSheets(sheets, template?.trim() || DEFAULT_TEMPLATE);

    return NextResponse.json({
      spreadsheetId,
      sheetTitles: sheets.map((sheet) => sheet.sheetTitle),
      ...result,
      summary: {
        valid: result.invoices.length,
        invalid: result.invalidRows.length
      }
    });
  } catch (error) {
    await logServerError({
      endpoint: "POST /api/spreadsheets/[spreadsheetId]/preview",
      error,
      userEmail: session?.user?.email
    });

    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Не удалось подготовить предпросмотр"
      },
      { status: 500 }
    );
  }
}
