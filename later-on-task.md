# Later-on tasks

Kaam jo abhi skip kiya hai aur baad mein karna hai. Har task ke saath likha hai kyun ruka aur kaise karna hai.

| # | Task | Status | Kyun ruka |
|---|------|--------|-----------|
| 1 | Outlook (Microsoft Entra) | ⏸ Pending | Microsoft ki website: signup block, phir Entra par AADSTS16000 (personal account ki directory nahi) |
| 2 | Notion | ⏸ Pending | Notion developer website: page poora load nahi hota, "Create connection" button disabled |

Baaki connected apps ready hain (keys `backend/.env` mein): **Gmail, Jira, Linear, Todoist**.

---

## 1. Outlook (Microsoft Entra) connect karna — user-flow §07

**Status:** Pending (added 2026-11-19)

**Kyun ruka:** Microsoft account banate waqt "Account creation has been blocked — unusual activity" error aaya
(Gmail address se Microsoft account signup par). Outlook optional hai: keys na hon to app mein Outlook "Coming soon"
dikhta hai; Gmail, Notion, Jira wagairah normal chalte hain.

**Update (2026-11-19, 2nd try):** Naya Microsoft account ban gaya (account.microsoft.com par login ho gaya), lekin
https://entra.microsoft.com par **App registrations** kholte hi "Interaction required" error aaya:
`AADSTS16000: User account ... from identity provider 'live.com' does not exist in tenant 'Microsoft Services'`.
Matlab: **personal Microsoft account ki apni koi Entra directory (tenant) nahi hai**, isliye wo seedha app register
nahi kar sakta. Iska hal (inme se ek):
- **Free Azure account** banao usi Microsoft account se: https://azure.microsoft.com/free (card sirf verify hota hai).
  Isse "Default Directory" ban jaati hai; phir https://portal.azure.com → *Microsoft Entra ID* → *App registrations*.
- Ya kisi **company / school Microsoft 365 account** (jiski apni directory ho) se app register karwao.
- "Sign in again" ya "Ignore" dabane se ye theek nahi hota.

**Code mein kuch nahi karna:** backend + mobile mein Outlook ka poora support already hai
(`backend/src/modules/connections/oauth-providers.ts`, `backend/src/modules/email/email-providers.ts`). Sirf keys chahiye.

**Jab karna ho:**

1. Microsoft account banao (block se bachne ke liye):
   - 24–48 ghante baad try karo; VPN / ad-blocker band; mobile hotspot ya doosra browser (Edge / incognito).
   - Gmail ki jagah naya `@outlook.com` email banao: https://signup.live.com → "Get a new email address" → phone se verify.
   - Ya team mein kisi ke company Microsoft 365 account se app register karwa lo.
2. App register karo: https://entra.microsoft.com/#view/Microsoft_AAD_RegisteredApps/ApplicationsListBlade
   → **New registration**
   - Name: `Remi`
   - Supported account types: **Accounts in any organizational directory and personal Microsoft accounts**
   - Redirect URI: platform **Web** → `http://localhost:4000/api/v1/integrations/oauth/callback`
     (production: `https://<api-domain>/api/v1/integrations/oauth/callback`)
   - Agar "directory nahi hai" jaisa error aaye: free Azure account banao (https://azure.microsoft.com/free) taaki
     apni directory ban jaye. App registration free hai.
3. **Overview** → *Application (client) ID* copy → `MICROSOFT_CLIENT_ID`
4. **Certificates & secrets** → *New client secret* → **Value** copy (sirf ek baar dikhta hai) → `MICROSOFT_CLIENT_SECRET`.
   Expiry date yaad rakhna.
5. **API permissions** → *Add a permission* → *Microsoft Graph* → *Delegated*:
   `Mail.Read`, `Mail.Send`, `User.Read`, `offline_access`, `openid`, `email` → *Add permissions*.
6. `backend/.env` mein:
   ```env
   MICROSOFT_CLIENT_ID=...
   MICROSOFT_CLIENT_SECRET=...
   MICROSOFT_TENANT=common
   ```
   Production ke liye `backend/.env.production` mein bhi.
7. API aur worker restart karo (`npm run start:dev`, `node dist/worker.js`).
8. Test: app → Profile → Connected apps → Outlook → Connect → "Read and send replies I approve".

---

## 2. Notion connect karna — user-flow §08

**Status:** Pending (added 2026-11-19)

**Kyun ruka:** https://app.notion.com/developers/connections par **New connection** form bhar diya (Name `Remi`,
OAuth, Any workspace, redirect URI `http://localhost:4000/api/v1/integrations/oauth/callback`) par **Create connection**
button disabled raha, aur developer page poora load nahi ho raha tha (list grey boxes mein atki thi).
2026-11-19 ko dobara bhi website ki dikkat ki wajah se pending rakha.

**Code mein kuch nahi karna:** Notion ka support already hai (`backend/src/modules/tools/tool-providers.ts`). Sirf keys chahiye.

**Jab karna ho, pehle ye try karo:**

1. Browser ka ad-blocker / shield extension `notion.so` ke liye off; **Ctrl + Shift + R**; ya Incognito / Edge mein
   https://app.notion.com/developers/connections kholo. VPN band.
2. Form mein upar scroll karke dekho koi **Workspace / Owner workspace** dropdown khali to nahi.
3. Public (OAuth) connection sirf **workspace owner** bana sakta hai: zarurat ho to apna free workspace banao.
4. Agar Notion `http://localhost` redirect nahi maanta: test ke liye `https://example.com/callback` daal ke dekho button
   enable hota hai ya nahi. Hota hai to tunnel chalao (`npx cloudflared tunnel --url http://localhost:4000`), Notion mein
   `https://<tunnel>/api/v1/integrations/oauth/callback` daalo, aur `backend/.env` mein
   `INTEGRATIONS_REDIRECT_URI` usi URL par set karo.

**Connection ban jaane ke baad:**

1. **New connection** → Name `Remi` → **OAuth** → Installable in **Any workspace** → Redirect URI (upar wala) →
   company / website / privacy / terms / support email (agar maange) → **Create connection**.
2. **Capabilities:** Read content, Update content, Insert content (optional: Read user information including email).
   **Save**.
3. **OAuth Client ID** aur **OAuth Client Secret** copy karke `backend/.env` mein (chat mein mat bhejna):
   ```env
   NOTION_CLIENT_ID=...
   NOTION_CLIENT_SECRET=...
   ```
4. API aur worker restart karo (`npm run start:dev`, `node dist/worker.js`).
5. Notion mein test database banao, jaise **"Remi tasks"**: columns **Name** (title), **Due** (Date), **Status**
   (Status jismein "Done" ho, ya Checkbox).
6. App → Profile → Connected apps → Notion → Connect → page picker mein **"Remi tasks"** zaroor tick karo → Allow access.
   Phir Notion card par **Choose default project** → Remi tasks.
7. Test: kisi to-do par long-press → **Send to Notion**; Talk mein "save this summary to Notion…"; Notion mein Status
   Done karo → ~15 min mein app mein bhi done.
