// No "server-only" — mock provider is used in tests and has no server-side concerns.
import type {
  PrintProvider,
  PrintOrderParams,
  PrintJobResult,
  PrintJobStatus,
} from "../types.ts";
import {
  ProviderRequestError,
  ProviderTimeoutError,
} from "../errors.ts";

/** Scenarios that the mock provider can simulate. */
export type MockBehavior =
  | "success"
  | "fail"
  | "timeout"
  | "processing"
  | "shipped";

/**
 * MockPrintProvider — no external API calls.
 *
 * Use in local development, unit tests, and integration tests.
 * Behavior is controlled via constructor argument, never via env vars,
 * so production code cannot accidentally enter a failure mode.
 */
export class MockPrintProvider implements PrintProvider {
  private readonly behavior: MockBehavior;

  constructor(behavior: MockBehavior = "success") {
    this.behavior = behavior;
  }

  async validateOrder(params: PrintOrderParams): Promise<void> {
    if (!params.orderId || !params.idempotencyKey) {
      throw new ProviderRequestError("mock: missing order identity");
    }
  }

  async createOrder(params: PrintOrderParams): Promise<PrintJobResult> {
    await this.validateOrder(params);
    return this.submitOrder(params);
  }

  async submitOrder(params: PrintOrderParams): Promise<PrintJobResult> {
    if (this.behavior === "fail") {
      throw new ProviderRequestError("mock: simulated submit failure");
    }
    if (this.behavior === "timeout") {
      throw new ProviderTimeoutError("mock");
    }

    // Deterministic ID: test assertions can rely on this format.
    const key = params.idempotencyKey ?? params.orderId;
    const providerOrderId = `mock-${key}-submitted`;
    return { providerOrderId, status: "submitted" };
  }

  async getJobStatus(providerOrderId: string): Promise<PrintJobStatus> {
    void providerOrderId;
    switch (this.behavior) {
      case "processing":
        return { status: "processing" };
      case "shipped":
        return { status: "shipped", trackingNumber: "MOCK-TRACK-001" };
      case "fail":
        return { status: "failed" };
      default:
        return { status: "submitted" };
    }
  }

  async cancelJob(providerOrderId: string): Promise<void> {
    void providerOrderId;
    // Always succeeds in mock
  }

  normalizeError(error: unknown) {
    return {
      code: error instanceof ProviderTimeoutError ? "PROVIDER_TIMEOUT" : "PROVIDER_REQUEST_FAILED",
      retryable: !(error instanceof ProviderRequestError),
      outcomeUnknown: error instanceof ProviderTimeoutError,
    };
  }
}
