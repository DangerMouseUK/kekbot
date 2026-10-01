export class AppError extends Error {
  readonly code: string;
  readonly status: number;
  constructor(code: string, status = 400) {
    super(code);
    this.code = code;
    this.status = status;
  }
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
