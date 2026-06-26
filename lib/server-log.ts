import { LogLevel, type Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";

type LogServerErrorInput = {
  endpoint: string;
  error: unknown;
  userEmail?: string | null;
  context?: Prisma.InputJsonValue;
};

function getErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}

function getErrorStack(error: unknown) {
  return error instanceof Error ? error.stack : undefined;
}

export async function logServerError({ endpoint, error, userEmail, context }: LogServerErrorInput) {
  const message = getErrorMessage(error);
  const stack = getErrorStack(error);

  console.error(`[${endpoint}] ${message}`, stack ?? "");

  if (!prisma) {
    return;
  }

  try {
    await prisma.appLog.create({
      data: {
        level: LogLevel.ERROR,
        endpoint,
        message,
        stack,
        userEmail: userEmail ?? undefined,
        context
      }
    });
  } catch (logError) {
    console.error("[app-log] Failed to write error log", logError);
  }
}
