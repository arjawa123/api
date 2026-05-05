import { Router } from "express";

export function createDonationRouter({ donationService }) {
  const router = Router();

  router.post("/api/donate", asyncRoute(async (req, res) => {
    const donation = await donationService.createDonation(req.body || {}, req);
    res.json(donation);
  }));

  router.get("/api/payment-status/:id", asyncRoute(async (req, res) => {
    const donation = await donationService.getStatus(req.params.id, req.query || {});
    res.json(donation);
  }));

  router.post("/api/payment-cancel/:id", asyncRoute(async (req, res) => {
    const result = await donationService.cancelDonation(req.params.id);
    res.json(result);
  }));

  router.post("/api/v2/donations", asyncRoute(async (req, res) => {
    const donation = await donationService.createDonation(req.body || {}, req);
    res.status(201).json(donation);
  }));

  router.get("/api/v2/donations/:orderId/status", asyncRoute(async (req, res) => {
    const donation = await donationService.getStatus(req.params.orderId, req.query || {});
    res.json(donation);
  }));

  router.post("/api/v2/webhooks/pakasir", asyncRoute(async (req, res) => {
    const result = await donationService.handlePakasirWebhook(req.body || {});
    res.json(result);
  }));

  return router;
}

function asyncRoute(handler) {
  return (req, res, next) => Promise.resolve(handler(req, res, next)).catch(next);
}
