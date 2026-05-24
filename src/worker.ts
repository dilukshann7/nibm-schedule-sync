import { buildGoogleAuthUrl, encryptRefreshToken } from "./workerAuth.js";
import { disconnectUser, getUserByEmail, upsertUser } from "./workerDb.js";
import { exchangeCodeForTokens, fetchGoogleProfile } from "./workerGoogle.js";
import { enqueueInitialUserSync, processNextSyncJob, runImmediateUserSync, runScheduledSync } from "./workerSync.js";
import type { Env } from "./workerTypes.js";

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);

    if (request.method === "GET" && url.pathname === "/") {
      return html(homePage(url.origin));
    }

    if (request.method === "GET" && url.pathname === "/privacy") {
      return html(privacyPage());
    }

    if (request.method === "GET" && url.pathname === "/terms") {
      return html(termsPage());
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
      return handleCallback(request, env, url, ctx);
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
      ctx.waitUntil(processNextSyncJob(env));
      return new Response("Sync complete");
    }

    if (request.method === "POST" && url.pathname === "/internal/process-sync-jobs") {
      if (request.headers.get("x-cron-secret") !== env.TOKEN_ENCRYPTION_KEY) {
        return new Response("Unauthorized", { status: 401 });
      }

      const result = await processNextSyncJob(env);

      return Response.json(result);
    }

    return new Response("Not found", { status: 404 });
  },

  async scheduled(_event: ScheduledEvent, env: Env, ctx: ExecutionContext): Promise<void> {
    ctx.waitUntil(
      runScheduledSync(env).then(() => processNextSyncJob(env))
    );
  }
};

async function handleCallback(request: Request, env: Env, url: URL, ctx: ExecutionContext): Promise<Response> {
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
  let syncMessage = "Initial sync has been queued. It will process in small batches so Cloudflare's free Worker limits are not exceeded.";

  if (user) {
    try {
      const stats = await runImmediateUserSync(env, user, tokens.access_token);
      syncMessage = `Initial sync added the first events immediately: created ${stats.created}, updated ${stats.updated}, deleted ${stats.deleted}. Future hourly syncs will keep adding, updating, and removing managed events in small batches.`;
      await enqueueInitialUserSync(env, user);
    } catch (error) {
      syncMessage = `Connected, but the immediate sync failed: ${error instanceof Error ? error.message : String(error)}. The hourly sync will retry.`;
    }
  }

  return html(
    messagePage(
      "Calendar connected",
      `${profile.email} is connected. ${syncMessage} Status: ${user?.is_active ? "active" : "inactive"}.`
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
      <p>Connect Google Calendar once. This service checks the NIBM Excel schedule hourly and syncs your modules into a dedicated Google Calendar.</p>
      <p><a class="button" href="${origin}/auth/google">Connect Google Calendar</a></p>
      <form method="post" action="/disconnect">
        <label>Email to disconnect</label>
        <input name="email" type="email" required placeholder="you@gmail.com" />
        <button type="submit">Disconnect</button>
      </form>
      <footer><a href="/privacy">Privacy Policy</a> <span>·</span> <a href="/terms">Terms</a></footer>
    </main>`
  );
}

function privacyPage(): string {
  return page(
    "Privacy Policy",
    `<main>
      <h1>Privacy Policy</h1>
      <p><strong>Effective date:</strong> May 22, 2026</p>
      <p>NIBM Calendar Sync is a small calendar utility for syncing the public NIBM schedule spreadsheet into a connected Google Calendar.</p>

      <h2>Information We Collect</h2>
      <p>When you connect Google Calendar, we collect your Google account ID, email address, Google refresh token, calendar ID created for the sync, sync status, and error logs needed to operate the service.</p>
      <p>We also download the public NIBM schedule spreadsheet to create, update, or remove calendar events in your dedicated NIBM Schedule calendar.</p>

      <h2>How We Use Information</h2>
      <p>We use your Google account information only to authenticate you and sync NIBM schedule events to your Google Calendar. We use sync logs only to troubleshoot failed syncs and confirm that hourly syncs are running.</p>

      <h2>Google Calendar Access</h2>
      <p>The app requests Google Calendar permission so it can create and manage the calendar/events it creates for the NIBM schedule. It does not use your Google data for advertising, profiling, or unrelated analytics.</p>
      <p>Use and transfer of information received from Google APIs will adhere to the Google API Services User Data Policy, including the Limited Use requirements.</p>

      <h2>Storage and Security</h2>
      <p>Google refresh tokens are encrypted before they are stored in Cloudflare D1. Access to the service configuration and encryption key is limited to the operator of this service.</p>

      <h2>Sharing</h2>
      <p>We do not sell your personal information. We do not share your Google account data with third parties except as needed to operate the service through Cloudflare hosting and Google APIs.</p>

      <h2>Retention and Deletion</h2>
      <p>You can disconnect by using the disconnect form on the homepage. Disconnecting disables future sync for your email. You can also remove the app's access from your Google Account permissions page.</p>

      <h2>Contact</h2>
      <p>For privacy or deletion requests, contact the person who shared this service with you.</p>

      <footer><a href="/">Home</a> <span>·</span> <a href="/terms">Terms</a></footer>
    </main>`
  );
}

function termsPage(): string {
  return page(
    "Terms of Service",
    `<main>
      <h1>Terms of Service</h1>
      <p><strong>Effective date:</strong> May 22, 2026</p>
      <p>NIBM Calendar Sync is provided as a small personal utility for syncing the public NIBM schedule spreadsheet to Google Calendar.</p>

      <h2>Use of the Service</h2>
      <p>You may use this service only to connect your own Google Calendar account and receive NIBM schedule events. Do not use the service to access accounts or calendars you do not control.</p>

      <h2>Calendar Changes</h2>
      <p>The service creates, updates, and deletes events in the dedicated NIBM Schedule calendar it manages. It is not responsible for mistakes, delays, missing classes, spreadsheet errors, Google Calendar issues, or changes made outside the service.</p>

      <h2>Availability</h2>
      <p>The service is provided as-is and may be unavailable, delayed, or stopped at any time. Hourly sync depends on Cloudflare Workers, Google APIs, and the public SharePoint spreadsheet remaining available.</p>

      <h2>User Responsibilities</h2>
      <p>You are responsible for checking your official university schedule and confirming event accuracy. This service is a convenience tool and should not be treated as the official source of schedule truth.</p>

      <h2>Disconnecting</h2>
      <p>You can stop future sync by using the disconnect form on the homepage or by removing the app from your Google Account permissions.</p>

      <h2>Limitation of Liability</h2>
      <p>To the maximum extent allowed by law, the service operator is not liable for missed classes, incorrect calendar events, data loss, service outages, or other damages caused by use of this tool.</p>

      <h2>Changes</h2>
      <p>These terms may be updated when the service changes. Continued use of the service means you accept the latest terms.</p>

      <footer><a href="/">Home</a> <span>·</span> <a href="/privacy">Privacy Policy</a></footer>
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
          h2 { font-size: 18px; margin: 28px 0 8px; }
          p { line-height: 1.6; }
          .button, button { display: inline-block; border: 0; border-radius: 8px; background: #111827; color: white; padding: 10px 14px; text-decoration: none; cursor: pointer; }
          form { display: grid; gap: 8px; margin-top: 32px; padding-top: 24px; border-top: 1px solid #e5e7eb; }
          input { border: 1px solid #d1d5db; border-radius: 8px; padding: 10px 12px; font: inherit; }
          footer { margin-top: 32px; color: #6b7280; font-size: 14px; }
          a { color: #111827; }
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
