import assert from "node:assert/strict";
import { test } from "node:test";
import request from "supertest";
import { createApp } from "../src/server.js";
import { createDonationService } from "../src/modules/donations/service.js";
import { AppError } from "../src/shared/errors.js";

function buildTestApp(overrides = {}) {
  const records = new Map();
  const gatewayCalls = [];
  const config = {
    donation: {
      name: "Developer Support",
      frontendUrl: "https://donation.xnv.my.id",
      minAmount: 1000
    },
    cors: {
      allowAll: true,
      exactOrigins: new Set(),
      wildcardDomains: new Set()
    },
    pakasir: {
      projectSlug: "demo",
      apiKey: "secret",
      baseUrl: "https://app.pakasir.com"
    },
    supabase: {}
  };

  const repository = {
    async upsertDonation(record) {
      records.set(record.order_id, record);
      return [record];
    },
    async findByOrderId(orderId) {
      return records.get(orderId) || null;
    },
    async updateStatus(orderId, updates) {
      const current = records.get(orderId) || { order_id: orderId };
      const next = { ...current, ...updates };
      records.set(orderId, next);
      return [next];
    }
  };

  const gateway = {
    async createTransaction({ orderId, amount }) {
      gatewayCalls.push({ type: "create", orderId, amount });
      return {
        gateway: "pakasir",
        payment_method: "qris",
        transaction_id: orderId,
        order_id: orderId,
        amount,
        payable_amount: amount + 1003,
        qris_string: "00020101021226610016ID.CO.QRIS",
        expires_at: "2026-05-05T12:00:00.000Z",
        raw: { payment: { order_id: orderId } }
      };
    },
    async getTransactionDetail({ orderId, amount }) {
      if (overrides.getStatusError) throw overrides.getStatusError;

      gatewayCalls.push({ type: "detail", orderId, amount });
      return {
        gateway: "pakasir",
        payment_method: "qris",
        transaction_id: orderId,
        order_id: orderId,
        amount,
        status: overrides.status || "paid",
        paid_at: "2026-05-05T12:02:00.000Z",
        raw: { transaction: { order_id: orderId, amount, status: "completed" } }
      };
    },
    async cancelTransaction({ orderId, amount }) {
      gatewayCalls.push({ type: "cancel", orderId, amount });
      return { ok: true };
    }
  };

  const donationService = createDonationService({
    config,
    repository,
    gateway
  });

  return {
    app: createApp({ config, repository, gateway, donationService }),
    records,
    gatewayCalls
  };
}

test("POST /api/donate keeps v1-compatible response fields", async () => {
  const { app } = buildTestApp();

  const response = await request(app).post("/api/donate").send({
    amount: 25000,
    donor_name: "Rizal",
    donor_email: "rizal@example.com",
    message: "Keep shipping"
  });

  assert.equal(response.status, 200);
  assert.equal(response.body.amount, 25000);
  assert.equal(response.body.payable_amount, 26003);
  assert.equal(response.body.payment_method, "qris");
  assert.equal(response.body.status, "pending");
  assert.ok(response.body.order_id.startsWith("DONATE-"));
  assert.equal(response.body.transaction_id, response.body.order_id);
  assert.equal(response.body.qris_string, "00020101021226610016ID.CO.QRIS");
});

test("POST /api/v2/donations rejects amount below site minimum", async () => {
  const { app } = buildTestApp();

  const response = await request(app).post("/api/v2/donations").send({
    amount: 500
  });

  assert.equal(response.status, 400);
  assert.match(response.body.error, /Minimum donation amount/);
});

test("GET /api/v2/donations/:orderId/status verifies with gateway detail", async () => {
  const { app, gatewayCalls } = buildTestApp();

  const createResponse = await request(app).post("/api/v2/donations").send({
    amount: 10000
  });
  const orderId = createResponse.body.order_id;

  const statusResponse = await request(app).get(`/api/v2/donations/${orderId}/status`);

  assert.equal(statusResponse.status, 200);
  assert.equal(statusResponse.body.status, "paid");
  assert.deepEqual(
    gatewayCalls.map((call) => call.type),
    ["create", "detail"]
  );
});

test("POST /api/v2/webhooks/pakasir verifies webhook through transaction detail", async () => {
  const { app, gatewayCalls } = buildTestApp();

  const createResponse = await request(app).post("/api/v2/donations").send({
    amount: 15000
  });
  const orderId = createResponse.body.order_id;

  const webhookResponse = await request(app).post("/api/v2/webhooks/pakasir").send({
    project: "demo",
    order_id: orderId,
    amount: 15000,
    status: "completed",
    payment_method: "qris",
    completed_at: "2026-05-05T12:02:00.000Z"
  });

  assert.equal(webhookResponse.status, 200);
  assert.equal(webhookResponse.body.status, "paid");
  assert.equal(gatewayCalls.at(-1).type, "detail");
});

test("GET /api/v2/donations/:orderId/status returns gateway timeout as 504", async () => {
  const { app } = buildTestApp({
    getStatusError: new AppError(504, "Gateway timeout", {
      publicMessage: "Payment gateway timeout. Please try checking the status again."
    })
  });

  const createResponse = await request(app).post("/api/v2/donations").send({
    amount: 12000
  });
  const orderId = createResponse.body.order_id;

  const statusResponse = await request(app).get(`/api/v2/donations/${orderId}/status`);

  assert.equal(statusResponse.status, 504);
  assert.equal(statusResponse.body.error, "Payment gateway timeout. Please try checking the status again.");
});
