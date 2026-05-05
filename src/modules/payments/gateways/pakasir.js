import { AppError, assertConfigured } from "../../../shared/errors.js";
import { normalizeDateForDb } from "../../../shared/sanitize.js";

export function createPakasirGateway(config, fetchImpl = fetch) {
  return {
    name: "pakasir",
    paymentMethod: "qris",

    async createTransaction({ orderId, amount }) {
      assertPakasirConfig(config);

      const result = await requestJson(
        fetchImpl,
        `${config.baseUrl}/api/transactioncreate/qris`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json"
          },
          body: JSON.stringify({
            project: config.projectSlug,
            order_id: orderId,
            amount,
            api_key: config.apiKey
          })
        },
        config
      );

      const payment = result.payment;
      if (!payment?.order_id || !payment?.payment_number) {
        throw new AppError(502, "Invalid Pakasir create transaction response");
      }

      return {
        gateway: "pakasir",
        payment_method: payment.payment_method || "qris",
        transaction_id: payment.order_id,
        order_id: payment.order_id,
        amount: payment.amount,
        fee: payment.fee ?? null,
        payable_amount: payment.total_payment ?? payment.amount,
        qris_string: payment.payment_number,
        expires_at: payment.expired_at || null,
        raw: result
      };
    },

    async getTransactionDetail({ orderId, amount }) {
      assertPakasirConfig(config);

      const url = new URL(`${config.baseUrl}/api/transactiondetail`);
      url.searchParams.set("project", config.projectSlug);
      url.searchParams.set("amount", String(amount));
      url.searchParams.set("order_id", orderId);
      url.searchParams.set("api_key", config.apiKey);

      const result = await requestJson(fetchImpl, url.toString(), {}, config);
      const transaction = result.transaction;

      if (!transaction?.order_id) {
        throw new AppError(502, "Invalid Pakasir transaction detail response");
      }

      return {
        gateway: "pakasir",
        payment_method: transaction.payment_method || "qris",
        transaction_id: transaction.order_id,
        order_id: transaction.order_id,
        amount: transaction.amount,
        status: normalizePakasirStatus(transaction.status),
        completed_at: transaction.completed_at || null,
        paid_at: normalizeDateForDb(transaction.completed_at),
        raw: result
      };
    },

    async simulatePayment({ orderId, amount }) {
      assertPakasirConfig(config);

      return requestJson(
        fetchImpl,
        `${config.baseUrl}/api/paymentsimulation`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json"
          },
          body: JSON.stringify({
            project: config.projectSlug,
            order_id: orderId,
            amount,
            api_key: config.apiKey
          })
        },
        config
      );
    },

    async cancelTransaction({ orderId, amount }) {
      assertPakasirConfig(config);

      return requestJson(
        fetchImpl,
        `${config.baseUrl}/api/transactioncancel`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json"
          },
          body: JSON.stringify({
            project: config.projectSlug,
            order_id: orderId,
            amount,
            api_key: config.apiKey
          })
        },
        config
      );
    }
  };
}

export function normalizePakasirStatus(status) {
  const normalized = String(status || "").toLowerCase();

  if (normalized === "completed" || normalized === "paid" || normalized === "success") {
    return "paid";
  }

  if (["pending", "expired", "failed", "cancelled"].includes(normalized)) {
    return normalized;
  }

  return "pending";
}

async function requestJson(fetchImpl, url, options = {}, config = {}) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), config.timeoutMs || 15000);
  let response;

  try {
    response = await fetchImpl(url, {
      ...options,
      signal: options.signal || controller.signal
    });
  } catch (error) {
    const isTimeout = error?.name === "AbortError" || error?.cause?.code === "ETIMEDOUT";
    throw new AppError(isTimeout ? 504 : 502, "Pakasir request failed", {
      publicMessage: isTimeout
        ? "Payment gateway timeout. Please try checking the status again."
        : "Payment gateway is temporarily unavailable.",
      cause: error
    });
  } finally {
    clearTimeout(timeout);
  }

  const result = await response.json().catch(() => ({}));

  if (!response.ok) {
    throw new AppError(502, result.error || `Pakasir returned HTTP ${response.status}`, {
      publicMessage: "Payment gateway rejected the request"
    });
  }

  return result;
}

function assertPakasirConfig(config) {
  assertConfigured(config?.projectSlug, "PAKASIR_PROJECT_SLUG");
  assertConfigured(config?.apiKey, "PAKASIR_API_KEY");
}
