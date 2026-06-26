import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { getAccessToken, listSpreadsheets } from "@/lib/google";
import { logServerError } from "@/lib/server-log";

export async function GET() {
  const session = await auth();

  try {
    const accessToken = await getAccessToken();
    const spreadsheets = await listSpreadsheets(accessToken);

    return NextResponse.json({ spreadsheets });
  } catch (error) {
    await logServerError({
      endpoint: "GET /api/spreadsheets",
      error,
      userEmail: session?.user?.email
    });

    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Не удалось загрузить таблицы"
      },
      { status: 500 }
    );
  }
}
