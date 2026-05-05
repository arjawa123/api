import { buildCorsRules } from "./http/cors.js";
import { normalizePositiveAmount, sanitizeText } from "./sanitize.js";

export function buildConfig(env) {
  const corsOrigins = new Set(parseCsv(env.CORS_ORIGIN));
  const frontendUrl = sanitizeOptionalUrl(env.FRONTEND_URL || "https://donation.xnv.my.id");

  if (frontendUrl) {
    corsOrigins.add(new URL(frontendUrl).origin);
  }

  if (!corsOrigins.size) corsOrigins.add("*");

  return {
    port: env.PORT || 3000,
    publicApiUrl: trimTrailingSlash(env.API_PUBLIC_URL),
    donation: {
      name: sanitizeText(env.DONATION_NAME || "Developer Support", 80),
      frontendUrl,
      minAmount: normalizePositiveAmount(env.DONATION_MIN_AMOUNT) || 1000
    },
    cors: buildCorsRules(corsOrigins),
    pakasir: {
      baseUrl: trimTrailingSlash(env.PAKASIR_BASE_URL) || "https://app.pakasir.com",
      projectSlug: env.PAKASIR_PROJECT_SLUG || env.PAKASIR_PROJECT || "",
      apiKey: env.PAKASIR_API_KEY || "",
      timeoutMs: normalizePositiveAmount(env.PAKASIR_TIMEOUT_MS) || 15000
    },
    supabase: {
      url: trimTrailingSlash(env.SUPABASE_URL),
      serviceRoleKey: env.SUPABASE_SERVICE_ROLE_KEY || "",
      schema: env.SUPABASE_SCHEMA || "donation"
    }
  };
}

export function parseCsv(value) {
  if (Array.isArray(value)) return value.flatMap((item) => parseCsv(item));
  if (typeof value !== "string") return [];
  return value.split(",").map((item) => item.trim()).filter(Boolean);
}

function sanitizeOptionalUrl(value) {
  if (typeof value !== "string" || !value.trim()) return null;

  try {
    return new URL(value.trim()).toString();
  } catch {
    return null;
  }
}

function trimTrailingSlash(value) {
  if (typeof value !== "string") return "";
  return value.trim().replace(/\/$/, "");
}
