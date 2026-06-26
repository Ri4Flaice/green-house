import { PrismaClient } from "@prisma/client";

const globalForPrisma = globalThis as unknown as {
  prisma?: PrismaClient;
};

export function isDatabaseConfigured() {
  return Boolean(process.env.DATABASE_URL);
}

export const prisma = isDatabaseConfigured()
  ? globalForPrisma.prisma ?? new PrismaClient()
  : null;

if (process.env.NODE_ENV !== "production" && prisma) {
  globalForPrisma.prisma = prisma;
}

export function requirePrisma() {
  if (!prisma) {
    throw new Error("DATABASE_URL is not configured");
  }

  return prisma;
}
