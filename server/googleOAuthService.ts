import fs from "fs";
import path from "path";
import crypto from "crypto";
import {
  saveServerOAuthToken,
  getServerOAuthToken,
  deleteServerOAuthToken,
  updateServerOAuthMetadata,
  type StoredOAuthToken,
} from "./oauthStore.js";

/**
 * Shared Google Workspace OAuth Service
 * Handles server-driven authorization flow, token exchange, refresh,
 * connection tests, and setup diagnostics for Gmail and Google Calendar.
 */

export interface GoogleSetupCheckResult {
  clientIdConfigured: boolean;
  clientIdPrefix: string;
  clientSecretConfigured: boolean;
  redirectUriConfigured: boolean;
  redirectUri: string;
  gmailConnected: boolean;
  gmailScopeGranted: boolean;
  gmailRefreshTokenStored: boolean;
  gmailLastSync: string | null;
  gmailLastError: string | null;
  gmailLastErrorCode: string | null;
  calendarConnected: boolean;
  calendarScopeGranted: boolean;
  calendarRefreshTokenStored: boolean;
  calendarLastSync: string | null;
  calendarLastError: string | null;
  calendarLastErrorCode: string | null;
}

export const REQUIRED_GMAIL_SCOPE = "https://www.googleapis.com/auth/gmail.readonly";
export const REQUIRED_CALENDAR_SCOPE = "https://www.googleapis.com/auth/calendar.events";

const GMAIL_SCOPES = [
  "openid",
  "email",
  REQUIRED_GMAIL_SCOPE,
];

const CALENDAR_SCOPES = [
  "openid",
  "email",
  REQUIRED_CALENDAR_SCOPE,
];

/**
 * Resolves the Google OAuth Client ID strictly on the server.
 */
export function getServerGoogleClientId(): string {
  const envId =
    process.env.GOOGLE_CLIENT_ID ||
    process.env.VITE_GOOGLE_CLIENT_ID ||
    process.env.VITE_GOOGLE_CALENDAR_CLIENT_ID ||
    "";
  if (envId && typeof envId === "string" && !envId.startsWith("YOUR_")) {
    return envId.trim();
  }

  // Fallback to firebase-applet-config.json provisioned by set_up_oauth
  try {
    const cfgPath = path.resolve(process.cwd(), "firebase-applet-config.json");
    if (fs.existsSync(cfgPath)) {
      const cfg = JSON.parse(fs.readFileSync(cfgPath, "utf-8"));
      if (cfg.oAuthClientId && !cfg.oAuthClientId.startsWith("YOUR_")) {
        return cfg.oAuthClientId.trim();
      }
    }
  } catch {}

  return "";
}

/**
 * Resolves the Google OAuth Client Secret strictly on the server.
 * Never exposed to frontend code or API responses.
 */
export function getServerGoogleClientSecret(): string {
  const secret =
    process.env.GOOGLE_CLIENT_SECRET ||
    process.env.VITE_GOOGLE_CLIENT_SECRET ||
    "";
  if (secret && typeof secret === "string" && !secret.startsWith("YOUR_")) {
    return secret.trim();
  }
  return "";
}

/**
 * Computes the exact redirect URI based on the request origin.
 * Automatically supports ais-dev, ais-pre, production domains, and localhost.
 */
export function getGoogleRedirectUri(origin: string): string {
  const cleanOrigin = (origin || "").trim().replace(/\/+$/, "");
  if (cleanOrigin && !cleanOrigin.includes("undefined") && cleanOrigin.startsWith("http")) {
    return `${cleanOrigin}/api/auth/google/callback`;
  }

  if (process.env.GOOGLE_REDIRECT_URI && process.env.GOOGLE_REDIRECT_URI !== "postmessage") {
    const raw = process.env.GOOGLE_REDIRECT_URI.trim().replace(/\/+$/, "");
    return raw.endsWith("/api/auth/google/callback") ? raw : `${raw}/api/auth/google/callback`;
  }

  return "http://localhost:3000/api/auth/google/callback";
}

/**
 * Derives the request origin honoring reverse proxies (x-forwarded-proto/host).
 */
