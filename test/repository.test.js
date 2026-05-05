import assert from "node:assert/strict";
import { test } from "node:test";
import { createDonationRepository } from "../src/modules/donations/repository.js";

test("Supabase repository sends schema profile headers", async () => {
  const calls = [];
  const repository = createDonationRepository(
    {
      url: "https://example.supabase.co",
      serviceRoleKey: "service-role",
      schema: "donation"
    },
    async (url, options) => {
      calls.push({ url, options });
      return Response.json([]);
    }
  );

  await repository.findByOrderId("DONATE-123");

  assert.equal(calls.length, 1);
  assert.equal(calls[0].options.headers["Accept-Profile"], "donation");
  assert.equal(calls[0].options.headers["Content-Profile"], "donation");
});
