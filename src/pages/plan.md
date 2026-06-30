# Exhibitor NFC Reader — Implementation Plan (Revised)

## 1. Overview

This project adds a secure exhibitor dashboard at `/exhibit/:id` where exhibitors can authenticate, connect an RC522 NFC reader through the Web Serial API, scan participant NFC tags, view scanned participants, and export the collected data as an Excel workbook.

## 2. Objectives

- Secure exhibitor access with Firebase Authentication.
- Prevent exhibitors from viewing another exhibitor's scans.
- Support NFC scanning via Web Serial.
- Persist scans in Firestore.
- Export scans to `.xlsx`.
- Keep the architecture scalable.

## 3. Architecture

### Registration

1. Exhibitor completes registration.
2. Create Firebase Auth user using email/password.
3. Retrieve `authUid`.
4. Create Firestore registration document including `authUid`.

This avoids orphan Firestore documents.

### Provisioning

Each NFC tag stores:
- Participant URL
- Physical NFC UID (`nfcUid`) in Firestore

### Dashboard

1. Open `/exhibit/:id`
2. Load exhibitor registration
3. Wait for Firebase Auth
4. Verify `currentUser.uid == authUid`
5. Connect NFC reader
6. Read UID
7. Find participant by `nfcUid`
8. Save scan
9. Update UI
10. Allow Excel export

## 4. Firestore Schema

### registrations/{registrationId}

```json
{
  "authUid": "...",
  "registrationId": "...",
  "contactEmail": "...",
  "boothName": "..."
}
```

### scans/{exhibitorId}

```json
{
  "authUid": "...",
  "updatedAt": "Timestamp"
}
```

### scans/{exhibitorId}/participants/{participantId}

```json
{
  "participantId": "...",
  "name": "...",
  "email": "...",
  "organization": "...",
  "phone": "...",
  "scannedAt": "Timestamp"
}
```

A subcollection is preferred over a growing array because it scales, avoids Firestore document size limits, and simplifies updates.

## 5. Authentication

Use:

- `createUserWithEmailAndPassword()`
- `signInWithEmailAndPassword()`
- `onAuthStateChanged()`

Never create the Firestore registration before Auth succeeds.

## 6. Component States

- loading
- login
- unauthorized
- notfound
- idle
- connecting
- ready
- found
- error

## 7. Web Serial

Open reader:

```js
const port = await navigator.serial.requestPort();
await port.open({ baudRate: 9600 });
```

Cleanup:

```js
await reader.cancel();
reader.releaseLock();
await port.close();
```

Provide HID/manual input fallback.

## 8. Security Rules

Each scan document stores `authUid`.

Only allow:

```text
request.auth.uid == resource.data.authUid
```

Do not reference undefined document IDs in rules.

## 9. Excel Export

Generate from participant subcollection.

Columns:

- Name
- Email
- Organization
- Phone
- Scanned At

## 10. Files

- src/lib/firebase.js
- src/pages/Register.jsx
- src/pages/Provision.jsx
- src/pages/Exhibitor.jsx
- src/pages/Exhibitor.css
- firestore.rules
- App.jsx

## 11. Implementation Order

1. Configure Firebase Auth.
2. Update registration.
3. Fix provisioning.
4. Implement security rules.
5. Build exhibitor dashboard.
6. Integrate Web Serial.
7. Persist scans.
8. Excel export.
9. Styling.
10. Testing.