export function deriveRequestOrigin(req: any): string {
  const protoHeader = req.headers["x-forwarded-proto"] || req.protocol || "https";
  const proto = protoHeader.toString().split(",")[0].trim();
  const hostHeader = req.headers["x-forwarded-host"] || req.get("host") || "localhost:3000";
  const host = hostHeader.toString().split(",")[0].trim();
  return `${proto}://${host}`;
}

/**
 * Formats Google OAuth errors into detailed, plain-English explanations.
 */
export function formatGoogleOAuthError(errorData: any, redirectUriUsed?: string): string {
  const errCode = (errorData?.error || "").toString().toLowerCase();
  const desc = (errorData?.error_description || "").toString();

  if (errCode === "unauthorized_client" || desc.includes("unauthorized_client")) {
    return `[Google unauthorized_client] ${desc ? desc + " — " : ""}The client ID used to start login differs from the one used to finish it, or the client isn't configured as a Web application in Google Cloud.`;
  }

  if (errCode === "invalid_client" || desc.includes("invalid_client") || desc.includes("client_secret")) {
    return `[Google invalid_client] ${desc ? desc + " — " : ""}Client ID and secret do not belong to the same OAuth client in Google Cloud Console.`;
  }

  if (errCode === "redirect_uri_mismatch" || desc.includes("redirect_uri_mismatch")) {
    const hintUri = redirectUriUsed || "the server callback URL";
    return `[Google redirect_uri_mismatch] The server used redirect URI "${hintUri}". Add this exact URL to "Authorized redirect URIs" under APIs & Services -> Credentials in Google Cloud Console.`;
  }

  if (errCode === "invalid_grant" || desc.includes("invalid_grant")) {
    return `[Google invalid_grant] ${desc ? desc + " — " : ""}The authorization code was expired or already used, or permissions were revoked. Click Reconnect to authorize again.`;
  }

  if (errCode === "access_denied" || desc.includes("access_denied")) {
    return `[Google access_denied] Google access was cancelled or denied. On the Google consent screen, click Continue and allow permissions.`;
  }

  if (errCode === "insufficient_scope" || desc.includes("insufficient_scope") || desc.includes("403")) {
    return `[Google 403 Insufficient Scope] Required permissions were not granted. Please reconnect and ensure all checkboxes are ticked on the Google consent screen.`;
  }

  return desc ? `[Google ${errCode}] ${desc}` : errCode || "Google authorization request failed. Please check your credentials.";
}

const STATE_SECRET = process.env.GOOGLE_CLIENT_SECRET || "deadlineiq-oauth-state-secret-2026";

export function createOAuthState(payload: { uid: string; service: "gmail" | "calendar"; redirectUri: string }): string {
  const data = JSON.stringify({
    ...payload,
    ts: Date.now(),
    nonce: crypto.randomBytes(8).toString("hex"),
  });
  const hmac = crypto.createHmac("sha256", STATE_SECRET).update(data).digest("hex");
  return Buffer.from(JSON.stringify({ data, sig: hmac })).toString("base64url");
}

export function verifyOAuthState(stateStr: string): { uid: string; service: "gmail" | "calendar"; redirectUri: string } | null {
  try {
    const parsed = JSON.parse(Buffer.from(stateStr, "base64url").toString("utf-8"));
    const expectedSig = crypto.createHmac("sha256", STATE_SECRET).update(parsed.data).digest("hex");
    if (expectedSig !== parsed.sig) return null;
    const payload = JSON.parse(parsed.data);
    // Valid for 30 minutes
    if (Date.now() - payload.ts > 30 * 60 * 1000) return null;
    return payload;
  } catch {
    return null;
  }
}

/**
 * STEP 1: Builds the server-driven Google authorization URL.
 */
