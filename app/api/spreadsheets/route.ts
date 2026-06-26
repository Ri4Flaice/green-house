import { NextResponse } from "next/server";
import { getAccessToken, listSpreadsheets } from "@/lib/google";

export async function GET() {
  try {
    const accessToken = await getAccessToken();
    const spreadsheets = await listSpreadsheets(accessToken);

    return NextResponse.json({ spreadsheets });
  } catch (error) {
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Не удалось загрузить таблицы"
      },
      { status: 500 }
    );
  }
}
