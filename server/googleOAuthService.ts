import fs from "fs";
import path from "path";
import {
  saveServerOAuthToken,
  getServerOAuthToken,
  deleteServerOAuthToken,
  updateServerOAuthMetadata,
  type StoredOAuthToken,
} from "./oauthStore.js";

/**
 * Shared Google Workspace OAuth Service
 * Handles token exchange, refresh, revocation, and configuration diagnostics
 * for both Gmail and Google Calendar integrations.
 */

export interface GoogleSetupCheckResult {
  clientIdConfigured: boolean;
  clientSecretConfigured: boolean;
  redirectUriConfigured: boolean;
  gmailConnected: boolean;
  gmailScopeGranted: boolean;
  gmailRefreshTokenStored: boolean;
  gmailLastSync: string | null;
  gmailLastError: string | null;
  calendarConnected: boolean;
  calendarScopeGranted: boolean;
  calendarRefreshTokenStored: boolean;
  calendarLastSync: string | null;
  calendarLastError: string | null;
}

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
 * Resolves the redirect URI for OAuth token exchange.
 */
export function getServerGoogleRedirectUri(): string {
  if (process.env.GOOGLE_REDIRECT_URI && process.env.GOOGLE_REDIRECT_URI.trim()) {
    return process.env.GOOGLE_REDIRECT_URI.trim();
  }
  // Standard Google Identity Services popup mode redirect URI
  return "postmessage";
}

/**
 * Translates Google OAuth API error codes to clear, actionable plain-English explanations.
 */
export function formatGoogleOAuthError(errorData: any): string {
  const errCode = (errorData?.error || "").toString().toLowerCase();
  const desc = (errorData?.error_description || "").toString();

  if (errCode === "invalid_client" || desc.includes("invalid_client") || desc.includes("client_secret")) {
    return "Google OAuth Client Secret or Client ID is invalid or mismatched. Ensure the GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET in your server environment belong to the exact same OAuth Client in Google Cloud Console.";
  }

  if (errCode === "redirect_uri_mismatch" || desc.includes("redirect_uri_mismatch")) {
    return "Redirect URI mismatch in Google Cloud Console. In Google Cloud Console -> APIs & Services -> Credentials -> your OAuth Client, add 'postmessage' and your app domain to 'Authorized redirect URIs'.";
  }

  if (errCode === "invalid_grant" || desc.includes("invalid_grant")) {
    return "The authorization code was expired or already used, or permissions were revoked. Please click Reconnect to authorize again.";
  }

  if (errCode === "access_denied" || desc.includes("access_denied")) {
    return "Google access was denied. On the Google consent screen, please click Continue and allow the requested permissions.";
  }

  if (errCode === "unauthorized_client" || desc.includes("unauthorized_client")) {
    return "The OAuth Client is not authorized for this grant type or scope. Please check enabled scopes (gmail.readonly, calendar.events) in Google Cloud Console.";
  }

  if (errCode === "insufficient_scope" || desc.includes("insufficient_scope") || desc.includes("403")) {
    return "Insufficient Google permissions (403). Required scopes were not granted. Please reconnect and ensure all checkboxes are ticked on the Google consent screen.";
  }

  return desc || errCode || "Google authorization request failed. Please check your credentials.";
}

/**
 * Required Scopes Definitions
 */
export const REQUIRED_GMAIL_SCOPE = "https://www.googleapis.com/auth/gmail.readonly";
export const REQUIRED_CALENDAR_SCOPE = "https://www.googleapis.com/auth/calendar.events";

/**
 * Performs code-for-token exchange on the server with Google's token endpoint.
 * Enforces scope validation and per-service record isolation.
 */