export function buildGoogleAuthUrl(origin: string, service: "gmail" | "calendar", uid: string): string {
  const clientId = getServerGoogleClientId();
  if (!clientId) {
    throw new Error("GOOGLE_CLIENT_ID is missing on the server. Please set GOOGLE_CLIENT_ID in your environment variables.");
  }

  const redirectUri = getGoogleRedirectUri(origin);
  const state = createOAuthState({ uid, service, redirectUri });
  const scopes = (service === "gmail" ? GMAIL_SCOPES : CALENDAR_SCOPES).join(" ");

  // Server-side logging (first 12 chars of client_id, never token/secret)
  console.log(`[Google OAuth Start] Client ID (prefix): ${clientId.slice(0, 12)}...`);
  console.log(`[Google OAuth Start] Redirect URI: ${redirectUri}`);
  console.log(`[Google OAuth Start] Service: ${service}`);
  console.log(`[Google OAuth Start] Requested scopes: ${scopes}`);

  const url = new URL("https://accounts.google.com/o/oauth2/v2/auth");
  url.searchParams.set("client_id", clientId);
  url.searchParams.set("redirect_uri", redirectUri);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("scope", scopes);
  url.searchParams.set("access_type", "offline");
  url.searchParams.set("prompt", "consent");
  url.searchParams.set("include_granted_scopes", "true");
  url.searchParams.set("state", state);

  return url.toString();
}

/**
 * STEP 1 & 2: Handles Google's callback code exchange on the server.
 */
export async function exchangeGoogleCallbackCode(
  code: string,
  stateStr: string
): Promise<{
  ok: boolean;
  service: "gmail" | "calendar";
  connectedEmail: string | null;
  error?: string;
  error_description?: string;
  errorCode?: string;
}> {
  const verifiedState = verifyOAuthState(stateStr);
  if (!verifiedState) {
    return {
      ok: false,
      service: "calendar",
      connectedEmail: null,
      error: "Invalid or expired authorization session state. Please click Connect to try again.",
      errorCode: "invalid_state",
    };
  }

  const { uid, service, redirectUri } = verifiedState;
  const clientId = getServerGoogleClientId();
  const clientSecret = getServerGoogleClientSecret();

  if (!clientId || !clientSecret) {
    return {
      ok: false,
      service,
      connectedEmail: null,
      error: "Server is missing GOOGLE_CLIENT_ID or GOOGLE_CLIENT_SECRET. Configure these environment variables in your server.",
      errorCode: "missing_config",
    };
  }

  // Server-side logging before exchange
  console.log(`[Google OAuth Callback] Client ID (prefix): ${clientId.slice(0, 12)}...`);
  console.log(`[Google OAuth Callback] Exact Redirect URI: ${redirectUri}`);
  console.log(`[Google OAuth Callback] Service: ${service}`);

  const params = new URLSearchParams({
    code,
    client_id: clientId,
    client_secret: clientSecret,
    grant_type: "authorization_code",
    redirect_uri: redirectUri, // The EXACT redirect URI stored in state!
  });

  let tokenRes: Response;
  try {
    tokenRes = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: params.toString(),
    });
  } catch (netErr: any) {
    return {
      ok: false,
      service,
      connectedEmail: null,
      error: `Network failure connecting to Google OAuth token endpoint: ${netErr?.message || netErr}`,
      errorCode: "network_error",
    };
  }

  const tokenData = await tokenRes.json().catch(() => ({}));

  if (!tokenRes.ok || tokenData.error) {
    const rawError = tokenData.error || `HTTP ${tokenRes.status}`;
    const rawDesc = tokenData.error_description || "";
    const friendly = formatGoogleOAuthError(tokenData, redirectUri);

    console.warn(`[Google OAuth Token Error] Error: ${rawError}, Desc: ${rawDesc}`);
    updateServerOAuthMetadata(uid, service, {
      lastError: friendly,
      lastErrorCode: rawError,
    });

    return {
      ok: false,
      service,
      connectedEmail: null,
      error: friendly,
      error_description: rawDesc,
      errorCode: rawError,
    };
  }

  const { access_token, refresh_token, expires_in, scope } = tokenData;

  // Log granted scopes
  const scopeStr = typeof scope === "string" ? scope.trim() : "";
  const grantedScopes = scopeStr ? scopeStr.split(/\s+/).filter(Boolean) : [];

  console.log(`[Google OAuth Granted Scopes] Count: ${grantedScopes.length}, Scopes: ${scopeStr}`);

  // Check required scope
  const requiredScope = service === "gmail" ? REQUIRED_GMAIL_SCOPE : REQUIRED_CALENDAR_SCOPE;
  const isRequiredScopeGranted = grantedScopes.some((s) => s.includes(requiredScope) || s.endsWith(requiredScope.split("/").pop() || ""));

  if (!isRequiredScopeGranted) {
    const missingMsg = `Google didn't grant ${service === "gmail" ? "Gmail" : "Calendar"} access. Tick the checkbox on the Google consent screen and try again.`;
    console.warn(`[Google OAuth Missing Scope] Required scope "${requiredScope}" was not granted by user.`);

    updateServerOAuthMetadata(uid, service, {
      lastError: missingMsg,
      lastErrorCode: "insufficient_scope",
      scopes: grantedScopes,
    });

    return {
      ok: false,
      service,
      connectedEmail: null,
      error: missingMsg,
      errorCode: "scope_missing",
    };
  }

  // Retrieve user email
  let connectedEmail: string | null = null;
  try {
    const profileRes = await fetch("https://www.googleapis.com/oauth2/v2/userinfo", {
      headers: { Authorization: `Bearer ${access_token}` },
    });
    if (profileRes.ok) {
      const p = await profileRes.json();
      connectedEmail = p.email || null;
    }
  } catch {}

  const now = new Date().toISOString();
  const tokenExpiresAt = Date.now() + (Number(expires_in) || 3599) * 1000;

  // Store per-service token in server store
  const existing = getServerOAuthToken(uid, service, false);
  const finalRefreshToken = refresh_token || existing?.refreshToken || "";

  saveServerOAuthToken({
    userUid: uid,
    service,
    refreshToken: finalRefreshToken,
    accessToken: access_token,
    tokenExpiresAt,
    connectedEmail: connectedEmail || existing?.connectedEmail || null,
    scopes: grantedScopes,
    updatedAt: now,
    lastSyncTime: now,
    lastError: null,
    lastErrorCode: null,
  });

  return {
    ok: true,
    service,
    connectedEmail,
  };
}

