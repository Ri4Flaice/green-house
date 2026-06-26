import { BroadcastStatus, RecipientStatus, type Prisma } from "@prisma/client";
import { requirePrisma } from "@/lib/prisma";
import type { InvalidRow, ParsedInvoice } from "@/lib/orders";
import type { SendResult } from "@/lib/green-api";

export type BroadcastRecipientDto = {
  id: string;
  invoiceId: string;
  rowNumber: number;
  clientName: string;
  rawName: string;
  phone: string;
  message: string;
  sourceLabel: string;
  sheetTitles: string[];
  itemCount: number;
  cashTotal: number;
  remoteTotal: number;
  status: RecipientStatus;
  idMessage: string;
  error: string;
  sentAt: string | null;
};

export type BroadcastDto = {
  id: string;
  userEmail: string;
  spreadsheetId: string;
  spreadsheetName: string;
  sheetTitles: string[];
  status: BroadcastStatus;
  totalCount: number;
  sentCount: number;
  errorCount: number;
  skippedCount: number;
  createdAt: string;
  startedAt: string | null;
  completedAt: string | null;
  recipients: BroadcastRecipientDto[];
};

type CreateBroadcastInput = {
  userEmail: string;
  spreadsheetId: string;
  spreadsheetName: string;
  sheetTitles: string[];
  invoices: ParsedInvoice[];
  invalidRows: InvalidRow[];
};

type SendResultWithInvoiceId = SendResult & {
  invoiceId?: string;
};

function toStringArray(value: Prisma.JsonValue): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];
}

function serializeBroadcast(
  broadcast: Prisma.BroadcastGetPayload<{
    include: {
      recipients: {
        orderBy: [{ status: "asc" }, { createdAt: "asc" }];
      };
    };
  }>
): BroadcastDto {
  return {
    id: broadcast.id,
    userEmail: broadcast.userEmail,
    spreadsheetId: broadcast.spreadsheetId,
    spreadsheetName: broadcast.spreadsheetName,
    sheetTitles: toStringArray(broadcast.sheetTitles),
    status: broadcast.status,
    totalCount: broadcast.totalCount,
    sentCount: broadcast.sentCount,
    errorCount: broadcast.errorCount,
    skippedCount: broadcast.skippedCount,
    createdAt: broadcast.createdAt.toISOString(),
    startedAt: broadcast.startedAt?.toISOString() ?? null,
    completedAt: broadcast.completedAt?.toISOString() ?? null,
    recipients: broadcast.recipients.map((recipient) => ({
      id: recipient.id,
      invoiceId: recipient.invoiceId,
      rowNumber: recipient.rowNumber,
      clientName: recipient.clientName,
      rawName: recipient.rawName,
      phone: recipient.phone,
      message: recipient.message,
      sourceLabel: recipient.sourceLabel,
      sheetTitles: toStringArray(recipient.sheetTitles),
      itemCount: recipient.itemCount,
      cashTotal: recipient.cashTotal,
      remoteTotal: recipient.remoteTotal,
      status: recipient.status,
      idMessage: recipient.idMessage ?? "",
      error: recipient.error ?? "",
      sentAt: recipient.sentAt?.toISOString() ?? null
    }))
  };
}

async function getBroadcastWithRecipients(id: string, userEmail: string) {
  const db = requirePrisma();

  const broadcast = await db.broadcast.findFirst({
    where: {
      id,
      userEmail
    },
    include: {
      recipients: {
        orderBy: [{ status: "asc" }, { createdAt: "asc" }]
      }
    }
  });

  if (!broadcast) {
    throw new Error("Рассылка не найдена");
  }

  return broadcast;
}

