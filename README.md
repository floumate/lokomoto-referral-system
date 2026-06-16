# Lokomoto Centar — Giveaway Referral System

Referral sistem za Lokomoto giveaway. Jedna prijava = lični referral link. Korisnik
deli link, prijave preko njegovog linka se broje, dashboard prikazuje broj dovedenih +
leaderboard (top 50). Adaptirano sa Tibor referral sistema (Supabase + Vercel),
prilagođeno Lokomoto stilu. Bez nagrada/pobednika za sada (dodaje se naknadno).

## Arhitektura

```
Giveaway forma (lokomoto-giveaway repo, iframe na Webflow stranici)
  ├─ na učitavanju: hvata ?r=KOD iz URL-a → localStorage
  └─ na slanju: stash {email,name,ref} → localStorage + POST /api/signup
        ▼
Thank-you stranica (lokomoto-giveaway/thank-you.html, iframe)
  └─ čita {email,name,ref} → POST /api/signup (idempotentno) → prikaže karticu
       "Tvoj referral link [Kopiraj]" + link na dashboard
        ▼
/api/signup (Vercel) → Supabase create_signup (idempotentno po emailu)
        ▼
Dashboard (Vercel: / → dashboard/index.html, pristup sa ?t=TOKEN)
  └─ rpc/get_dashboard + rpc/get_leaderboard → broj dovedenih, rank, lista, top 50
```

## Repo layout

```
supabase/schema.sql      ← pokreni JEDNOM u Supabase SQL Editor-u
api/signup.js            ← Vercel serverless (POST /api/signup)
dashboard/index.html     ← dashboard + leaderboard (servira se na /?t=TOKEN)
vercel.json, package.json
```

## Deploy

### 1. Supabase (nov projekat: "Lokomoto | Referral System")

1. SQL Editor → New query → pejstuj ceo `supabase/schema.sql` → Run.
2. Settings → API: uzmi **Project URL** + **publishable** (`sb_publishable_`) + **secret** (`sb_secret_`).
   - publishable je javan po dizajnu → ide u `dashboard/index.html` (`SUPABASE_ANON_KEY`)
   - secret ide SAMO u Vercel env (`SUPABASE_SECRET_KEY`)

### 2. Vercel (nov projekat)

1. New Project → Import `floumate/lokomoto-referral-system` (Framework: Other).
2. Environment Variables:

   | Variable | Vrednost |
   |---|---|
   | `SUPABASE_URL` | `https://xxxx.supabase.co` |
   | `SUPABASE_SECRET_KEY` | `sb_secret_...` |
   | `GIVEAWAY_LANDING_URL` | URL giveaway stranice (gde je forma), npr. `https://lokomoto.rs/giveaway` |
   | `DASHBOARD_BASE_URL` | deploy URL ovog projekta, npr. `https://lokomoto-referral-system.vercel.app` |

3. Deploy. Zapamti stvarni deploy URL.

### 3. Popuni config (4 mesta)

Posle deploy-a, upiši vrednosti:

- **`dashboard/index.html`** (vrh `<script>`): `SUPABASE_URL`, `SUPABASE_ANON_KEY` (publishable), `LANDING_URL`.
- **`lokomoto-giveaway/js/form.js`**: `REFERRAL_API = 'https://<deploy>/api/signup'`.
- **`lokomoto-giveaway/thank-you.html`**: isti `REFERRAL_API`.
- **`api/signup.js`** (`ALLOWED_ORIGINS`): dodaj domen sa kog se forma servira ako nije `floumate.github.io`.

### 4. Webflow giveaway embed (prosleđivanje ?r= u iframe)

Da bi forma (u iframe-u) videla referral kod sa Webflow URL-a, embed za **giveaway stranicu** treba ovako:

```html
<iframe id="lkGiveaway"
  src="https://floumate.github.io/lokomoto-giveaway/"
  title="Lokomoto Giveaway prijava"
  style="width:100%; height:100dvh; min-height:700px; border:0; display:block;"
  loading="lazy"></iframe>

<script>
  (function () {
    var ifr = document.getElementById('lkGiveaway');
    // 1) Prosledi ?r=KOD iz Webflow URL-a u iframe (da forma zna ko je preporučio)
    var r = new URLSearchParams(location.search).get('r');
    if (r && ifr) {
      var base = ifr.getAttribute('src');
      ifr.setAttribute('src', base + (base.indexOf('?') > -1 ? '&' : '?') + 'r=' + encodeURIComponent(r));
    }
    // 2) Kad forma javi da je poslata → idi na Thank You stranicu
    window.addEventListener('message', function (e) {
      if (e.data === 'lokomoto-giveaway:submitted') window.location.href = '/thank-you';
    });
  })();
</script>
```

## Testiranje

1. **Supabase smoke test** (SQL Editor):
   ```sql
   select * from create_signup('test@test.com', 'Test', null, 'User');
   select * from signups;
   ```
2. **Dashboard**: `https://<deploy>/?t=<dashboard_token>` (`/?demo=1` za demo bez baze).
3. **End-to-end**: otvori giveaway sa `?r=<ref_code>` u privatnom prozoru, prijavi se
   drugim emailom, prođi do thank-you → widget pokazuje NJEGOV link; u Supabase novi red
   sa `referred_by = <tvoj kod>`; tvoj dashboard pokazuje +1.

## Posle giveaway-a — izvlačenje

Pobednik se vuče nasumično iz `signups`. Mehanika nagrada/pobednika se dodaje naknadno
(za sada sistem samo broji preporuke i prikazuje leaderboard).

```sql
-- nasumičan pobednik
select email, first_name, last_name, ref_code from signups order by random() limit 1;
```

## Gotchas

- **CORS**: dozvoljeni origini su u `api/signup.js` (`ALLOWED_ORIGINS`).
- **Email je jedini ključ identiteta** — ista osoba sa drugim emailom = novi red.
- **localStorage** je deljen između giveaway i thank-you iframe-a jer su oba na istom
  origin-u (`floumate.github.io`) — tako thank-you widget čita prijavu sa forme.
- **Supabase free tier** pauzira projekat posle ~7 dana neaktivnosti — pre kampanje proveri da je aktivan.
