import { getPositiveIntegerEnv, requireEnv } from "@/lib/env";
import type { SendItem } from "@/lib/orders";

export type SendResult = {
  invoiceId?: string;
  rowNumber: number;
  clientName: string;
  phone: string;
  status: "success" | "error";
  idMessage?: string;
  error?: string;
};

type GreenApiSendResponse = {
  idMessage?: string;
};

function getGreenApiUrl() {
  const baseUrl = requireEnv("GREEN_API_URL").replace(/\/+$/, "");
  const idInstance = requireEnv("GREEN_API_ID_INSTANCE");
  const token = requireEnv("GREEN_API_TOKEN");

  return `${baseUrl}/waInstance${idInstance}/sendMessage/${token}`;
}

function sleep(milliseconds: number) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

export async function sendWhatsAppBatch(items: SendItem[]) {
  const url = getGreenApiUrl();
  const delayMs = getPositiveIntegerEnv("SEND_DELAY_MS", 700);
  const results: SendResult[] = [];

  for (const item of items) {
    const chatId = `${item.phone}@c.us`;

    try {
      const response = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          chatId,
          message: item.message
        })
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`${response.status} ${errorText}`);
      }

      const data = (await response.json()) as GreenApiSendResponse;

      results.push({
        invoiceId: item.invoiceId,
        rowNumber: item.rowNumber,
        clientName: item.clientName,
        phone: item.phone,
        status: "success",
        idMessage: data.idMessage ?? ""
      });
    } catch (error) {
      results.push({
        invoiceId: item.invoiceId,
        rowNumber: item.rowNumber,
        clientName: item.clientName,
        phone: item.phone,
        status: "error",
        error: error instanceof Error ? error.message : "Неизвестная ошибка отправки"
      });
    }

    if (delayMs > 0) {
      await sleep(delayMs);
    }
  }

  return results;
}