export async function createBroadcast(input: CreateBroadcastInput) {
  const db = requirePrisma();

  const broadcast = await db.broadcast.create({
    data: {
      userEmail: input.userEmail,
      spreadsheetId: input.spreadsheetId,
      spreadsheetName: input.spreadsheetName,
      sheetTitles: input.sheetTitles,
      status: BroadcastStatus.CREATED,
      totalCount: input.invoices.length,
      skippedCount: input.invalidRows.length,
      recipients: {
        create: [
          ...input.invoices.map((invoice) => ({
            invoiceId: invoice.id,
            rowNumber: invoice.rowNumber,
            clientName: invoice.clientName,
            rawName: invoice.rawName,
            phone: invoice.normalizedPhone,
            message: invoice.message,
            sourceLabel: invoice.sourceLabel,
            sheetTitles: invoice.sheetTitles,
            itemCount: invoice.items.length,
            cashTotal: invoice.cashTotal,
            remoteTotal: invoice.remoteTotal,
            status: RecipientStatus.PENDING
          })),
          ...input.invalidRows.map((row) => ({
            invoiceId: `invalid-${row.id}`,
            rowNumber: row.rowNumber,
            clientName: row.rawName,
            rawName: row.rawName,
            phone: row.rawPhone,
            message: "",
            sourceLabel: row.sheetTitle ?? "",
            sheetTitles: row.sheetTitle ? [row.sheetTitle] : [],
            itemCount: 0,
            cashTotal: 0,
            remoteTotal: 0,
            status: RecipientStatus.SKIPPED,
            error: row.reason
          }))
        ]
      }
    },
    include: {
      recipients: {
        orderBy: [{ status: "asc" }, { createdAt: "asc" }]
      }
    }
  });

  return serializeBroadcast(broadcast);
}

export async function getBroadcast(id: string, userEmail: string) {
  const broadcast = await getBroadcastWithRecipients(id, userEmail);
  return serializeBroadcast(broadcast);
}

export async function applySendResultsToBroadcast(
  broadcastId: string,
  userEmail: string,
  results: SendResultWithInvoiceId[]
) {
  const db = requirePrisma();
  const now = new Date();

  await db.$transaction(async (transaction) => {
    const broadcast = await transaction.broadcast.findFirst({
      where: {
        id: broadcastId,
        userEmail
      },
      select: {
        id: true,
        startedAt: true
      }
    });

    if (!broadcast) {
      throw new Error("Рассылка не найдена");
    }

    await transaction.broadcast.update({
      where: {
        id: broadcast.id
      },
      data: {
        status: BroadcastStatus.SENDING,
        startedAt: broadcast.startedAt ?? now
      }
    });

    for (const result of results) {
      const data = {
        status: result.status === "success" ? RecipientStatus.SUCCESS : RecipientStatus.ERROR,
        idMessage: result.idMessage || null,
        error: result.error || null,
        sentAt: now
      };

      if (result.invoiceId) {
        await transaction.broadcastRecipient.updateMany({
          where: {
            broadcastId: broadcast.id,
            invoiceId: result.invoiceId,
            status: {
              not: RecipientStatus.SKIPPED
            }
          },
          data
        });
        continue;
      }

      await transaction.broadcastRecipient.updateMany({
        where: {
          broadcastId: broadcast.id,
          rowNumber: result.rowNumber,
          phone: result.phone,
          status: {
            not: RecipientStatus.SKIPPED
          }
        },
        data
      });
    }

    const [sentCount, errorCount, pendingCount] = await Promise.all([
      transaction.broadcastRecipient.count({
        where: {
          broadcastId: broadcast.id,
          status: RecipientStatus.SUCCESS
        }
      }),
      transaction.broadcastRecipient.count({
        where: {
          broadcastId: broadcast.id,
          status: RecipientStatus.ERROR
        }
      }),
      transaction.broadcastRecipient.count({
        where: {
          broadcastId: broadcast.id,
          status: RecipientStatus.PENDING
        }
      })
    ]);

    await transaction.broadcast.update({
      where: {
        id: broadcast.id
      },
      data: {
        status: pendingCount === 0 ? BroadcastStatus.COMPLETED : BroadcastStatus.SENDING,
        sentCount,
        errorCount,
        completedAt: pendingCount === 0 ? now : null
      }
    });
  });
}

export async function markBroadcastFailed(broadcastId: string, userEmail: string, error: unknown) {
  const db = requirePrisma();
  const message = error instanceof Error ? error.message : String(error);

  await db.broadcast.updateMany({
    where: {
      id: broadcastId,
      userEmail
    },
    data: {
      status: BroadcastStatus.FAILED,
      completedAt: new Date()
    }
  });

  await db.broadcastRecipient.updateMany({
    where: {
      broadcastId,
      status: RecipientStatus.PENDING
    },
    data: {
      status: RecipientStatus.ERROR,
      error: message
    }
  });
}
