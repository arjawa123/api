import crypto from "node:crypto";
import cors from "cors";
import dotenv from "dotenv";
import express from "express";

dotenv.config();

const app = express();
const port = process.env.PORT || 3000;
const qrisApiBaseUrl = "https://qris.pw/api";
const sites = loadDonationSites();
const defaultSite = sites[0];

app.set("trust proxy", true);

const corsOrigins = getCorsOrigins(sites);

app.use(
  cors({
    origin(origin, callback) {
      if (!origin || corsOrigins.has("*") || corsOrigins.has(origin)) {
        return callback(null, true);
      }

      return callback(new Error("Origin is not allowed by CORS"));
    }
  })
);
app.use(
  express.json({
    verify: (req, _res, buf) => {
      req.rawBody = buf.toString("utf8");
    }
  })
);

app.get("/api/health", (_req, res) => {
  res.json({ ok: true });
});

app.get("/api/sites", (_req, res) => {
  res.json({
    sites: sites.map((site) => ({
      id: site.id,
      name: site.name,
      frontend_url: site.frontendUrl,
      min_amount: site.minAmount
    }))
  });
});

app.post("/api/donate", async (req, res) => {
  try {
    const site = resolveDonationSite(req);
    if (!site) {
      return res.status(400).json({ error: "Unknown donation site" });
    }

    const amount = Number(req.body.amount);
    const donorName = sanitizeText(req.body.donor_name, 80);
    const message = sanitizeText(req.body.message, 240);
    const donorEmail = sanitizeDonorEmail(req.body.donor_email);

    if (!Number.isFinite(amount)) {
      return res.status(400).json({ error: "Amount is required" });
    }

    if (amount < site.minAmount) {
      return res.status(400).json({ error: `Minimum donation amount is Rp ${formatRupiah(site.minAmount)}` });
    }

    if (!hasQrisCredentials(site)) {
      return res.status(500).json({ error: "Donation gateway is not configured" });
    }

    const roundedAmount = Math.round(amount);
    const orderId = createOrderId(site.id);
    const callbackUrl = buildWebhookUrl(req);

    const payment = await createQrisPayment({
      amount: roundedAmount,
      order_id: orderId,
      customer_name: donorName || undefined,
      callback_url: callbackUrl
    }, site);

    await upsertDonation({
      order_id: payment.order_id || orderId,
      transaction_id: payment.transaction_id,
      site_id: site.id,
      site_name: site.name,
      site_url: site.frontendUrl,
      amount: payment.amount || roundedAmount,
      status: "pending",
      donor_name: donorName || null,
      donor_email: donorEmail,
      message: message || null,
      qris_url: payment.qris_url || null,
      qris_string: payment.qris_string || null,
      expires_at: normalizeDateForDb(payment.expires_at),
      paid_at: null
    });

    return res.json({
      transaction_id: payment.transaction_id,
      order_id: payment.order_id || orderId,
      site_id: site.id,
      amount: payment.amount || roundedAmount,
      qris_url: payment.qris_url,
      qris_string: payment.qris_string,
      expires_at: payment.expires_at,
      created_at: payment.created_at
    });
  } catch (error) {
    console.error("qris.pw create payment error:", error);
    return res.status(500).json({ error: "Internal Server Error during payment processing" });
  }
});

app.get("/api/payment-status/:id", async (req, res) => {
  try {
    const { id } = req.params;
    const site = resolveDonationSite(req, { allowDefault: true });

    if (!hasQrisCredentials(site)) {
      return res.status(500).json({ error: "Donation gateway is not configured" });
    }

    const payment = await checkQrisPayment(id, site);
    const status = normalizeQrisStatus(payment.status);

    await updateDonationStatus({
      transaction_id: payment.transaction_id || id,
      status,
      paid_at: normalizeDateForDb(payment.paid_at),
      expires_at: normalizeDateForDb(payment.expires_at)
    });

    return res.json({
      transaction_id: payment.transaction_id || id,
      order_id: payment.order_id || null,
      site_id: site.id,
      amount: payment.amount ?? null,
      status,
      paid_at: payment.paid_at || null,
      expires_at: payment.expires_at || null,
      created_at: payment.created_at || null
    });
  } catch (error) {
    console.error("qris.pw status error:", error);
    return res.status(500).json({ error: "Failed to get payment status" });
  }
});

app.post("/api/payment-cancel/:id", async (req, res) => {
  try {
    const { id } = req.params;
    await updateDonationStatus({
      transaction_id: id,
      status: "cancelled",
      paid_at: null,
      expires_at: null
    });

    return res.json({ ok: true, status: "cancelled" });
  } catch (error) {
    console.error("qris.pw cancel donation error:", error);
    return res.status(500).json({ error: "Failed to cancel donation" });
  }
});

