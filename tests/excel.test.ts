import { describe, expect, it } from "vitest";
import { buildCookieHeader, getSharePointWarmupUrl } from "../src/excel.js";

describe("getSharePointWarmupUrl", () => {
  it("removes only the download flag so SharePoint can issue anonymous cookies", () => {
    expect(getSharePointWarmupUrl("https://example.sharepoint.com/:x:/g/file?rtime=abc&download=1")).toBe(
      "https://example.sharepoint.com/:x:/g/file?rtime=abc"
    );
  });
});

describe("buildCookieHeader", () => {
  it("builds a Cookie header from Set-Cookie values", () => {
    expect(buildCookieHeader(["FedAuth=abc; path=/; secure", "rtFa=def; path=/; secure"])).toBe("FedAuth=abc; rtFa=def");
  });
});
