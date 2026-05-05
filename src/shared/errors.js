export class AppError extends Error {
  constructor(statusCode, message, options = {}) {
    super(message);
    this.name = "AppError";
    this.statusCode = statusCode;
    this.publicMessage = options.publicMessage || message;
    this.cause = options.cause;
  }
}

export function assertConfigured(value, name) {
  if (!value) {
    throw new AppError(500, `${name} is not configured`, {
      publicMessage: "Donation gateway is not configured"
    });
  }
}
