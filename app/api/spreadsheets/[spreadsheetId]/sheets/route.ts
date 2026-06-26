import { NextResponse } from "next/server";
import { getAccessToken, listSpreadsheetSheets } from "@/lib/google";

type RouteContext = {
  params: Promise<{
    spreadsheetId: string;
  }>;
};

export async function GET(_request: Request, context: RouteContext) {
  try {
    const { spreadsheetId } = await context.params;
    const accessToken = await getAccessToken();
    const sheets = await listSpreadsheetSheets(spreadsheetId, accessToken);

    return NextResponse.json({ sheets });
  } catch (error) {
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Не удалось загрузить листы таблицы"
      },
      { status: 500 }
    );
  }
}
