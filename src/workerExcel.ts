export async function downloadExcelForWorker(url: string): Promise<ArrayBuffer> {
  const response = await fetchWithCookies(url);

  if (!response.ok) {
    throw new Error(`Failed to download Excel file: ${response.status} ${response.statusText}`);
  }

  const contentType = response.headers.get("content-type") || "";

  if (!contentType.includes("spreadsheetml.sheet") && !contentType.includes("application/octet-stream")) {
    throw new Error(`Expected Excel content, got ${contentType || "unknown"}.`);
  }

  return response.arrayBuffer();
}

async function fetchWithCookies(url: string): Promise<Response> {
  const cookies = new Map<string, string>();
  let currentUrl = url;
  let response: Response | null = null;

  for (let redirectCount = 0; redirectCount < 8; redirectCount += 1) {
    response = await fetch(currentUrl, {
      redirect: "manual",
      headers: {
        "User-Agent": "Mozilla/5.0 NIBM Calendar Sync Worker",
        Accept: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,text/html;q=0.9,*/*;q=0.8",
        ...(cookies.size > 0 ? { Cookie: [...cookies].map(([name, value]) => `${name}=${value}`).join("; ") } : {})
      }
    });

    for (const setCookie of getSetCookieValues(response.headers)) {
      const [nameValue] = setCookie.split(";");
      const [name, ...valueParts] = (nameValue || "").trim().split("=");

      if (name && valueParts.length > 0) {
        cookies.set(name, valueParts.join("="));
      }
    }

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

function getSetCookieValues(headers: Headers): string[] {
  const getSetCookie = (headers as Headers & { getSetCookie?: () => string[] }).getSetCookie;

  if (getSetCookie) {
    return getSetCookie.call(headers);
  }

  const singleHeader = headers.get("set-cookie");
  return singleHeader ? [singleHeader] : [];
}
