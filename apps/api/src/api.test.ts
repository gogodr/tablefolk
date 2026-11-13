import { afterEach, describe, expect, it, vi } from "vitest";
import { buildApp } from "./api.js";

afterEach(() => vi.unstubAllEnvs());

describe("API without Clerk configuration", () => {
  it("serves health and reports the missing configuration on protected routes", async () => {
    vi.stubEnv("CLERK_PUBLISHABLE_KEY", "");
    vi.stubEnv("CLERK_SECRET_KEY", "");
    const app = buildApp();
    try {
      const health = await app.inject("/health");
      expect(health.statusCode).toBe(200);
      const collection = await app.inject("/v1/collection");
      expect(collection.statusCode).toBe(503);
      expect(collection.json()).toEqual({
        error: { code: "AUTH_NOT_CONFIGURED", message: "Clerk is not configured for this API" },
      });
    } finally {
      await app.close();
    }
  });
});
