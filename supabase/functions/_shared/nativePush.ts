import { importPKCS8, SignJWT } from "npm:jose@5.10.0";

interface FirebaseServiceAccount {
  project_id: string;
  client_email: string;
  private_key: string;
  token_uri?: string;
}

interface NativePushPayload {
  title: string;
  body: string;
  url: string;
  tag: string;
}

interface DeviceToken {
  id: string;
  user_id: string;
  token: string;
}

let cachedAccessToken = "";
let cachedAccessTokenExpiresAt = 0;

function getServiceAccount(): FirebaseServiceAccount | null {
  const raw = Deno.env.get("FIREBASE_SERVICE_ACCOUNT_JSON");
  if (!raw) return null;
  try {
    const account = JSON.parse(raw) as FirebaseServiceAccount;
    return account.project_id && account.client_email && account.private_key ? account : null;
  } catch {
    return null;
  }
}

async function getFirebaseAccessToken(account: FirebaseServiceAccount): Promise<string> {
  if (cachedAccessToken && Date.now() < cachedAccessTokenExpiresAt - 60_000) return cachedAccessToken;

  const now = Math.floor(Date.now() / 1000);
  const key = await importPKCS8(account.private_key, "RS256");
  const assertion = await new SignJWT({ scope: "https://www.googleapis.com/auth/firebase.messaging" })
    .setProtectedHeader({ alg: "RS256", typ: "JWT" })
    .setIssuer(account.client_email)
    .setSubject(account.client_email)
    .setAudience(account.token_uri || "https://oauth2.googleapis.com/token")
    .setIssuedAt(now)
    .setExpirationTime(now + 3600)
    .sign(key);

  const response = await fetch(account.token_uri || "https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion,
    }),
  });
  if (!response.ok) throw new Error(`Firebase authentication failed (${response.status})`);

  const result = await response.json();
  cachedAccessToken = result.access_token;
  cachedAccessTokenExpiresAt = Date.now() + Number(result.expires_in || 3600) * 1000;
  return cachedAccessToken;
}

// Sends FCM HTTP v1 notifications to installed Android apps. Browser/PWA
// delivery remains in push.ts; both paths are called for the same alert.
export async function sendNativePushToUsers(
  // deno-lint-ignore no-explicit-any
  supabase: any,
  userIds: string[],
  buildPayload: (userId: string) => NativePushPayload,
): Promise<number> {
  if (userIds.length === 0) return 0;
  const account = getServiceAccount();
  if (!account) return 0;

  const { data: rows } = await supabase
    .from("device_push_tokens")
    .select("id, user_id, token")
    .in("user_id", userIds)
    .eq("platform", "android");
  const tokens = (rows ?? []) as DeviceToken[];
  if (tokens.length === 0) return 0;

  const accessToken = await getFirebaseAccessToken(account);
  let sent = 0;
  await Promise.all(tokens.map(async (device) => {
    const payload = buildPayload(device.user_id);
    const response = await fetch(`https://fcm.googleapis.com/v1/projects/${account.project_id}/messages:send`, {
      method: "POST",
      headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        message: {
          token: device.token,
          notification: { title: payload.title, body: payload.body },
          data: { url: payload.url, tag: payload.tag },
          android: {
            priority: "high",
            notification: {
              channel_id: "job_alerts_v2",
              color: "#DC2626",
              default_sound: true,
              notification_count: 1,
              tag: payload.tag,
            },
          },
        },
      }),
    });

    if (response.ok) {
      sent++;
      return;
    }

    const error = await response.json().catch(() => ({}));
    const status = error?.error?.status;
    if (status === "UNREGISTERED" || response.status === 404) {
      await supabase.from("device_push_tokens").delete().eq("id", device.id);
    }
  }));
  return sent;
}
