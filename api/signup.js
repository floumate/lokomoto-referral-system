// Vercel serverless function: POST /api/signup
// Poziva se iz Lokomoto giveaway forme (pri slanju) i sa thank-you stranice (browser fetch).
// Upsert prijave u Supabase (idempotentno po emailu), vraća lični ref kod + share/dashboard linkove.
//
// ENV VARS (Vercel → Project → Settings → Environment Variables):
//   SUPABASE_URL          npr. https://xxxx.supabase.co
//   SUPABASE_SECRET_KEY   sb_secret_... (server-only, NIKAD u frontend)
//   GIVEAWAY_LANDING_URL  bazni URL giveaway stranice na koju vodi referral link
//                         (npr. https://lokomoto.rs/giveaway). Telo zahteva može da ga override-uje.
//   DASHBOARD_BASE_URL    deploy URL ovog projekta (npr. https://lokomoto-referral-system.vercel.app)

export const config = { runtime: 'nodejs' };

// Origini kojima je dozvoljeno da zovu API (forma + thank-you se serviraju sa GitHub Pages).
// Dodaj Webflow/custom domen kad bude poznat.
const ALLOWED_ORIGINS = [
  'https://floumate.github.io',
  // 'https://lokomoto.rs',
  // 'https://www.lokomoto.rs',
];

export default async function handler(req, res) {
  const origin = req.headers.origin || '';
  const allowedOrigin = ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0];

  res.setHeader('Access-Control-Allow-Origin', allowedOrigin);
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.setHeader('Vary', 'Origin');

  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'method_not_allowed' });

  let body = req.body;
  if (typeof body === 'string') {
    try { body = JSON.parse(body); } catch { body = {}; }
  }
  body = body || {};

  const email = cleanString(body.email).toLowerCase();
  const ref = cleanString(body.ref);

  // Ime stiže ili kao puno ime ("name") ili razdvojeno (first_name/last_name)
  let firstName = cleanString(body.firstName || body.first_name);
  let lastName = cleanString(body.lastName || body.last_name);
  if (!firstName) {
    const split = splitName(cleanString(body.name));
    firstName = split.firstName || '';
    lastName = lastName || split.lastName || '';
  }

  // Telo ima prednost (jedan API može da služi više stranica), env je fallback.
  const landingUrl = cleanString(body.landingUrl) || cleanString(process.env.GIVEAWAY_LANDING_URL);

  if (!email || !email.includes('@')) {
    return res.status(400).json({ error: 'invalid_email' });
  }
  if (!landingUrl) {
    return res.status(400).json({ error: 'missing_config' });
  }

  let signup;
  try {
    signup = await createSignup({ email, firstName, lastName, ref });
  } catch (err) {
    console.error('supabase create_signup failed', err);
    return res.status(500).json({ error: 'supabase_error' });
  }

  const dashboardUrl = `${process.env.DASHBOARD_BASE_URL}/?t=${signup.dashboard_token}`;
  const shareUrl = `${landingUrl}${landingUrl.includes('?') ? '&' : '?'}r=${signup.ref_code}`;

  return res.status(200).json({
    ok: true,
    refCode: signup.ref_code,
    dashboardUrl,
    shareUrl,
    isNew: signup.is_new,
    firstName: firstName || null,
  });
}

// ----- helpers -----

async function createSignup({ email, firstName, lastName, ref }) {
  const url = `${process.env.SUPABASE_URL}/rest/v1/rpc/create_signup`;
  const resp = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      apikey: process.env.SUPABASE_SECRET_KEY,
      Authorization: `Bearer ${process.env.SUPABASE_SECRET_KEY}`,
    },
    body: JSON.stringify({
      p_email: email,
      p_first_name: firstName || null,
      p_last_name: lastName || null,
      p_referred_by: ref || null,
    }),
  });

  if (!resp.ok) {
    const txt = await resp.text();
    throw new Error(`supabase ${resp.status}: ${txt}`);
  }

  const rows = await resp.json();
  const row = Array.isArray(rows) ? rows[0] : rows;
  if (!row) throw new Error('supabase returned no row');
  return {
    ref_code: row.out_ref_code,
    dashboard_token: row.out_dashboard_token,
    is_new: row.out_is_new,
    referred_by: row.out_referred_by,
  };
}

function cleanString(v) {
  if (typeof v !== 'string') return '';
  return v.trim();
}

function splitName(full) {
  if (!full) return { firstName: null, lastName: null };
  const parts = full.trim().split(/\s+/);
  if (parts.length === 1) return { firstName: parts[0], lastName: null };
  return { firstName: parts[0], lastName: parts.slice(1).join(' ') };
}