export async function exchangeGoogleAuthorizationCode(
  code: string,
  userUid: string,
  service: "gmail" | "calendar" | "unified" = "unified"
): Promise<{
  access_token: string;
  expires_in: number;
  connectedEmail: string | null;
  scope: string;
  grantedScopes: string[];
  gmailGranted: boolean;
  calendarGranted: boolean;
  gmailError: string | null;
  calendarError: string | null;
}> {
  if (!code) {
    throw new Error("Authorization code is required.");
  }
  if (!userUid) {
    throw new Error("User UID is required for session security.");
  }

  const clientId = getServerGoogleClientId();
  const clientSecret = getServerGoogleClientSecret();
  const redirectUri = getServerGoogleRedirectUri();

  if (!clientId) {
    throw new Error(
      "GOOGLE_CLIENT_ID is missing on the server. Please add GOOGLE_CLIENT_ID to your environment variables (.env, AI Studio Secrets, or Vercel)."
    );
  }

  if (!clientSecret) {
    throw new Error(
      "GOOGLE_CLIENT_SECRET is missing on the server. Please add GOOGLE_CLIENT_SECRET from Google Cloud Console (APIs & Services -> Credentials) to your environment variables."
    );
  }

  const params = new URLSearchParams({
    code,
    client_id: clientId,
    client_secret: clientSecret,
    grant_type: "authorization_code",
    redirect_uri: redirectUri,
  });

  let tokenRes: Response;
  try {
    tokenRes = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: params.toString(),
    });
  } catch (netErr: any) {
    throw new Error(`Failed to reach Google OAuth server: ${netErr?.message || netErr}`);
  }

  const tokenData = await tokenRes.json().catch(() => ({}));

  if (!tokenRes.ok || tokenData.error) {
    const friendlyMsg = formatGoogleOAuthError(tokenData);
    updateServerOAuthMetadata(userUid, service, { lastError: friendlyMsg });
    throw new Error(friendlyMsg);
  }

  const { access_token, refresh_token, expires_in, scope } = tokenData;

  // Parse and log granted scopes on the server (never log the token itself)
  const scopeStr = typeof scope === "string" ? scope.trim() : "";
  const grantedScopes = scopeStr ? scopeStr.split(/\s+/).filter(Boolean) : [];

  const hasGmailScope = grantedScopes.some((s) => s.includes("gmail.readonly"));
  const hasCalendarScope = grantedScopes.some((s) => s.includes("calendar.events") || s.includes("calendar.readonly"));

  console.log(`[Google OAuth Server] Token exchange for user: ${userUid}`);
  console.log(`[Google OAuth Server] Scope string returned by Google: "${scopeStr}"`);
  console.log(`[Google OAuth Server] Granted scopes (${grantedScopes.length}): ${JSON.stringify(grantedScopes)}`);
  console.log(`[Google OAuth Server] gmail.readonly granted: ${hasGmailScope}, calendar.events granted: ${hasCalendarScope}`);

  if (!hasGmailScope) {
    console.log(`[Google OAuth Server] Missing scope: ${REQUIRED_GMAIL_SCOPE}`);
  }
  if (!hasCalendarScope) {
    console.log(`[Google OAuth Server] Missing scope: ${REQUIRED_CALENDAR_SCOPE}`);
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

  const gmailError = !hasGmailScope
    ? "Google didn't grant Gmail access. On the Google screen, tick all the checkboxes, then try again."
    : null;

  const calendarError = !hasCalendarScope
    ? "Google didn't grant Calendar access. On the Google screen, tick all the checkboxes, then try again."
    : null;

  // Store tokens per user and per service (separate records for gmail and calendar).
  // Connecting one must NEVER overwrite or invalidate the other.
  // If no new refresh token is returned by Google, keep the existing one!

  if (hasGmailScope) {
    const existingGmail = getServerOAuthToken(userUid, "gmail", false);
    const finalRefreshToken = refresh_token || existingGmail?.refreshToken || "";
    saveServerOAuthToken({
      userUid,
      service: "gmail",
      refreshToken: finalRefreshToken,
      connectedEmail,
      scopes: grantedScopes,
      updatedAt: now,
      lastSyncTime: now,
      lastError: null,
    });
  } else {
    // If Gmail scope not granted, record error on Gmail service
    updateServerOAuthMetadata(userUid, "gmail", {
      lastError: gmailError,
      scopes: grantedScopes,
    });
  }

  if (hasCalendarScope) {
    const existingCal = getServerOAuthToken(userUid, "calendar", false);
    const finalRefreshToken = refresh_token || existingCal?.refreshToken || "";
    saveServerOAuthToken({
      userUid,
      service: "calendar",
      refreshToken: finalRefreshToken,
      connectedEmail,
      scopes: grantedScopes,
      updatedAt: now,
      lastSyncTime: now,
      lastError: null,
    });
  } else {
    // If Calendar scope not granted, record error on Calendar service
    updateServerOAuthMetadata(userUid, "calendar", {
      lastError: calendarError,
      scopes: grantedScopes,
    });
  }

  return {
    access_token,
    expires_in: expires_in || 3599,
    connectedEmail,
    scope: scopeStr,
    grantedScopes,
    gmailGranted: hasGmailScope,
    calendarGranted: hasCalendarScope,
    gmailError,
    calendarError,
  };
}

/**
 * Refreshes an expired access token using the stored refresh token.
 * Retries once on 401/network issues before failing.
 */
