# Guide: Remi app ko khud run karna aur phone se wirelessly connect karna

Ye guide **Windows PC + Android phone** ke liye hai. Phone ko USB cable ki zaroorat nahi: **Wireless debugging (ADB over Wi-Fi)** se phone PC se judta hai.

**Ek baar ka setup** (Part 1–3) sirf pehli baar karna hai. **Roz ka kaam** (Part 4) har baar app chalane par karna hai.

---

## Ye setup kaise kaam karta hai

```
 Phone (Remi app)  ──Wi-Fi / wireless ADB──►  PC
   localhost:8081  ───────────────────────►   Metro bundler (app ka JS code)   ← npx expo start
   localhost:4000  ───────────────────────►   Backend API (NestJS)             ← npm run start:dev
                                               Worker (emails, reminders, pushes) ← node dist/worker.js
                                               Postgres :5433 + Redis :6380      ← docker compose
```

`adb reverse` ki wajah se phone par `localhost:4000` seedha PC ke backend tak pahunchta hai. Isliye **Google sign-in, Gmail, Jira, Linear, Todoist connect** sab bina kisi tunnel ke chalte hain, kyunki Google sirf `localhost` ya `https` redirect maanta hai.

---

## Part 1: Ek baar ka setup (PC)

### 1.1 Ye cheezein install honi chahiye

| Cheez | Check command | Kahan se |
|---|---|---|
| Node.js 22+ | `node -v` | https://nodejs.org |
| Docker Desktop (chal raha ho) | `docker ps` | https://www.docker.com/products/docker-desktop |
| Java 17 | `java -version` | Android Studio ke saath aata hai |
| Android SDK + platform-tools (adb) | `adb version` | https://developer.android.com/studio |
| Git | `git --version` | https://git-scm.com |

`adb` command na mile to ise PATH mein jodo (PowerShell, ek baar):

```powershell
setx ANDROID_HOME "$env:LOCALAPPDATA\Android\Sdk"
setx PATH "$env:PATH;$env:LOCALAPPDATA\Android\Sdk\platform-tools"
```

Phir terminal band karke naya kholo aur `adb version` chalao.

### 1.2 Dependencies install karo (project root se)

```bash
cd backend
npm install
cd ../mobile
npm install
cd ..
```

### 1.3 Env files

- `backend/.env` pehle se bani hai (Google, Gemini, Jira, Linear, Todoist keys wagairah). Kabhi delete mat karna.
- `mobile/.env` mein ye line **aisi hi** rehni chahiye, kyunki wireless ADB ke saath `localhost` hi sahi hai:

  ```env
  EXPO_PUBLIC_API_URL=http://localhost:4000
  APP_ENV=development
  ```

  `.env` badlo to Metro restart karna padta hai (`npx expo start -c`).

### 1.4 Database ek baar taiyaar karo

```bash
docker compose up -d postgres redis
cd backend
npm run prisma:migrate     # saari migrations lagao
npm run db:seed            # sirf pehli baar: default settings, templates, admin
cd ..
```

---

## Part 2: Phone ko wirelessly PC se jodo (Android 11+)

PC aur phone **ek hi Wi-Fi** par hone chahiye.

### 2.1 Phone par Developer options aur Wireless debugging on karo

1. **Settings → About phone → Build number** par 7 baar tap karo. "You are now a developer" aayega.
2. **Settings → System → Developer options** (kuch phones mein *Additional settings → Developer options*):
   - **USB debugging**: ON
   - **Wireless debugging**: ON → "Allow on this network?" → **Allow**

### 2.2 Pair karo (sirf pehli baar)

Phone par **Wireless debugging** ke andar jao → **Pair device with pairing code**. Wahan dikhega:
- **Wi-Fi pairing code**, jaise `482913`
- **IP address & port**, jaise `192.168.1.23:37155` (ye **pairing port** hai)

PC par (PowerShell ya Git Bash):

