import { describe, expect, it } from "vitest";
import { buildGoogleAuthUrl, encryptRefreshToken, decryptRefreshToken } from "../src/workerAuth.js";

describe("buildGoogleAuthUrl", () => {
  it("builds a Google OAuth URL with calendar app-created scope and state", () => {
    const url = new URL(
      buildGoogleAuthUrl({
        clientId: "client-id",
        redirectUri: "https://sync.example.com/auth/callback",
        state: "csrf-state"
      })
    );

    expect(url.origin + url.pathname).toBe("https://accounts.google.com/o/oauth2/v2/auth");
    expect(url.searchParams.get("client_id")).toBe("client-id");
    expect(url.searchParams.get("redirect_uri")).toBe("https://sync.example.com/auth/callback");
    expect(url.searchParams.get("access_type")).toBe("offline");
    expect(url.searchParams.get("prompt")).toBe("consent");
    expect(url.searchParams.get("state")).toBe("csrf-state");
    expect(url.searchParams.get("scope")).toContain("https://www.googleapis.com/auth/calendar.app.created");
    expect(url.searchParams.get("scope")).toContain("openid");
    expect(url.searchParams.get("scope")).toContain("email");
  });
});

describe("refresh token encryption", () => {
  it("round-trips a refresh token using an app secret", async () => {
    const encrypted = await encryptRefreshToken("refresh-token", "secret-key");

    expect(encrypted.ciphertext).not.toBe("refresh-token");
    await expect(decryptRefreshToken(encrypted, "secret-key")).resolves.toBe("refresh-token");
  });
});
