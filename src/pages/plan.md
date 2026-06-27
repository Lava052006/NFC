# Exhibitor NFC Reader — Implementation Plan

## Files to Modify/Create

| File | Action |
|---|---|
| `src/pages/Exhibitor.jsx` | **Rewrite** (~250 lines) |
| `src/pages/Exhibitor.css` | **Create** |
| `src/App.jsx` | **Edit** — uncomment route |
| `src/pages/Provision.jsx` | **Fix** — store real tag UID |

---

## Data Flow

```
Provision (phone):
  NDEFReader writes URL to chip (e.g. /p/EVT-XXXXXX) + stores real tag serial in Firestore
  Firestore: registrations/{id}.nfcUid = tag serial number (hex)

Exhibitor (PC + RC522):
  RC522 reads tag UID → sends over USB serial
  Browser (Web Serial API) receives UID string
  Queries Firestore: registrations where nfcUid == receivedUid
  Extracts participant details: name, email, organization, phone
  Updates local Map + upserts to scans/{exhibitorId}.participants
```

---

## Exhibitor.jsx — Component States

| State | Trigger | UI |
|---|---|---|
| `loading` | Mount, fetching exhibitor's own doc by `:id` | Spinner |
| `notfound` | Invalid `:id` param | Error card |
| `idle` | Exhibitor loaded, no reader connected | "Connect NFC Reader" button + manual ID input |
| `connecting` | `serial.requestPort()` in progress | "Connecting to reader..." |
| `ready` | Serial port opened and reading | NFC pulse animation "Waiting for tap" |
| `found` | Valid participant scanned | Entry added to list, brief highlight |
| `notfound` | Unknown UID (not in Firestore) | Error toast, ignored |
| `error` | Serial/Firestore failure | Error message |

---

## Local State

```js
const [scanned, setScanned] = useState(new Map());
// Map<participantId, { name, email, organization, phone }>
// Deduped by participantId (or name if no id stored)
```

No timestamps in local state.

---

## Firestore — Scans Collection

**Document ID**: `exhibitorId` (from URL param `:id`)

```json
{
  "exhibitorId": "EVT-XXXXXX",
  "participants": [
    { "name": "John Doe", "email": "john@...", "organization": "Acme", "phone": "+123" },
    { "name": "Jane Smith", "email": "jane@...", "organization": "Beta", "phone": "" }
  ],
  "updatedAt": Timestamp
}
```

**No participantId/registrationId stored.**

**Write**: `setDoc(doc(db, "scans", exhibitorId), { ... }, { merge: true })` with `arrayUnion` for dedup.

---

## NFC Reader Integration (Web Serial API)

```js
// Connect
const port = await navigator.serial.requestPort();
await port.open({ baudRate: 9600 });
const reader = port.readable.getReader();

// Read loop
while (port.readable) {
  const { value, done } = await reader.read();
  const uid = new TextDecoder().decode(value).trim();
  // uid → Firestore lookup
}
```

**Fallback if Web Serial unsupported**: Focus a hidden `<input>` that captures keystrokes (some readers emulate HID keyboard). Also provide a manual text input for pasting registration IDs.

---

## UI Layout

```
┌───────────────────────────────────────────┐
│  Booth: Acme Corp          [● Connected]  │
│  ───────────────────────────────────────  │
│                                           │
│  ┌─────────────────────────────────────┐  │
│  │     ⟐    Waiting for tap...         │  │  ← NFC pulse
│  └─────────────────────────────────────┘  │
│                                           │
│  or enter ID: [________________] [Scan]  │  ← manual fallback
│                                           │
│  ─── Scanned (2) ───                     │
│  ┌─────────────────────────────────────┐  │
│  │ ▼ John Doe                          │  │  ← expandable
│  │   Email     john@example.com        │  │
│  │   Org       Acme Corp               │  │
│  │   Phone     +1234567890             │  │
│  └─────────────────────────────────────┘  │
│  ┌─────────────────────────────────────┐  │
│  │ ▼ Jane Smith                        │  │
│  │   Email     jane@test.com           │  │
│  │   Org       Beta Inc                │  │
│  │   Phone     —                       │  │
│  └─────────────────────────────────────┘  │
│                                           │
│  [Clear All]                              │
└───────────────────────────────────────────┘
```

---

## Exhibitor.css

Reuses existing design tokens (glass cards, gradient bg, font stack from index.css). Pulse animation similar to Provision's NFC zone. Expandable list items with slide-down transition.

---

## Provision.jsx Fix

Current: `nfcUid: "written_by_web_nfc"` (hardcoded string)

Fix: Capture the actual tag serial number from the NDEF reading event and store it in `nfcUid`. This makes UID-based lookup work for all newly provisioned chips. Already-provisioned chips with the old hardcoded value will not be found until re-provisioned.

---

## App.jsx Edit

Uncomment line 18:

```jsx
<Route path="/exhibit/:id" element={<Exhibitor />} />
```

---

## Order of Implementation

1. Edit `App.jsx` — uncomment route
2. Create `Exhibitor.css` — base styles
3. Rewrite `Exhibitor.jsx` — full component
4. Edit `Provision.jsx` — store real tag UID
