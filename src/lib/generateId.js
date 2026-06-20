/**
 * generateId.js
 * Generates unique EVT-XXXXXX registration IDs and the NFC-pipeline-ready QR payload.
 */

// No ambiguous chars: no 0/O, no 1/I
const CHARS = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

/**
 * Generates a unique registration ID in the format EVT-XXXXXX.
 * @returns {string}  e.g. "EVT-A3K9MZ"
 */
export function generateRegistrationId() {
  let suffix = "";
  for (let i = 0; i < 6; i++) {
    suffix += CHARS[Math.floor(Math.random() * CHARS.length)];
  }
  return `EVT-${suffix}`;
}

/**
 * Builds the JSON string that goes inside the QR code.
 *
 * The payload is intentionally minimal — the Firestore doc holds all details.
 * Part 2 (NFC provisioner) decodes this, looks up the Firestore record by `id`,
 * then writes the appropriate NDEF record to the NTAG213 chip:
 *   - exhibitor → NDEF URI record (website / brochureUrl)
 *   - participant → NDEF Text / vCard record
 *
 * @param {string} id    Registration ID, e.g. "EVT-A3K9MZ"
 * @param {"participant"|"exhibitor"} type
 * @returns {string}  JSON string, e.g. '{"id":"EVT-A3K9MZ","type":"participant","v":1}'
 */
export function buildQrPayload(id, type) {
  return JSON.stringify({ id, type, v: 1 });
}
