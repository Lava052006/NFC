# Event Ring Provisioning — Phase 1

Two pages:

- **`/register`** — public form. Visitors/exhibitors fill in their details, get back a registration ID and a QR code to bring to the counter.
- **`/provision`** — staff-only screen. Scan the QR (camera), confirm the matched person, tap their NTAG213 ring against an NFC-capable Android phone, and the ring's UID gets linked to that person's record in the database.

No data is ever written to the NFC tag itself. The ring's factory-burned UID is just used as a lookup key, stored alongside the person's details in Firestore. This is intentional — see the chat where this was planned for the reasoning.

## Important hardware constraint

**Web NFC (the browser API used to read the ring's UID) only works in Chrome on Android.** It does not work on iPhones, and it does not work on laptops or desktops at all, even with NFC hardware present. The `/provision` page must be opened in **Chrome on an Android phone** for the "tap ring" step to function. If it's opened anywhere else, it'll show a clear message saying NFC isn't supported there rather than failing silently.

The `/register` page has no such constraint — it works in any modern browser, since it's just a form and a QR code generator.

## Setup

### 1. Create a Firebase project

1. Go to [console.firebase.google.com](https://console.firebase.google.com) and create a new project.
2. In the project, go to **Build > Firestore Database** and click **Create database**. Choose a location close to your event (e.g. a region in India if the event is there), and start in **production mode** (we'll add rules manually — see step 4).
3. Go to **Project settings** (gear icon) > **General** tab, scroll to **Your apps**, click the **Web (`</>`)** icon to register a new web app. Give it any nickname. You don't need Firebase Hosting at this step.
4. Firebase will show you a config object with `apiKey`, `authDomain`, `projectId`, etc. Keep this tab open — you'll need these values next.

### 2. Configure environment variables

In the project folder, copy the example env file:

```bash
cp .env.example .env
```

Open `.env` and fill in the values from the Firebase config you just saw, plus a password for the staff provisioning screen:

```
VITE_FIREBASE_API_KEY=your-value-here
VITE_FIREBASE_AUTH_DOMAIN=your-value-here
VITE_FIREBASE_PROJECT_ID=your-value-here
VITE_FIREBASE_STORAGE_BUCKET=your-value-here
VITE_FIREBASE_MESSAGING_SENDER_ID=your-value-here
VITE_FIREBASE_APP_ID=your-value-here
VITE_STAFF_PASSWORD=pick-something-only-staff-know
```

`.env` is already in `.gitignore` — never commit it.

### 3. Install dependencies

```bash
npm install
```

### 4. Set Firestore security rules

The file `firestore.rules` in this project has the rules you need. In the Firebase console, go to **Firestore Database > Rules**, paste in the contents of that file, and click **Publish**.

These rules are intentionally permissive for phase-1 testing (no real staff authentication yet — just the shared password in the app, which isn't a security boundary on the database itself). There's a comment in the rules file marking exactly what to tighten before you run this with real attendee data at a live event. Worth doing before go-live, not urgent for testing.

### 5. Run it locally

```bash
npm run dev
```

This starts a local server, usually at `http://localhost:5173`. You can open `/register` on any device on the same network. For testing `/provision`'s NFC step, you need to open it on an Android phone running Chrome — which means you need the dev server reachable from your phone (see below).

### 6. Testing the NFC step specifically

Two things to know:

- **Web NFC requires HTTPS** (or `localhost` exactly — not a LAN IP like `192.168.x.x` over plain HTTP). If you're testing on your phone over your local network, plain `npm run dev` accessed via your computer's LAN IP won't have NFC work, because it's not HTTPS and not literally `localhost` from the phone's perspective.
- The practical way to test before deploying: deploy to **Firebase Hosting** (free tier is enough) which gives you a real HTTPS URL, then open that URL in Chrome on your Android phone. Steps:

```bash
npm run build
npm install -g firebase-tools
firebase login
firebase init hosting   # choose "dist" as the public folder, configure as single-page app: yes
firebase deploy
```

This gives you a URL like `your-project.web.app` — open that on your Android phone in Chrome, go to `/provision`, log in with your staff password, and the NFC tap step will work for real.

## What happens technically when a ring is provisioned

1. Person fills `/register`, gets a unique ID like `EVT-X7K2QN` and a QR code encoding that string.
2. They show the QR at the counter. Staff opens `/provision`, logs in once per shift.
3. Staff scans the QR with the phone's camera. The app looks up `EVT-X7K2QN` in the `registrations` collection in Firestore and displays the matched person's name/company for staff to visually confirm — this catches any mismatch before a ring gets linked to the wrong person.
4. Staff taps the blank NTAG213 ring against the back of the phone. The Web NFC API reads the tag's factory UID (something like `04:A3:B2:1F:9C:88:01`).
5. The app writes that UID into the matched person's record in Firestore (`ringUid` field) and marks `ringAssigned: true`. Nothing is written to the tag itself.
6. Ring is handed over. Done.

If a QR is scanned for someone who already has a ring assigned, the app warns staff and asks for confirmation before overwriting — this handles lost-ring replacement without silently creating duplicate/orphaned links.
