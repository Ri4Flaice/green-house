export function requireEnv(name: string) {
  const value = process.env[name];

  if (!value) {
    throw new Error(`Missing environment variable: ${name}`);
  }

  return value;
}

export function getPositiveIntegerEnv(name: string, fallback: number) {
  const rawValue = process.env[name];
  const value = rawValue ? Number(rawValue) : fallback;

  return Number.isFinite(value) && value > 0 ? Math.floor(value) : fallback;
}