/**
 * STEP 4: Shared token refresh module.
 * Returns a valid access token for the specified user and service.
 * Refreshes before expiry and retries once on 401.
 */
export async function getAccessToken(uid: string, service: "gmail" | "calendar"): Promise<string> {
  if (!uid) throw new Error("User UID is required.");

  const stored = getServerOAuthToken(uid, service, false);
  if (!stored) {
    const err: any = new Error(`No Google account connected for ${service}. Please click Connect.`);
    err.code = "not_connected";
    throw err;
  }

  // Return cached token if valid and not expiring within 60 seconds
  if (stored.accessToken && stored.tokenExpiresAt && Date.now() < stored.tokenExpiresAt - 60000) {
    return stored.accessToken;
  }

  // Must refresh token
  if (!stored.refreshToken) {
    const err: any = new Error(`No refresh token stored for ${service}. Please click Reconnect.`);
    err.code = "reconnect_required";
    updateServerOAuthMetadata(uid, service, {
      lastError: err.message,
      lastErrorCode: "reconnect_required",
    });
    throw err;
  }

  return refreshAccessTokenInternal(uid, service, stored.refreshToken, 0);
}

async function refreshAccessTokenInternal(
  uid: string,
  service: "gmail" | "calendar",
  refreshToken: string,
  retryCount: number
): Promise<string> {
  const clientId = getServerGoogleClientId();
  const clientSecret = getServerGoogleClientSecret();

  if (!clientId || !clientSecret) {
    const err: any = new Error("GOOGLE_CLIENT_ID or GOOGLE_CLIENT_SECRET is missing on the server.");
    err.code = "missing_config";
    throw err;
  }

  const params = new URLSearchParams({
    client_id: clientId,
    client_secret: clientSecret,
    refresh_token: refreshToken,
    grant_type: "refresh_token",
  });

  let refreshRes: Response;
  try {
    refreshRes = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: params.toString(),
    });
  } catch (netErr: any) {
    if (retryCount === 0) {
      await new Promise((r) => setTimeout(r, 500));
      return refreshAccessTokenInternal(uid, service, refreshToken, 1);
    }
    throw new Error(`Token refresh network failure: ${netErr?.message || netErr}`);
  }

  const data = await refreshRes.json().catch(() => ({}));

  if (!refreshRes.ok || data.error) {
    const rawError = data.error || `HTTP ${refreshRes.status}`;
    const desc = data.error_description || "";

    if (rawError === "invalid_grant" || refreshRes.status === 401) {
      deleteServerOAuthToken(uid, service);
      const friendlyMsg = `Google ${service} connection expired or was revoked. Please click Reconnect.`;
      const err: any = new Error(friendlyMsg);
      err.code = "reconnect_required";
      err.errorCode = "invalid_grant";
      updateServerOAuthMetadata(uid, service, {
        lastError: friendlyMsg,
        lastErrorCode: "invalid_grant",
      });
      throw err;
    }

    if (retryCount === 0) {
      await new Promise((r) => setTimeout(r, 500));
      return refreshAccessTokenInternal(uid, service, refreshToken, 1);
    }

    const friendlyMsg = formatGoogleOAuthError(data);
    updateServerOAuthMetadata(uid, service, {
      lastError: friendlyMsg,
      lastErrorCode: rawError,
    });
    const err: any = new Error(friendlyMsg);
    err.code = rawError;
    throw err;
  }

  const newAccessToken = data.access_token;
  const expiresIn = Number(data.expires_in) || 3599;
  const tokenExpiresAt = Date.now() + expiresIn * 1000;

  updateServerOAuthMetadata(uid, service, {
    accessToken: newAccessToken,
    tokenExpiresAt,
    lastSyncTime: new Date().toISOString(),
    lastError: null,
    lastErrorCode: null,
  });

  return newAccessToken;
}