```bash
adb pair 192.168.1.23:37155
# "Enter pairing code:" aaye to phone wala 6 digit code daalo → "Successfully paired"
```

### 2.3 Connect karo

Pairing popup band karo. **Wireless debugging** ki main screen par **IP address & port** dikhega, jaise `192.168.1.23:41289`. Ye **connect port** hai, jo pairing port se **alag** hota hai.

```bash
adb connect 192.168.1.23:41289
adb devices
# List mein   192.168.1.23:41289   device   dikhna chahiye
```

Phone ka IP aur port har baar Wi-Fi ya phone restart par badal sakta hai. Tab Wireless debugging screen se naya port dekh kar sirf `adb connect` dobara chalao. `adb pair` dobara nahi karna padta.

### 2.4 Phone par localhost ko PC se jodo

```bash
adb reverse tcp:4000 tcp:4000    # backend API
adb reverse tcp:8081 tcp:8081    # Metro (app ka JS)
adb reverse --list               # dono lines dikhni chahiye
```

`adb reverse` connection tootne par khatam ho jaata hai. Har `adb connect` ke baad ye dono lines dobara chalao.

---

## Part 3: App ka development build phone par install karo (pehli baar)

Ye app ka asli Android build bana kar phone par install karta hai. Pehli baar 5–15 minute lagte hain.

```bash
cd mobile
npx expo run:android --device
# Device list aaye to apna phone (192.168.x.x:port) chuno
```

Isse phone par **Remi** app install ho jaata hai aur Metro bhi start ho jaata hai.

Dobara build **tabhi** karna hai jab:
- koi naya native package add ho (`npx expo install …`), ya
- `app.config.ts` ya Expo SDK badle.

Normal code changes ke liye rebuild nahi chahiye.

---

## Part 4: Roz app chalane ke steps

**4 terminal** kholo, sab project root (`ai-reminder-tsk`) se.

### Terminal 1: Database (Docker)

```bash
docker compose up -d postgres redis
docker compose ps     # postgres aur redis "healthy" dikhne chahiye
```

### Terminal 2: Backend API

```bash
cd backend
npm run start:dev
# Ruko jab tak dikhe:  "API listening on :4000 (swagger on /docs)"
```

Check: browser mein http://localhost:4000/api/v1/health → `{"status":"ok",...}`

### Terminal 3: Worker (emails, reminders, pushes, tool sync)

API ke start hone ke **baad** (kyunki API ka build hi `dist/` banata hai):

```bash
cd backend
node dist/worker.js
# Dikhna chahiye:  "repeatable jobs registered"
```

Worker ko `npm run start:dev:worker` (watch mode) se **mat** chalana jab API `start:dev` mein chal rahi ho. Dono builds `dist/` folder mita kar dobara banate hain, aur API band ho jaati hai. Backend code badla ho to worker ko Ctrl+C karke `node dist/worker.js` dobara chalao.

### Terminal 4: Phone jodo + Metro

```bash
# Phone ki Wireless debugging screen se aaj ka IP:port dekho
adb connect 192.168.1.23:41289
adb reverse tcp:4000 tcp:4000
adb reverse tcp:8081 tcp:8081

cd mobile
npx expo start
```

Ab phone par **Remi** app kholo. App khud Metro (`localhost:8081`) se JS load kar lega.

Metro terminal ke kaam ke shortcuts:

| Key | Kaam |
|---|---|
| `r` | App reload |
| `m` | Dev menu phone par kholo |
| `j` | Debugger kholo |
| `Ctrl + C` | Metro band |

Cache saaf karke start karna ho (ajeeb errors ya `.env` badalne par): `npx expo start -c`

---

## Part 5: Band karna

```bash
# Har terminal mein Ctrl + C (Metro, worker, API)
docker compose stop            # database band (data safe rehta hai)
adb disconnect                 # phone ka wireless connection band
```

`docker compose down -v` **mat** chalana. `-v` database ka saara data mita deta hai.

