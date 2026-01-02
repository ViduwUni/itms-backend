let cached = { token: null, exp: 0 };

async function getGraphToken() {
  const now = Date.now();
  if (cached.token && cached.exp - 30_000 > now) return cached.token;

  const tenant = process.env.AZURE_TENANT_ID;
  const clientId = process.env.AZURE_CLIENT_ID;
  const clientSecret = process.env.AZURE_CLIENT_SECRET;

  const url = `https://login.microsoftonline.com/${tenant}/oauth2/v2.0/token`;

  const body = new URLSearchParams();
  body.set("client_id", clientId);
  body.set("client_secret", clientSecret);
  body.set("grant_type", "client_credentials");
  body.set("scope", "https://graph.microsoft.com/.default");

  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });

  const data = await res.json().catch(() => ({}));
  if (!res.ok)
    throw new Error(data?.error_description || "Failed to get Graph token");

  cached.token = data.access_token;
  cached.exp = now + (data.expires_in || 3600) * 1000;
  return cached.token;
}

async function sendMail({ to, subject, html }) {
  const token = await getGraphToken();

  // App-only: use /users/{sender}/sendMail (not /me) :contentReference[oaicite:3]{index=3}
  const sender = process.env.SENDER_EMAIL;
  const url = `https://graph.microsoft.com/v1.0/users/${encodeURIComponent(
    sender
  )}/sendMail`;

  const payload = {
    message: {
      subject,
      body: { contentType: "HTML", content: html },
      toRecipients: to.map((email) => ({ emailAddress: { address: email } })),
    },
    saveToSentItems: true,
  };

  const res = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });

  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data?.error?.message || "Graph sendMail failed");
  }
}

// Fire-and-forget helper (don’t block the API response)
export function sendMailSafe(args) {
  sendMail(args).catch((e) => console.error("[mail] send failed:", e.message));
}