app.get("/api/qr-download", async (req, res) => {
  try {
    const qrisUrl = parseQrisImageUrl(req.query.url);
    if (!qrisUrl) {
      return res.status(400).json({ error: "Invalid QRIS image URL" });
    }

    const response = await fetch(qrisUrl);
    if (!response.ok) {
      return res.status(502).json({ error: "Failed to fetch QRIS image" });
    }

    const contentType = response.headers.get("content-type") || "image/png";
    const buffer = Buffer.from(await response.arrayBuffer());

    res.setHeader("Content-Type", contentType);
    res.setHeader("Content-Disposition", 'attachment; filename="qris-donasi.png"');
    res.setHeader("Cache-Control", "no-store");
    return res.send(buffer);
  } catch (error) {
    console.error("qris.pw QR download error:", error);
    return res.status(500).json({ error: "Failed to download QRIS image" });
  }
});

app.post("/api/qris-webhook", async (req, res) => {
  try {
    if (!verifyWebhookSignature(req.body)) {
      return res.status(401).json({ error: "Invalid webhook signature" });
    }

    const status = normalizeQrisStatus(req.body.status);
    await updateDonationStatus({
      transaction_id: req.body.transaction_id,
      status,
      paid_at: normalizeDateForDb(req.body.paid_at),
      expires_at: null
    });

    return res.json({ ok: true });
  } catch (error) {
    console.error("qris.pw webhook error:", error);
    return res.status(500).json({ error: "Failed to process webhook" });
  }
});

app.listen(port, () => {
  console.log(`Donation server is running on port ${port}`);
});

function hasQrisCredentials(site = defaultSite) {
  return Boolean(site?.qrisApiKey && site?.qrisApiSecret);
}

async function createQrisPayment(payload, site) {
  const result = await qrisFetch("/create-payment.php", {
    method: "POST",
    body: JSON.stringify(payload)
  }, site);

  if (!result.success || !result.transaction_id) {
    throw new Error(result.error || "Failed to create qris.pw payment");
  }

  return result;
}

async function checkQrisPayment(transactionId, site) {
  const result = await qrisFetch(`/check-payment.php?transaction_id=${encodeURIComponent(transactionId)}`, {}, site);

  if (!result.success) {
    throw new Error(result.error || "Failed to check qris.pw payment");
  }

  return result;
}