---

## Part 6: Problems aur unke hal

| Problem | Hal |
|---|---|
| `adb: command not found` | Part 1.1 ka PATH wala step karo, naya terminal kholo |
| `adb connect` → "failed to connect" | Phone aur PC ek hi Wi-Fi par? Wireless debugging ON? Port wahi daala jo main screen par hai (pairing wala nahi)? |
| `adb devices` mein "unauthorized" | Phone par "Allow debugging?" popup → **Always allow** → Allow |
| App khulte hi red screen "Unable to load script" / Metro error | `adb reverse tcp:8081 tcp:8081` dobara chalao, Metro chal raha ho, phir app mein `r` |
| App mein "Network request failed" / API offline banner | API chal rahi hai? (`/health` check) · `adb reverse tcp:4000 tcp:4000` dobara chalao |
| Google sign-in ke baad "site can't be reached" | `adb reverse tcp:4000 tcp:4000` chalao. Redirect `localhost:4000` par aata hai |
| Gmail / Jira / Linear / Todoist connect ke baad wapas app par nahi aaya | Same: `adb reverse tcp:4000 tcp:4000`. Phir app mein Connected apps refresh karo |
| Backend start par `ECONNREFUSED 5433` / Redis error | Docker Desktop chalu karo → `docker compose up -d postgres redis` |
| Backend error "column does not exist" | `cd backend && npm run prisma:migrate` |
| `EADDRINUSE :4000` (port busy) | Pehle se koi API chal rahi hai. PowerShell: `Get-NetTCPConnection -LocalPort 4000 \| Select OwningProcess` → `Stop-Process -Id <id>` |
| Push notifications nahi aa rahe | Phone par app ki notifications allow? Profile → Push notifications ON? Development build (Part 3) hona zaroori hai, Expo Go mein push nahi chalta |
| Phone par naya code nahi dikh raha | Metro mein `r` dabao · ya `npx expo start -c` |
| Native package add kiya aur app crash | `npx expo run:android --device` se dobara build karo |

---

## Part 7: Bina wireless ADB ke (backup tareeka: LAN IP)

Agar wireless ADB na chale (jaise Android 10 ya purana phone):

1. PC ka Wi-Fi IP nikalo: `ipconfig` → *Wireless LAN adapter Wi-Fi* → **IPv4 Address**, jaise `192.168.1.10`.
2. `mobile/.env` mein: `EXPO_PUBLIC_API_URL=http://192.168.1.10:4000`
3. Windows Firewall mein port **4000** aur **8081** allow karo (pehli baar popup aaye to **Allow access** dabao).
4. `npx expo start -c` → phone par app kholo.

Is tareeke mein **Google sign-in aur OAuth connect (Gmail, Jira…) nahi chalenge**, kyunki Google LAN IP redirect nahi maanta. Login ke liye **"Continue with email"** use karo. Code backend ke terminal (API log) mein print hota hai, agar SMTP band ho. Kaam khatam hone par `.env` wapas `http://localhost:4000` kar dena.

---

## iPhone ke liye (short note)

iOS build ke liye **Mac + Xcode** chahiye (`npx expo run:ios --device`), ya EAS cloud build:
`npx eas-cli@latest build --profile development --platform ios`.
iPhone par `adb reverse` nahi hota, isliye backend ke liye HTTPS tunnel (ngrok / cloudflared) chahiye. Details: `mobile/README.md`.

---

## Quick cheat-sheet (roz ke commands)

```bash
# 1. Database
docker compose up -d postgres redis

# 2. API                       (naya terminal)
cd backend && npm run start:dev

# 3. Worker                    (naya terminal, API start hone ke baad)
cd backend && node dist/worker.js

# 4. Phone + Metro             (naya terminal)
adb connect <phone-ip>:<port>
adb reverse tcp:4000 tcp:4000
adb reverse tcp:8081 tcp:8081
cd mobile && npx expo start
```
