// functions/api/contact.js
// Cloudflare Pages Function — handles POST /api/contact
// Emails the contact-form submission to devin@devinstrategic.com with a true
// high-priority header, sent via the Resend transactional API.
//
// SETUP (one time):
//   1. Resend: create an account, verify the domain devinstrategic.com
//      (add the SPF/DKIM DNS records it gives you), then create an API key.
//   2. Cloudflare dashboard → your Pages project → Settings →
//      Environment variables → add for BOTH Production and Preview:
//        RESEND_API_KEY = <the key>
//      (Set it here in the dashboard — never hardcode it or commit it to git.)
//   3. Deploy. No packages to install; fetch is built into the Workers runtime.
//
// File location matters: this must sit at  functions/api/contact.js  so
// Cloudflare Pages serves it at the /api/contact route the form posts to.

const RECIPIENT = 'devin@devinstrategic.com';
// Must be an address on a domain you've verified in Resend:
const FROM = 'Devin Strategic Site <site@devinstrategic.com>';

function escapeHtml(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function json(data, status) {
  return new Response(JSON.stringify(data), {
    status: status || 200,
    headers: { 'Content-Type': 'application/json' },
  });
}

// Only POST reaches here; Pages returns 405 for other methods automatically.
export async function onRequestPost(context) {
  const { request, env } = context;

  let body;
  try { body = await request.json(); } catch { body = {}; }
  body = body || {};

  const name = String(body.name || '').trim();
  const email = String(body.email || '').trim();
  const company = String(body.company || '').trim();
  const truth = String(body.truth || '').trim();

  // Server-side validation — never trust the client.
  const emailOk = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
  if (!name || !emailOk || !truth) {
    return json({ error: 'Name, a valid email, and a message are required.' }, 400);
  }

  const apiKey = env.RESEND_API_KEY;
  if (!apiKey) {
    console.error('RESEND_API_KEY is not set.');
    return json({ error: 'Email service is not configured.' }, 500);
  }

  const subject = `[HIGH PRIORITY] Positioning Sprint inquiry — ${name}${company ? ` (${company})` : ''}`;

  const text = [
    'Priority: HIGH',
    '',
    `Name: ${name}`,
    `Email: ${email}`,
    `Company: ${company || '—'}`,
    '',
    "What's true right now?",
    truth,
  ].join('\n');

  const html = `<div style="font-family:Arial,Helvetica,sans-serif;font-size:15px;line-height:1.5;color:#111">
    <p style="margin:0 0 12px"><strong style="color:#b45309">Priority: HIGH</strong></p>
    <p style="margin:0 0 12px">
      <strong>Name:</strong> ${escapeHtml(name)}<br>
      <strong>Email:</strong> <a href="mailto:${escapeHtml(email)}">${escapeHtml(email)}</a><br>
      <strong>Company:</strong> ${escapeHtml(company || '—')}
    </p>
    <p style="margin:0"><strong>What's true right now?</strong><br>${escapeHtml(truth).replace(/\n/g, '<br>')}</p>
  </div>`;

  try {
    const r = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: FROM,
        to: [RECIPIENT],
        reply_to: email,          // replying goes straight to the prospect
        subject,
        text,
        html,
        headers: {                // the real high-priority flags
          'X-Priority': '1 (Highest)',
          'X-MSMail-Priority': 'High',
          'Importance': 'high',
        },
      }),
    });

    if (!r.ok) {
      const detail = await r.text().catch(() => '');
      console.error('Resend error', r.status, detail);
      return json({ error: 'Message could not be sent right now.' }, 502);
    }

    return json({ ok: true });
  } catch (err) {
    console.error('Send failed', err);
    return json({ error: 'Message could not be sent right now.' }, 502);
  }
}
