import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { getPositiveIntegerEnv } from "@/lib/env";
import { normalizeKazakhstanPhone, type SendItem } from "@/lib/orders";
import { sendWhatsAppBatch } from "@/lib/green-api";

function isSendItem(value: unknown): value is SendItem {
  const item = value as SendItem;

  return (
    typeof item?.rowNumber === "number" &&
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
    const body = (await request.json()) as { items?: unknown[] };
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

    return NextResponse.json({ results });
  } catch (error) {
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Не удалось отправить сообщения"
      },
      { status: 500 }
    );
  }
}