/**
 * STEP 7: Real API call test connection per service.
 * Gmail: calls users.getProfile
 * Calendar: calls calendarList.list
 */
export async function testGoogleServiceConnection(
  uid: string,
  service: "gmail" | "calendar"
): Promise<{
  success: boolean;
  message: string;
  details?: any;
  error?: string;
  errorCode?: string;
}> {
  try {
    const token = await getAccessToken(uid, service);

    if (service === "gmail") {
      const res = await fetch("https://gmail.googleapis.com/gmail/v1/users/me/profile", {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        const errorMsg = data.error?.message || `Gmail API HTTP ${res.status}`;
        return {
          success: false,
          message: `Gmail API test failed: ${errorMsg}`,
          error: errorMsg,
          errorCode: String(res.status),
        };
      }
      return {
        success: true,
        message: `Gmail connection verified! Connected address: ${data.emailAddress}`,
        details: { emailAddress: data.emailAddress, messagesTotal: data.messagesTotal },
      };
    } else {
      const res = await fetch("https://www.googleapis.com/calendar/v3/users/me/calendarList?maxResults=1", {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        const errorMsg = data.error?.message || `Google Calendar API HTTP ${res.status}`;
        return {
          success: false,
          message: `Calendar API test failed: ${errorMsg}`,
          error: errorMsg,
          errorCode: String(res.status),
        };
      }
      const count = Array.isArray(data.items) ? data.items.length : 0;
      return {
        success: true,
        message: `Calendar connection verified! Accessible calendars found: ${count}`,
        details: { calendarsFound: count },
      };
    }
  } catch (err: any) {
    return {
      success: false,
      message: err?.message || `Test connection failed for ${service}.`,
      error: err?.message,
      errorCode: err?.code || err?.errorCode || "TEST_FAILED",
    };
  }
}

/**
 * Revokes Google access for a user and cleans up stored tokens per service.
 */
export async function revokeGoogleAccessToken(
  userUid: string,
  service: "gmail" | "calendar" | "all" = "all"
): Promise<{ success: boolean; message: string }> {
  if (!userUid) {
    throw new Error("User UID is required.");
  }

  if (service === "all") {
    const gmailToken = getServerOAuthToken(userUid, "gmail", false);
    const calToken = getServerOAuthToken(userUid, "calendar", false);
    const tokenToRevoke = gmailToken?.refreshToken || calToken?.refreshToken;

    if (tokenToRevoke) {
      try {
        await fetch(
          `https://oauth2.googleapis.com/revoke?token=${encodeURIComponent(tokenToRevoke)}`,
          {
            method: "POST",
            headers: { "Content-Type": "application/x-www-form-urlencoded" },
          }
        );
      } catch (e) {
        console.warn("Revoke all token warning:", e);
      }
    }

    deleteServerOAuthToken(userUid, "all");
    return { success: true, message: "Disconnected all Google integrations." };
  }

  const targetToken = getServerOAuthToken(userUid, service as any, false);
  const otherService = service === "gmail" ? "calendar" : "gmail";
  const otherToken = getServerOAuthToken(userUid, otherService as any, false);

  if (targetToken?.refreshToken && targetToken.refreshToken !== otherToken?.refreshToken) {
    try {
      await fetch(
        `https://oauth2.googleapis.com/revoke?token=${encodeURIComponent(targetToken.refreshToken)}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/x-www-form-urlencoded" },
        }
      );
    } catch (e) {
      console.warn(`Revoke ${service} warning:`, e);
    }
  }

  deleteServerOAuthToken(userUid, service as any);

  return {
    success: true,
    message: `Successfully disconnected Google ${service}.`,
  };
}

/**
 * STEP 7: Google Setup Check Diagnostics.
 * Returns booleans and actual non-sensitive details:
 * Client ID prefix (first 12 chars), computed redirect URI, granted scopes, and errors.
 */
export function getGoogleSetupCheck(userUid?: string, origin = "http://localhost:3000"): GoogleSetupCheckResult {
  const clientId = getServerGoogleClientId();
  const clientSecret = getServerGoogleClientSecret();
  const redirectUri = getGoogleRedirectUri(origin);

  const clientIdConfigured = Boolean(clientId && clientId.includes(".apps.googleusercontent.com"));
  const clientIdPrefix = clientId ? `${clientId.slice(0, 12)}...` : "";
  const clientSecretConfigured = Boolean(clientSecret && clientSecret.length > 5);
  const redirectUriConfigured = Boolean(redirectUri && redirectUri.length > 0);

  let gmailConnected = false;
  let gmailScopeGranted = false;
  let gmailRefreshTokenStored = false;
  let gmailLastSync: string | null = null;
  let gmailLastError: string | null = null;
  let gmailLastErrorCode: string | null = null;

  let calendarConnected = false;
  let calendarScopeGranted = false;
  let calendarRefreshTokenStored = false;
  let calendarLastSync: string | null = null;
  let calendarLastError: string | null = null;
  let calendarLastErrorCode: string | null = null;

  if (userUid) {
    // Check Gmail
    const gmailToken = getServerOAuthToken(userUid, "gmail", false) || getServerOAuthToken(userUid, "unified", true);
    if (gmailToken) {
      gmailRefreshTokenStored = Boolean(gmailToken.refreshToken);
      const scopes = Array.isArray(gmailToken.scopes) ? gmailToken.scopes : [];
      gmailScopeGranted = scopes.some((s) => s.includes("gmail.readonly"));
      gmailConnected = Boolean(gmailRefreshTokenStored && gmailScopeGranted);
      gmailLastSync = gmailToken.lastSyncTime || gmailToken.updatedAt || null;
      gmailLastError = gmailToken.lastError || null;
      gmailLastErrorCode = gmailToken.lastErrorCode || null;
    }

    // Check Calendar
    const calToken = getServerOAuthToken(userUid, "calendar", false) || getServerOAuthToken(userUid, "unified", true);
    if (calToken) {
      calendarRefreshTokenStored = Boolean(calToken.refreshToken);
      const scopes = Array.isArray(calToken.scopes) ? calToken.scopes : [];
      calendarScopeGranted = scopes.some((s) => s.includes("calendar.events") || s.includes("calendar.readonly"));
      calendarConnected = Boolean(calendarRefreshTokenStored && calendarScopeGranted);
      calendarLastSync = calToken.lastSyncTime || calToken.updatedAt || null;
      calendarLastError = calToken.lastError || null;
      calendarLastErrorCode = calToken.lastErrorCode || null;
    }
  }

  return {
    clientIdConfigured,
    clientIdPrefix,
    clientSecretConfigured,
    redirectUriConfigured,
    redirectUri,
    gmailConnected,
    gmailScopeGranted,
    gmailRefreshTokenStored,
    gmailLastSync,
    gmailLastError,
    gmailLastErrorCode,
    calendarConnected,
    calendarScopeGranted,
    calendarRefreshTokenStored,
    calendarLastSync,
    calendarLastError,
    calendarLastErrorCode,
  };
}
