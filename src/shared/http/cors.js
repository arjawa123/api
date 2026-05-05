export function buildCorsOptions(corsConfig) {
  return {
    origin(origin, callback) {
      if (!origin || isOriginAllowed(origin, corsConfig)) {
        return callback(null, true);
      }

      return callback(null, false);
    }
  };
}

export function buildCorsRules(rawOrigins) {
  const exactOrigins = new Set();
  const wildcardDomains = new Set();
  let allowAll = false;

  for (const rawOrigin of rawOrigins) {
    const normalized = normalizeOriginRule(rawOrigin);
    if (!normalized) continue;

    if (normalized === "*") {
      allowAll = true;
      continue;
    }

    if (normalized.startsWith("*.")) {
      wildcardDomains.add(normalized.slice(2));
      continue;
    }

    exactOrigins.add(normalized);
  }

  return { allowAll, exactOrigins, wildcardDomains };
}

export function isOriginAllowed(requestOrigin, rules) {
  const normalizedOrigin = normalizeUrlOrigin(requestOrigin);
  if (!normalizedOrigin) return false;

  if (rules.allowAll || rules.exactOrigins.has(normalizedOrigin)) {
    return true;
  }

  let hostname;
  try {
    hostname = new URL(normalizedOrigin).hostname.toLowerCase();
  } catch {
    return false;
  }

  for (const domain of rules.wildcardDomains) {
    if (hostname === domain || hostname.endsWith(`.${domain}`)) {
      return true;
    }
  }

  return false;
}

export function normalizeUrlOrigin(value) {
  if (typeof value !== "string") return "";

  try {
    return new URL(value.trim()).origin.toLowerCase();
  } catch {
    return "";
  }
}

function normalizeOriginRule(value) {
  if (typeof value !== "string") return "";
  const trimmed = value.trim();
  if (!trimmed) return "";
  if (trimmed === "*") return "*";
  if (trimmed.startsWith("*.")) return trimmed.toLowerCase();

  return normalizeUrlOrigin(trimmed);
}
