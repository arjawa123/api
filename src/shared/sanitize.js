export function sanitizeText(value, maxLength) {
  if (typeof value !== "string") return "";
  return value.trim().slice(0, maxLength);
}

export function sanitizeEmail(value) {
  if (typeof value !== "string") return null;
  const trimmed = value.trim().slice(0, 254);
  if (!trimmed) return null;
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed) ? trimmed : null;
}

export function sanitizeSiteId(value) {
  if (typeof value !== "string") return "";
  return value.trim().toLowerCase().replace(/[^a-z0-9_-]/g, "").slice(0, 40);
}

export function normalizePositiveAmount(value) {
  const amount = Number(value);
  if (!Number.isFinite(amount)) return null;
  const rounded = Math.round(amount);
  return rounded > 0 ? rounded : null;
}

export function normalizeDateForDb(value) {
  if (!value || typeof value !== "string") return null;

  const trimmed = value.trim();
  const isoish = trimmed.includes("T") ? trimmed : trimmed.replace(" ", "T");
  const withTimezone = /([zZ]|[+-]\d{2}:?\d{2})$/.test(isoish) ? isoish : `${isoish}+07:00`;
  const date = new Date(withTimezone);

  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

export function formatRupiah(value) {
  return Math.round(value).toLocaleString("id-ID");
}
