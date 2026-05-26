export function nowIso() {
  return new Date().toISOString();
}

export function newId(prefix: string) {
  return `${prefix}_${crypto.randomUUID()}`;
}

export function rowToCamel<T extends Record<string, unknown>>(row: T) {
  return Object.fromEntries(
    Object.entries(row).map(([key, value]) => [key.replace(/_([a-z])/g, (_, c) => c.toUpperCase()), value])
  );
}
