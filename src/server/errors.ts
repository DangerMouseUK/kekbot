const appErrorBrand = Symbol.for("kekbot.appError");

export class AppError extends Error {
  readonly [appErrorBrand] = true;
  readonly code: string;
  readonly status: number;
  constructor(code: string, status = 400) {
    super(code);
    this.code = code;
    this.status = status;
  }
}

// Instrumentation and route handlers can contain separate copies of this class.
// Recognize our sanitized errors across those Next.js bundle boundaries.
export function isAppError(error: unknown): error is AppError {
  return error instanceof Error && (error as AppError)[appErrorBrand] === true;
}

export class DeliveryError extends AppError {
  readonly outcome: "failed" | "uncertain" | "retry";
  readonly retryAfterMs: number;
  constructor(code: string, outcome: "failed" | "uncertain" | "retry", retryAfterMs = 0) {
    super(code, 502);
    this.outcome = outcome;
    this.retryAfterMs = retryAfterMs;
  }
}
