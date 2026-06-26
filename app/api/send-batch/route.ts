import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { getPositiveIntegerEnv } from "@/lib/env";
import { normalizeKazakhstanPhone, type SendItem } from "@/lib/orders";
import { sendWhatsAppBatch } from "@/lib/green-api";
import { applySendResultsToBroadcast } from "@/lib/broadcasts";
import { logServerError } from "@/lib/server-log";

function isSendItem(value: unknown): value is SendItem {
  const item = value as SendItem;

  return (
    typeof item?.rowNumber === "number" &&
    (typeof item.invoiceId === "undefined" || typeof item.invoiceId === "string") &&
    typeof item.clientName === "string" &&
    typeof item.phone === "string" &&
    typeof item.message === "string" &&
    Boolean(normalizeKazakhstanPhone(item.phone)) &&
    Boolean(item.message.trim())
  );
}

export async function POST(request: Request) {
  const session = await auth();

  if (!session?.accessToken) {
    return NextResponse.json({ error: "Необходим вход через Google" }, { status: 401 });
  }

  try {
    const maxBatchSize = getPositiveIntegerEnv("SEND_BATCH_SIZE", 5);
    const body = (await request.json()) as { broadcastId?: unknown; items?: unknown[] };
    const broadcastId = typeof body.broadcastId === "string" ? body.broadcastId : "";
    const items = Array.isArray(body.items) ? body.items : [];

    if (!items.length) {
      return NextResponse.json({ error: "Нет сообщений для отправки" }, { status: 400 });
    }

    if (items.length > maxBatchSize) {
      return NextResponse.json(
        { error: `Размер батча не должен превышать ${maxBatchSize}` },
        { status: 400 }
      );
    }

    if (!items.every(isSendItem)) {
      return NextResponse.json({ error: "Некорректный формат сообщений" }, { status: 400 });
    }

    const normalizedItems = items.map((item) => ({
      ...item,
      phone: normalizeKazakhstanPhone(item.phone) ?? item.phone
    }));
    const results = await sendWhatsAppBatch(normalizedItems);

    if (broadcastId) {
      await applySendResultsToBroadcast(broadcastId, session.user?.email ?? "", results);
    }

    for (const result of results) {
      if (result.status === "error") {
        await logServerError({
          endpoint: "GreenAPI sendMessage",
          error: new Error(result.error ?? "GreenAPI message send failed"),
          userEmail: session.user?.email,
          context: {
            broadcastId,
            invoiceId: result.invoiceId ?? null,
            rowNumber: result.rowNumber,
            phone: result.phone
          }
        });
      }
    }

    return NextResponse.json({ results });
  } catch (error) {
    await logServerError({
      endpoint: "POST /api/send-batch",
      error,
      userEmail: session.user?.email
    });

    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Не удалось отправить сообщения"
      },
      { status: 500 }
    );
  }
}
