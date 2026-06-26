import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { getAccessToken, listSpreadsheetSheets } from "@/lib/google";
import { logServerError } from "@/lib/server-log";

type RouteContext = {
  params: Promise<{
    spreadsheetId: string;
  }>;
};

export async function GET(_request: Request, context: RouteContext) {
  const session = await auth();

  try {
    const { spreadsheetId } = await context.params;
    const accessToken = await getAccessToken();
    const sheets = await listSpreadsheetSheets(spreadsheetId, accessToken);

    return NextResponse.json({ sheets });
  } catch (error) {
    await logServerError({
      endpoint: "GET /api/spreadsheets/[spreadsheetId]/sheets",
      error,
      userEmail: session?.user?.email
    });

    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Не удалось загрузить листы таблицы"
      },
      { status: 500 }
    );
  }
}
