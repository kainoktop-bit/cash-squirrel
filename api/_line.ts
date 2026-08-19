const LINE_PUSH_URL = 'https://api.line.me/v2/bot/message/push';

// Ad-hoc recipient list, not a per-user account-linking system: maps an app-user's email to
// their LINE user ID. Format: "email1:lineUserId1,email2:lineUserId2". Emails not listed here
// simply get no LINE message -- email delivery is unaffected either way.
function getLineRecipients(): Record<string, string> {
  const raw = process.env.LINE_RECIPIENTS;
  if (!raw) return {};
  const map: Record<string, string> = {};
  for (const pair of raw.split(',')) {
    const [email, userId] = pair.split(':').map((s) => s.trim());
    if (email && userId) map[email.toLowerCase()] = userId;
  }
  return map;
}

export async function sendLineMessageToEmail(email: string, text: string): Promise<boolean> {
  const token = process.env.LINE_CHANNEL_ACCESS_TOKEN;
  if (!token) return false;

  const lineUserId = getLineRecipients()[email.toLowerCase()];
  if (!lineUserId) return false; // this email isn't mapped to a LINE account

  try {
    const res = await fetch(LINE_PUSH_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        to: lineUserId,
        messages: [{ type: 'text', text: text.slice(0, 4900) }], // LINE caps text messages at 5000 chars
      }),
    });
    if (!res.ok) {
      console.error(`sendLineMessageToEmail: LINE API error for ${email}:`, await res.text());
      return false;
    }
    return true;
  } catch (err) {
    console.error(`sendLineMessageToEmail: failed to send to ${email}:`, err);
    return false;
  }
}