export async function refreshGoogleAccessToken(
  userUid: string,
  service: "gmail" | "calendar" | "unified" = "unified",
  retryAttempt: number = 0
): Promise<{
  access_token: string;
  expires_in: number;
  connectedEmail: string | null;
}> {
  if (!userUid) {
    throw new Error("User UID is required for token refresh.");
  }

  const stored = getServerOAuthToken(userUid, service);
  if (!stored || !stored.refreshToken) {
    const errMsg = `No refresh token stored for ${service}. Please click Reconnect.`;
    updateServerOAuthMetadata(userUid, service, { lastError: errMsg });
    const err: any = new Error(errMsg);
    err.code = "reconnect_required";
    throw err;
  }

  const clientId = getServerGoogleClientId();
  const clientSecret = getServerGoogleClientSecret();

  if (!clientId || !clientSecret) {
    const errMsg = "GOOGLE_CLIENT_ID or GOOGLE_CLIENT_SECRET is missing on the server. Please configure them in your environment variables.";
    updateServerOAuthMetadata(userUid, service, { lastError: errMsg });
    throw new Error(errMsg);
  }

  const params = new URLSearchParams({
    client_id: clientId,
    client_secret: clientSecret,
    refresh_token: stored.refreshToken,
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
    if (retryAttempt === 0) {
      await new Promise((r) => setTimeout(r, 500));
      return refreshGoogleAccessToken(userUid, service, 1);
    }
    throw new Error(`Token refresh network issue: ${netErr?.message || netErr}`);
  }

  const refreshData = await refreshRes.json().catch(() => ({}));

  if (!refreshRes.ok || refreshData.error) {
    if (
      refreshData.error === "invalid_grant" ||
      refreshData.error === "unauthorized_client" ||
      refreshRes.status === 401
    ) {
      deleteServerOAuthToken(userUid, service);
      const errMsg = `Google ${service} connection expired or was revoked. Please reconnect.`;
      const err: any = new Error(errMsg);
      err.code = "reconnect_required";
      throw err;
    }

    if (retryAttempt === 0) {
      await new Promise((r) => setTimeout(r, 500));
      return refreshGoogleAccessToken(userUid, service, 1);
    }

    const friendlyMsg = formatGoogleOAuthError(refreshData);
    updateServerOAuthMetadata(userUid, service, { lastError: friendlyMsg });
    throw new Error(friendlyMsg);
  }

  const now = new Date().toISOString();
  updateServerOAuthMetadata(userUid, service, {
    lastSyncTime: now,
    lastError: null,
  });

  return {
    access_token: refreshData.access_token,
    expires_in: refreshData.expires_in || 3599,
    connectedEmail: stored.connectedEmail,
  };
}

/**
 * Revokes Google access for a user and cleans up stored tokens per service.
 * Disconnecting one service never invalidates or deletes the other.
 */
export async function revokeGoogleAccessToken(
  userUid: string,
  service: "gmail" | "calendar" | "unified" | "all" = "all"
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

  // Service-specific disconnection
  const targetToken = getServerOAuthToken(userUid, service as any, false);
  const otherService = service === "gmail" ? "calendar" : "gmail";
  const otherToken = getServerOAuthToken(userUid, otherService as any, false);

  // If the other service does not share the exact same refresh token or if it's unique, revoke
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
 * Returns Setup Check diagnostics strictly as booleans and non-sensitive timestamps.
 * NEVER returns secret values or raw tokens.
 */
export function getGoogleSetupCheck(userUid?: string): GoogleSetupCheckResult {
  const clientId = getServerGoogleClientId();
  const clientSecret = getServerGoogleClientSecret();
  const redirectUri = getServerGoogleRedirectUri();

  const clientIdConfigured = Boolean(clientId && clientId.includes(".apps.googleusercontent.com"));
  const clientSecretConfigured = Boolean(clientSecret && clientSecret.length > 5);
  const redirectUriConfigured = Boolean(redirectUri && redirectUri.length > 0);

  let gmailConnected = false;
  let gmailScopeGranted = false;
  let gmailRefreshTokenStored = false;
  let gmailLastSync: string | null = null;
  let gmailLastError: string | null = null;

  let calendarConnected = false;
  let calendarScopeGranted = false;
  let calendarRefreshTokenStored = false;
  let calendarLastSync: string | null = null;
  let calendarLastError: string | null = null;

  if (userUid) {
    // Check Gmail
    const gmailToken = getServerOAuthToken(userUid, "gmail") || getServerOAuthToken(userUid, "unified");
    if (gmailToken) {
      gmailRefreshTokenStored = Boolean(gmailToken.refreshToken);
      const scopes = Array.isArray(gmailToken.scopes) ? gmailToken.scopes : [];
      gmailScopeGranted = scopes.some((s) => s.includes("gmail.readonly"));
      gmailConnected = Boolean(gmailRefreshTokenStored && gmailScopeGranted);
      gmailLastSync = gmailToken.lastSyncTime || gmailToken.updatedAt || null;
      gmailLastError = gmailToken.lastError || null;
    }

    // Check Calendar
    const calToken = getServerOAuthToken(userUid, "calendar") || getServerOAuthToken(userUid, "unified");
    if (calToken) {
      calendarRefreshTokenStored = Boolean(calToken.refreshToken);
      const scopes = Array.isArray(calToken.scopes) ? calToken.scopes : [];
      calendarScopeGranted = scopes.some((s) => s.includes("calendar.events") || s.includes("calendar.readonly"));
      calendarConnected = Boolean(calendarRefreshTokenStored && calendarScopeGranted);
      calendarLastSync = calToken.lastSyncTime || calToken.updatedAt || null;
      calendarLastError = calToken.lastError || null;
    }
  }

  return {
    clientIdConfigured,
    clientSecretConfigured,
    redirectUriConfigured,
    gmailConnected,
    gmailScopeGranted,
    gmailRefreshTokenStored,
    gmailLastSync,
    gmailLastError,
    calendarConnected,
    calendarScopeGranted,
    calendarRefreshTokenStored,
    calendarLastSync,
    calendarLastError,
  };
}

