import cors from "cors";
import dotenv from "dotenv";
import express from "express";
import { buildConfig } from "./shared/config.js";
import { AppError } from "./shared/errors.js";
import { buildCorsOptions } from "./shared/http/cors.js";
import { createDonationRouter } from "./modules/donations/routes.js";
import { createDonationService } from "./modules/donations/service.js";
import { createDonationRepository } from "./modules/donations/repository.js";
import { createPakasirGateway } from "./modules/payments/gateways/pakasir.js";

dotenv.config();

export function createApp(overrides = {}) {
  const config = overrides.config || buildConfig(process.env);
  const repository = overrides.repository || createDonationRepository(config.supabase);
  const gateway = overrides.gateway || createPakasirGateway(config.pakasir);
  const donationService =
    overrides.donationService ||
    createDonationService({
      config,
      repository,
      gateway
    });

  const app = express();
  app.set("trust proxy", true);

  app.use(cors(buildCorsOptions(config.cors)));
  app.use(
    express.json({
      verify: (req, _res, buf) => {
        req.rawBody = buf.toString("utf8");
      }
    })
  );

  app.get("/api/health", (_req, res) => {
    res.json({ ok: true, service: "donation-api", version: "2" });
  });

  app.use(
    createDonationRouter({
      config,
      donationService
    })
  );

  app.use((_req, _res, next) => {
    next(new AppError(404, "Route not found"));
  });

  app.use((error, _req, res, _next) => {
    const statusCode = error.statusCode || 500;

    if (statusCode >= 500 && error instanceof AppError) {
      console.error(`${error.name}: ${error.message}`);
    } else if (statusCode >= 500) {
      console.error(error);
    }

    res.status(statusCode).json({
      error: error.publicMessage || error.message || "Internal Server Error"
    });
  });

  return app;
}

export function startServer() {
  const config = buildConfig(process.env);
  const app = createApp({ config });

  app.listen(config.port, () => {
    console.log(`Donation API is running on port ${config.port}`);
  });
}

export default createApp();
