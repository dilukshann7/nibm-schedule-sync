export async function downloadExcel(url: string): Promise<Buffer> {
  let response = await fetchWithCookies(url);

  if (response.status === 401 && isSharePointUrl(url)) {
    const warmup = await fetchWithCookies(getSharePointWarmupUrl(url));
    const cookieHeader = buildCookieHeader(getSetCookieValues(warmup.headers));

    if (cookieHeader) {
      response = await fetchWithCookies(url, cookieHeader);
    }
  }

  if (!response.ok) {
    throw new Error(`Failed to download Excel file: ${response.status} ${response.statusText}`);
  }

  const contentType = response.headers.get("content-type") || "";

  if (!contentType.includes("spreadsheetml.sheet") && !contentType.includes("application/octet-stream")) {
    throw new Error(`Expected an Excel download, got content-type: ${contentType || "unknown"}`);
  }

  return Buffer.from(await response.arrayBuffer());
}

export function getSharePointWarmupUrl(url: string): string {
  const parsed = new URL(url);
  parsed.searchParams.delete("download");
  return parsed.toString();
}

export function buildCookieHeader(setCookieValues: string[]): string {
  return setCookieValues
    .map((cookie) => cookie.split(";")[0]?.trim())
    .filter(Boolean)
    .join("; ");
}

async function fetchWithCookies(url: string, initialCookieHeader = ""): Promise<Response> {
  const cookies = new Map<string, string>();
  mergeCookieHeader(cookies, initialCookieHeader);

  let currentUrl = url;
  let response: Response | null = null;

  for (let redirectCount = 0; redirectCount < 8; redirectCount += 1) {
    response = await fetch(currentUrl, {
      redirect: "manual",
      headers: {
        ...browserHeaders(),
        ...(cookies.size > 0 ? { Cookie: cookieMapToHeader(cookies) } : {})
      }
    });

    mergeSetCookies(cookies, getSetCookieValues(response.headers));

    if (![301, 302, 303, 307, 308].includes(response.status)) {
      return response;
    }

    const location = response.headers.get("location");

    if (!location) {
      return response;
    }

    currentUrl = new URL(location, currentUrl).toString();
  }

  if (!response) {
    throw new Error("SharePoint download did not return a response.");
  }

  return response;
}

function mergeCookieHeader(cookies: Map<string, string>, cookieHeader: string): void {
  for (const part of cookieHeader.split(";")) {
    const [name, ...valueParts] = part.trim().split("=");

    if (name && valueParts.length > 0) {
      cookies.set(name, valueParts.join("="));
    }
  }
}

function mergeSetCookies(cookies: Map<string, string>, setCookieValues: string[]): void {
  for (const cookie of setCookieValues) {
    const [nameValue] = cookie.split(";");
    const [name, ...valueParts] = (nameValue || "").trim().split("=");

    if (name && valueParts.length > 0) {
      cookies.set(name, valueParts.join("="));
    }
  }
}

function cookieMapToHeader(cookies: Map<string, string>): string {
  return [...cookies.entries()].map(([name, value]) => `${name}=${value}`).join("; ");
}

function browserHeaders(): Record<string, string> {
  return {
    "User-Agent": "Mozilla/5.0 NIBM Excel Calendar Sync",
    Accept: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,text/html;q=0.9,*/*;q=0.8"
  };
}

function getSetCookieValues(headers: Headers): string[] {
  const getSetCookie = (headers as Headers & { getSetCookie?: () => string[] }).getSetCookie;

  if (getSetCookie) {
    return getSetCookie.call(headers);
  }

  const singleHeader = headers.get("set-cookie");
  return singleHeader ? [singleHeader] : [];
}

function isSharePointUrl(url: string): boolean {
  return new URL(url).hostname.endsWith(".sharepoint.com");
}