async function qrisFetch(path, options = {}, site = defaultSite) {
  const response = await fetch(`${qrisApiBaseUrl}${path}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      "X-API-Key": site.qrisApiKey,
      "X-API-Secret": site.qrisApiSecret,
      ...(options.headers || {})
    }
  });
  const result = await response.json().catch(() => ({}));

  if (!response.ok) {
    throw new Error(result.error || `qris.pw returned HTTP ${response.status}`);
  }

  return result;
}

async function upsertDonation(record) {
  await supabaseRequest("/rest/v1/donations?on_conflict=transaction_id", {
    method: "POST",
    headers: {
      Prefer: "resolution=merge-duplicates"
    },
    body: JSON.stringify(record)
  });
}

async function updateDonationStatus({ transaction_id, status, paid_at, expires_at }) {
  if (!transaction_id) return;

  const body = {
    status,
    updated_at: new Date().toISOString()
  };
  if (paid_at) body.paid_at = paid_at;
  if (expires_at) body.expires_at = expires_at;

  await supabaseRequest(`/rest/v1/donations?transaction_id=eq.${encodeURIComponent(transaction_id)}`, {
    method: "PATCH",
    headers: {
      Prefer: "return=minimal"
    },
    body: JSON.stringify(body)
  });
}

async function supabaseRequest(path, options) {
  const supabaseUrl = process.env.SUPABASE_URL?.replace(/\/$/, "");
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !serviceRoleKey) {
    console.warn("Supabase donation logging is not configured.");
    return;
  }

  const response = await fetch(`${supabaseUrl}${path}`, {
    ...options,
    headers: {
      apikey: serviceRoleKey,
      Authorization: `Bearer ${serviceRoleKey}`,
      "Content-Type": "application/json",
      ...(options.headers || {})
    }
  });

  if (!response.ok) {
    const text = await response.text();
    console.error("Supabase donation logging error:", text);
  }
}

function verifyWebhookSignature(body) {
  if (!body?.signature) return false;

  const { signature, ...unsignedBody } = body;
  return sites.some((site) => {
    if (!site.webhookSecret) return false;

    const expectedSignature = crypto
      .createHmac("sha256", site.webhookSecret)
      .update(JSON.stringify(unsignedBody))
      .digest("hex");

    return timingSafeEqual(signature, expectedSignature);
  });
}

function timingSafeEqual(left, right) {
  const leftBuffer = Buffer.from(String(left));
  const rightBuffer = Buffer.from(String(right));
  if (leftBuffer.length !== rightBuffer.length) return false;
  return crypto.timingSafeEqual(leftBuffer, rightBuffer);
}

function buildWebhookUrl(req) {
  const publicApiUrl = process.env.API_PUBLIC_URL?.trim();
  const baseUrl = publicApiUrl || `${req.protocol}://${req.get("host")}`;
  return new URL("/api/qris-webhook", baseUrl).toString();
}

function loadDonationSites() {
  const configuredSites = parseConfiguredSites();
  const fallbackSite = normalizeSiteConfig({
    id: process.env.DEFAULT_SITE_ID || "default",
    name: process.env.DEFAULT_SITE_NAME || "Default",
    origins: parseCsv(process.env.CORS_ORIGIN),
    frontend_url: process.env.FRONTEND_URL,
    min_amount: process.env.DONATION_MIN_AMOUNT,
    qris_api_key: process.env.QRISPW_API_KEY,
    qris_api_secret: process.env.QRISPW_API_SECRET,
    qris_webhook_secret: process.env.QRISPW_WEBHOOK_SECRET
  });

  const normalizedSites = configuredSites.map((site) => normalizeSiteConfig(site)).filter(Boolean);
  return normalizedSites.length ? normalizedSites : [fallbackSite];
}

function parseConfiguredSites() {
  const raw = process.env.DONATION_SITES_JSON?.trim();
  if (!raw) return [];

  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch (error) {
    console.error("Invalid DONATION_SITES_JSON:", error);
    return [];
  }
}

function normalizeSiteConfig(site) {
  const id = sanitizeSiteId(site.id);
  if (!id) return null;

  const frontendUrl = sanitizeOptionalUrl(site.frontend_url || site.frontendUrl || process.env.FRONTEND_URL);
  const origins = new Set(parseCsv(site.origin || site.origins || site.allowed_origins || site.allowedOrigins));

  if (frontendUrl) {
    origins.add(new URL(frontendUrl).origin);
  }

  return {
    id,
    name: sanitizeText(site.name, 80) || id,
    origins,
    frontendUrl,
    minAmount: normalizeMinAmount(site.min_amount || site.minAmount || process.env.DONATION_MIN_AMOUNT),
    qrisApiKey: site.qris_api_key || site.qrisApiKey || process.env.QRISPW_API_KEY,
    qrisApiSecret: site.qris_api_secret || site.qrisApiSecret || process.env.QRISPW_API_SECRET,
    webhookSecret: site.qris_webhook_secret || site.qrisWebhookSecret || process.env.QRISPW_WEBHOOK_SECRET
  };
}

function getCorsOrigins(donationSites) {
  const origins = new Set(parseCsv(process.env.CORS_ORIGIN));

  for (const site of donationSites) {
    for (const origin of site.origins) origins.add(origin);
  }

  if (!origins.size) origins.add("*");
  return origins;
}

function resolveDonationSite(req, { allowDefault = false } = {}) {
  const requestedSiteId = sanitizeSiteId(
    req.body?.site_id || req.body?.siteId || req.query?.site_id || req.query?.siteId || req.get("x-site-id")
  );

  if (requestedSiteId) {
    return sites.find((site) => site.id === requestedSiteId) || null;
  }

  const requestOrigin = getRequestOrigin(req);
  if (requestOrigin) {
    const siteByOrigin = sites.find((site) => site.origins.has(requestOrigin));
    if (siteByOrigin) return siteByOrigin;
  }

  if (allowDefault || sites.length === 1) return defaultSite;
  return null;
}

function getRequestOrigin(req) {
  const origin = req.get("origin");
  if (origin) return origin;

  const referer = req.get("referer");
  if (!referer) return null;

  try {
    return new URL(referer).origin;
  } catch {
    return null;
  }
}

function createOrderId(siteId) {
  return `DONATE-${siteId.toUpperCase()}-${Date.now()}-${crypto.randomBytes(3).toString("hex").toUpperCase()}`;
}

function sanitizeSiteId(value) {
  if (typeof value !== "string") return "";
  return value.trim().toLowerCase().replace(/[^a-z0-9_-]/g, "").slice(0, 40);
}

function parseCsv(value) {
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

function normalizeMinAmount(value) {
  const amount = Number(value);
  return Number.isFinite(amount) && amount > 0 ? Math.round(amount) : 1000;
}

function formatRupiah(value) {
  return Math.round(value).toLocaleString("id-ID");
}

function sanitizeText(value, maxLength) {
  if (typeof value !== "string") return "";
  return value.trim().slice(0, maxLength);
}

function sanitizeDonorEmail(value) {
  if (typeof value !== "string") return "Someone";
  const trimmed = value.trim().slice(0, 254);
  return trimmed || "Someone";
}

function parseQrisImageUrl(value) {
  if (typeof value !== "string") return null;

  try {
    const url = new URL(value);
    const isQrisHost = url.hostname === "qris.pw" || url.hostname.endsWith(".qris.pw");
    if (url.protocol !== "https:" || !isQrisHost) return null;
    return url.toString();
  } catch {
    return null;
  }
}

function normalizeQrisStatus(status) {
  const normalized = String(status || "").toLowerCase();
  if (["pending", "paid", "expired", "failed", "cancelled"].includes(normalized)) {
    return normalized;
  }
  return "pending";
}

function normalizeDateForDb(value) {
  if (!value || typeof value !== "string") return null;
  const trimmed = value.trim();
  const isoish = trimmed.includes("T") ? trimmed : trimmed.replace(" ", "T");
  const withTimezone = /([zZ]|[+-]\d{2}:?\d{2})$/.test(isoish) ? isoish : `${isoish}+07:00`;
  const date = new Date(withTimezone);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}
