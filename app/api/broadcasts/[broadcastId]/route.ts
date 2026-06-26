import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { getBroadcast } from "@/lib/broadcasts";
import { logServerError } from "@/lib/server-log";

type RouteContext = {
  params: Promise<{
    broadcastId: string;
  }>;
};

export async function GET(_request: Request, context: RouteContext) {
  const session = await auth();
  const userEmail = session?.user?.email ?? "";

  if (!session?.accessToken || !userEmail) {
    return NextResponse.json({ error: "Необходим вход через Google" }, { status: 401 });
  }

  try {
    const { broadcastId } = await context.params;
    const broadcast = await getBroadcast(broadcastId, userEmail);

    return NextResponse.json({ broadcast });
  } catch (error) {
    await logServerError({
      endpoint: "GET /api/broadcasts/[broadcastId]",
      error,
      userEmail
    });

    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Не удалось загрузить рассылку"
      },
      { status: 500 }
    );
  }
}
