import crypto from "node:crypto";
import { AppError } from "../../shared/errors.js";
import {
  formatRupiah,
  normalizeDateForDb,
  normalizePositiveAmount,
  sanitizeEmail,
  sanitizeText
} from "../../shared/sanitize.js";

export function createDonationService({ config, repository, gateway }) {
  return {
    async createDonation(input) {
      const donationConfig = config.donation;
      const amount = normalizePositiveAmount(input.amount);

      if (!amount) {
        throw new AppError(400, "Amount is required");
      }

      if (amount < donationConfig.minAmount) {
        throw new AppError(400, `Minimum donation amount is Rp ${formatRupiah(donationConfig.minAmount)}`);
      }

      const donorName = sanitizeText(input.donor_name || input.donorName, 80);
      const donorEmail = sanitizeEmail(input.donor_email || input.donorEmail);
      const message = sanitizeText(input.message, 240);
      const orderId = createOrderId();
      const payment = await gateway.createTransaction({ orderId, amount });
      const now = new Date().toISOString();

      const record = {
        order_id: payment.order_id,
        transaction_id: payment.transaction_id,
        donation_name: donationConfig.name,
        donation_url: donationConfig.frontendUrl,
        gateway: payment.gateway,
        payment_method: payment.payment_method,
        amount,
        payable_amount: payment.payable_amount,
        status: "pending",
        donor_name: donorName || null,
        donor_email: donorEmail,
        message: message || null,
        qris_string: payment.qris_string,
        expires_at: normalizeDateForDb(payment.expires_at),
        paid_at: null,
        raw_gateway_response: payment.raw,
        created_at: now,
        updated_at: now
      };

      await repository.upsertDonation(record);

      return toPublicDonationResponse({
        ...record,
        expires_at: payment.expires_at
      });
    },

    async getStatus(orderId, input = {}) {
      const sanitizedOrderId = sanitizeText(orderId, 120);
      if (!sanitizedOrderId) {
        throw new AppError(400, "Order ID is required");
      }

      const storedDonation = await repository.findByOrderId(sanitizedOrderId);
      const amount = normalizePositiveAmount(storedDonation?.amount || input.amount);

      if (!amount) {
        throw new AppError(404, "Donation record not found");
      }

      const detail = await gateway.getTransactionDetail({
        orderId: sanitizedOrderId,
        amount
      });

      const paidAt = detail.paid_at || null;
      await repository.updateStatus(sanitizedOrderId, {
        status: detail.status,
        paid_at: paidAt,
        payment_method: detail.payment_method,
        raw_gateway_response: detail.raw
      });

      return toPublicDonationResponse({
        ...(storedDonation || {}),
        order_id: detail.order_id,
        transaction_id: detail.transaction_id,
        gateway: detail.gateway,
        payment_method: detail.payment_method,
        amount,
        payable_amount: storedDonation?.payable_amount || amount,
        status: detail.status,
        paid_at: paidAt
      });
    },

    async cancelDonation(orderId) {
      const storedDonation = await repository.findByOrderId(orderId);
      if (!storedDonation?.amount) {
        throw new AppError(404, "Donation record not found");
      }

      await gateway.cancelTransaction({ orderId, amount: storedDonation.amount });
      await repository.updateStatus(orderId, { status: "cancelled" });

      return {
        ok: true,
        order_id: orderId,
        status: "cancelled"
      };
    },

    async handlePakasirWebhook(payload) {
      const orderId = sanitizeText(payload?.order_id, 120);
      const amount = normalizePositiveAmount(payload?.amount);

      if (!orderId || !amount) {
        throw new AppError(400, "Invalid webhook payload");
      }

      const detail = await gateway.getTransactionDetail({ orderId, amount });

      if (detail.order_id !== orderId || Number(detail.amount) !== amount) {
        throw new AppError(409, "Webhook transaction mismatch");
      }

      await repository.updateStatus(orderId, {
        status: detail.status,
        paid_at: detail.paid_at,
        payment_method: detail.payment_method,
        raw_gateway_response: {
          webhook: payload,
          verified_detail: detail.raw
        }
      });

      return {
        ok: true,
        order_id: orderId,
        status: detail.status
      };
    }
  };
}

function createOrderId() {
  return `DONATE-${Date.now()}-${crypto.randomBytes(3).toString("hex").toUpperCase()}`;
}

function toPublicDonationResponse(record) {
  return {
    transaction_id: record.transaction_id || record.order_id,
    order_id: record.order_id,
    amount: record.amount ?? null,
    payable_amount: record.payable_amount ?? record.amount ?? null,
    payment_method: record.payment_method || "qris",
    status: record.status || "pending",
    qris_string: record.qris_string || null,
    expires_at: record.expires_at || null,
    paid_at: record.paid_at || null,
    created_at: record.created_at || null
  };
}
