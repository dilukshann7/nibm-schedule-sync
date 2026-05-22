import { buildGoogleAuthUrl, encryptRefreshToken } from "./workerAuth.js";
import { disconnectUser, getUserByEmail, upsertUser } from "./workerDb.js";
import { exchangeCodeForTokens, fetchGoogleProfile } from "./workerGoogle.js";
import { runScheduledSync } from "./workerSync.js";
import type { Env } from "./workerTypes.js";

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

    if (request.method === "GET" && url.pathname === "/") {
      return html(homePage(url.origin));
    }

    if (request.method === "GET" && url.pathname === "/auth/google") {
      const state = crypto.randomUUID();
      const authUrl = buildGoogleAuthUrl({
        clientId: env.GOOGLE_CLIENT_ID,
        redirectUri: env.GOOGLE_REDIRECT_URI,
        state
      });

      return new Response(null, {
        status: 302,
        headers: {
          Location: authUrl,
          "Set-Cookie": `oauth_state=${state}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=600`
        }
      });
    }

    if (request.method === "GET" && url.pathname === "/auth/callback") {
      return handleCallback(request, env, url);
    }

    if (request.method === "POST" && url.pathname === "/disconnect") {
      const form = await request.formData();
      const email = String(form.get("email") || "").trim();

      if (!email) {
        return html(messagePage("Missing email", "Enter the email you connected."), 400);
      }

      await disconnectUser(env.DB, email);
      return html(messagePage("Disconnected", `${email} will no longer be synced.`));
    }

    if (request.method === "POST" && url.pathname === "/admin/sync") {
      if (request.headers.get("x-cron-secret") !== env.TOKEN_ENCRYPTION_KEY) {
        return new Response("Unauthorized", { status: 401 });
      }

      await runScheduledSync(env);
      return new Response("Sync complete");
    }

    return new Response("Not found", { status: 404 });
  },

  async scheduled(_event: ScheduledEvent, env: Env, ctx: ExecutionContext): Promise<void> {
    ctx.waitUntil(runScheduledSync(env));
  }
};

async function handleCallback(request: Request, env: Env, url: URL): Promise<Response> {
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const cookieState = parseCookie(request.headers.get("cookie") || "").oauth_state;

  if (!code || !state || !cookieState || state !== cookieState) {
    return html(messagePage("OAuth failed", "The OAuth state did not match. Try connecting again."), 400);
  }

  const tokens = await exchangeCodeForTokens(
    {
      clientId: env.GOOGLE_CLIENT_ID,
      clientSecret: env.GOOGLE_CLIENT_SECRET,
      redirectUri: env.GOOGLE_REDIRECT_URI
    },
    code
  );

  if (!tokens.refresh_token) {
    return html(messagePage("OAuth failed", "Google did not return a refresh token. Try again and approve offline access."), 400);
  }

  const profile = await fetchGoogleProfile(tokens.access_token);
  const encrypted = await encryptRefreshToken(tokens.refresh_token, env.TOKEN_ENCRYPTION_KEY);

  await upsertUser(env.DB, {
    id: profile.sub,
    email: profile.email,
    encryptedRefreshToken: encrypted.ciphertext,
    tokenIv: encrypted.iv
  });

  const user = await getUserByEmail(env.DB, profile.email);

  return html(
    messagePage(
      "Calendar connected",
      `${profile.email} is connected. Daily sync will create an NIBM Schedule calendar if it does not exist yet. Status: ${
        user?.is_active ? "active" : "inactive"
      }.`
    ),
    200,
    {
      "Set-Cookie": "oauth_state=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0"
    }
  );
}

function html(body: string, status = 200, headers: HeadersInit = {}): Response {
  return new Response(body, {
    status,
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      ...headers
    }
  });
}

function homePage(origin: string): string {
  return page(
    "NIBM Calendar Sync",
    `<main>
      <h1>NIBM Calendar Sync</h1>
      <p>Connect Google Calendar once. This service checks the NIBM Excel schedule daily and syncs your modules into a dedicated Google Calendar.</p>
      <p><a class="button" href="${origin}/auth/google">Connect Google Calendar</a></p>
      <form method="post" action="/disconnect">
        <label>Email to disconnect</label>
        <input name="email" type="email" required placeholder="you@gmail.com" />
        <button type="submit">Disconnect</button>
      </form>
    </main>`
  );
}

function messagePage(title: string, message: string): string {
  return page(title, `<main><h1>${escapeHtml(title)}</h1><p>${escapeHtml(message)}</p><p><a href="/">Back</a></p></main>`);
}

function page(title: string, body: string): string {
  return `<!doctype html>
    <html lang="en">
      <head>
        <meta charset="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <title>${escapeHtml(title)}</title>
        <style>
          body { margin: 0; font-family: system-ui, sans-serif; color: #111827; background: #f8fafc; }
          main { max-width: 560px; margin: 12vh auto; padding: 24px; }
          h1 { font-size: 32px; margin: 0 0 12px; }
          p { line-height: 1.6; }
          .button, button { display: inline-block; border: 0; border-radius: 8px; background: #111827; color: white; padding: 10px 14px; text-decoration: none; cursor: pointer; }
          form { display: grid; gap: 8px; margin-top: 32px; padding-top: 24px; border-top: 1px solid #e5e7eb; }
          input { border: 1px solid #d1d5db; border-radius: 8px; padding: 10px 12px; font: inherit; }
        </style>
      </head>
      <body>${body}</body>
    </html>`;
}

function parseCookie(cookieHeader: string): Record<string, string> {
  const cookies: Record<string, string> = {};

  for (const part of cookieHeader.split(";")) {
    const [name, ...valueParts] = part.trim().split("=");

    if (name && valueParts.length > 0) {
      cookies[name] = valueParts.join("=");
    }
  }

  return cookies;
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}
