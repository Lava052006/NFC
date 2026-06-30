import { useState, useEffect, useRef, useCallback } from "react";
import { useParams, useNavigate } from "react-router-dom";
import {
  collection,
  query,
  where,
  getDocs,
  getDoc,
  doc,
  setDoc,
  addDoc,
  serverTimestamp,
  onSnapshot,
  orderBy,
} from "firebase/firestore";
import {
  db,
  auth,
  signInWithEmailAndPassword,
  onAuthStateChanged,
  signOut,
} from "../lib/firebase";
import * as XLSX from "xlsx";
import "./Exhibitor.css";

const BASE_URL = import.meta.env.VITE_APP_BASE_URL || window.location.origin;

export default function Exhibitor() {
  const { id } = useParams();
  const navigate = useNavigate();

  const [status, setStatus] = useState("loading");
  const [exhibitorData, setExhibitorData] = useState(null);
  const [exhibitorDocId, setExhibitorDocId] = useState(null);
  const [authUser, setAuthUser] = useState(null);
  const [scanStatus, setScanStatus] = useState("idle"); // idle | connecting | ready | found | error
  const [scanError, setScanError] = useState("");
  const [foundParticipant, setFoundParticipant] = useState(null);
  const [participants, setParticipants] = useState([]);
  const [manualUid, setManualUid] = useState("");
  const [serialPort, setSerialPort] = useState(null);
  const [serialSupported] = useState(
    () => typeof window !== "undefined" && "serial" in navigator
  );

  const serialReaderRef = useRef(null);
  const serialAbortRef = useRef(null);
  const unsubscribeAuthRef = useRef(null);
  const unsubscribeScansRef = useRef(null);

  /* ============================================================
     STEP 1 — Look up exhibitor registration
     ============================================================ */
  useEffect(() => {
    if (!id) {
      setStatus("notfound");
      return;
    }

    let cancelled = false;
    (async () => {
      try {
        const q = query(
          collection(db, "registrations"),
          where("registrationId", "==", id.toUpperCase())
        );
        const snap = await getDocs(q);

        if (cancelled) return;

        if (snap.empty) {
          setStatus("notfound");
          return;
        }

        const docSnap = snap.docs[0];
        const data = docSnap.data();

        if (data.type !== "exhibitor") {
          setStatus("notfound");
          return;
        }

        setExhibitorData(data);
        setExhibitorDocId(docSnap.id);

        if (!data.authUid) {
          setStatus("error");
          return;
        }

        setStatus("loading");
      } catch (err) {
        console.error(err);
        if (!cancelled) setStatus("error");
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [id]);

  /* ============================================================
     STEP 2 — Subscribe to auth state
     ============================================================ */
  useEffect(() => {
    if (!exhibitorData?.authUid) return;

    unsubscribeAuthRef.current = onAuthStateChanged(auth, (user) => {
      setAuthUser(user);

      if (!user) {
        setStatus("login");
      } else if (user.uid !== exhibitorData.authUid) {
        setStatus("unauthorized");
      } else {
        setStatus("idle");
      }
    });

    return () => {
      if (unsubscribeAuthRef.current) {
        unsubscribeAuthRef.current();
      }
    };
  }, [exhibitorData?.authUid]);

  /* ============================================================
     STEP 3 — Subscribe to scans subcollection
     ============================================================ */
  useEffect(() => {
    if (status !== "idle" && status !== "ready" && status !== "found") return;
    if (!exhibitorDocId) return;

    const scansRef = collection(db, "scans", exhibitorDocId, "participants");
    const q = query(scansRef, orderBy("scannedAt", "desc"));

    unsubscribeScansRef.current = onSnapshot(q, (snap) => {
      const list = [];
      snap.forEach((d) => list.push({ id: d.id, ...d.data() }));
      setParticipants(list);
    });

    return () => {
      if (unsubscribeScansRef.current) {
        unsubscribeScansRef.current();
      }
    };
  }, [status, exhibitorDocId]);

  /* ============================================================
     LOGIN
     ============================================================ */
  async function handleLogin(e) {
    e.preventDefault();
    const form = e.currentTarget;
    const email = form.email.value.trim();
    const password = form.password.value;

    if (!email || !password) return;

    try {
      await signInWithEmailAndPassword(auth, email, password);
    } catch (err) {
      console.error(err);
      setScanError("Login failed. Check your email and password.");
    }
  }

  async function handleLogout() {
    cleanupSerial();
    await signOut(auth);
  }

  /* ============================================================
     WEB SERIAL — Connect
     ============================================================ */
  const connectSerial = useCallback(async () => {
    if (!serialSupported) {
      setScanError("Web Serial is not supported in this browser. Use the manual input below.");
      return;
    }

    setScanStatus("connecting");
    setScanError("");

    try {
      const port = await navigator.serial.requestPort();
      await port.open({ baudRate: 9600 });

      setSerialPort(port);

      const decoder = new TextDecoderStream();
      const inputDone = port.readable.pipeTo(decoder.writable);
      const reader = decoder.readable.getReader();
      serialReaderRef.current = reader;

      const abortController = new AbortController();
      serialAbortRef.current = abortController;

      setScanStatus("ready");

      let buffer = "";

      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        if (abortController.signal.aborted) break;

        buffer += value;

        const lines = buffer.split("\n");
        buffer = lines.pop();

        for (const line of lines) {
          const uid = parseUidFromLine(line);
          if (uid) {
            handleUidFound(uid);
            return;
          }
        }
      }
    } catch (err) {
      console.error(err);
      if (err.name === "NotFoundError") {
        setScanError("No port selected. Click 'Connect' again to choose a device.");
      } else {
        setScanError("Failed to connect to NFC reader. Check the connection and try again.");
      }
      setScanStatus("idle");
    }
  }, [serialSupported]);

  /* ============================================================
     UID PARSER
     ============================================================ */
  function parseUidFromLine(line) {
    const cleaned = line.trim();

    const prefixMatch = cleaned.match(
      /(?:UID|CARD|TAG|CUID)\s*:?\s*([0-9A-Fa-f\s\-:]+)/
    );
    if (prefixMatch) {
      const hexStr = prefixMatch[1]
        .replace(/[\s\-:]+/g, "")
        .toUpperCase();
      if (/^[0-9A-F]{8,14}$/.test(hexStr)) return hexStr;
    }

    const hexOnly = cleaned.replace(/[\s\-:]+/g, "").toUpperCase();
    if (/^[0-9A-F]{8,14}$/.test(hexOnly)) return hexOnly;

    return null;
  }

  /* ============================================================
     UID FOUND — Look up participant
     ============================================================ */
  async function handleUidFound(uid) {
    setScanStatus("found");
    setScanError("");

    const normalizedUid = uid.toUpperCase();

    try {
      const q = query(
        collection(db, "registrations"),
        where("nfcUid", "==", normalizedUid)
      );
      const snap = await getDocs(q);

      if (snap.empty) {
        setFoundParticipant(null);
        setScanError(
          `No participant found with UID ${normalizedUid}. Make sure the chip has been provisioned.`
        );
        setScanStatus("error");
        return;
      }

      const participantSnap = snap.docs[0];
      const participantData = participantSnap.data();

      if (participantData.type !== "participant") {
        setFoundParticipant(null);
        setScanError("This NFC chip belongs to an exhibitor, not a participant.");
        setScanStatus("error");
        return;
      }

      setFoundParticipant({
        id: participantSnap.id,
        ...participantData,
      });

      await saveScan(participantData, participantSnap.id);
    } catch (err) {
      console.error(err);
      setScanError("Lookup failed. Check your connection.");
      setScanStatus("error");
    }
  }

  /* ============================================================
     SAVE SCAN
     ============================================================ */
  async function saveScan(participantData, participantDocId) {
    if (!exhibitorDocId) return;

    try {
      await setDoc(
        doc(db, "scans", exhibitorDocId),
        {
          authUid: exhibitorData.authUid,
          updatedAt: serverTimestamp(),
        },
        { merge: true }
      );

      const scanPayload = {
        participantId: participantData.registrationId,
        name: participantData.name || "",
        email: participantData.email || "",
        organization: participantData.organization || "",
        phone: participantData.phone || "",
        scannedAt: serverTimestamp(),
      };

      await addDoc(
        collection(db, "scans", exhibitorDocId, "participants"),
        scanPayload
      );
    } catch (err) {
      console.error(err);
      setScanError("Scan saved locally but couldn't sync to Firestore. Check connection.");
    }
  }

  /* ============================================================
     MANUAL UID INPUT
     ============================================================ */
  function handleManualSubmit(e) {
    e.preventDefault();
    const uid = manualUid.trim().toUpperCase();
    if (!uid) return;

    const hexOnly = uid.replace(/[\s\-:]+/g, "");
    if (!/^[0-9A-F]{8,14}$/.test(hexOnly)) {
      setScanError("Invalid UID format. Enter hex digits (e.g. 04123456AB).");
      return;
    }

    handleUidFound(hexOnly);
  }

  /* ============================================================
     CLEANUP SERIAL
     ============================================================ */
  async function cleanupSerial() {
    if (serialAbortRef.current) {
      serialAbortRef.current.abort();
      serialAbortRef.current = null;
    }
    if (serialReaderRef.current) {
      try {
        serialReaderRef.current.cancel();
      } catch (_) {}
      serialReaderRef.current.releaseLock();
      serialReaderRef.current = null;
    }
    if (serialPort) {
      try {
        await serialPort.close();
      } catch (_) {}
      setSerialPort(null);
    }
    setScanStatus("idle");
  }

  useEffect(() => {
    return () => {
      cleanupSerial();
    };
  }, []);

  function resetScan() {
    setFoundParticipant(null);
    setScanError("");
    setManualUid("");
    setScanStatus("idle");
  }

  /* ============================================================
     EXCEL EXPORT
     ============================================================ */
  function exportToExcel() {
    if (participants.length === 0) return;

    const rows = participants.map((p) => ({
      Name: p.name || "",
      Email: p.email || "",
      Organization: p.organization || "",
      Phone: p.phone || "",
      "Scanned At": p.scannedAt
        ? p.scannedAt.toDate
          ? p.scannedAt.toDate().toLocaleString()
          : p.scannedAt
        : "",
    }));

    const ws = XLSX.utils.json_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Scans");

    const colWidths = [
      { wch: 30 },
      { wch: 35 },
      { wch: 30 },
      { wch: 20 },
      { wch: 22 },
    ];
    ws["!cols"] = colWidths;

    XLSX.writeFile(
      wb,
      `exhibitor-scans-${exhibitorData?.registrationId || id}.xlsx`
    );
  }

  /* ============================================================
     RENDER — loading
     ============================================================ */
  if (status === "loading") {
    return (
      <div className="exh-page">
        <div className="exh-loading">
          <SpinnerIcon />
          <p>Loading exhibitor dashboard...</p>
        </div>
      </div>
    );
  }

  /* ============================================================
     RENDER — unauthorized
     ============================================================ */
  if (status === "unauthorized") {
    return (
      <div className="exh-page">
        <div className="exh-card glass">
          <div className="exh-error-icon">
            <LockIcon />
          </div>
          <h1 className="exh-error-title">Access Denied</h1>
          <p className="exh-error-sub">
            You are logged in as a different user. This dashboard belongs to
            another exhibitor account.
          </p>
          <button className="exh-btn exh-btn--primary" onClick={handleLogout}>
            Sign out and try again
          </button>
          <button className="exh-btn exh-btn--ghost" onClick={() => navigate("/")}>
            Back to home
          </button>
        </div>
      </div>
    );
  }

  /* ============================================================
     RENDER — notfound
     ============================================================ */
  if (status === "notfound") {
    return (
      <div className="exh-page">
        <div className="exh-card glass">
          <div className="exh-error-icon">
            <SearchIcon />
          </div>
          <h1 className="exh-error-title">Exhibitor not found</h1>
          <p className="exh-error-sub">
            No exhibitor matches this link. Check the URL or contact the event
            staff.
          </p>
          <button className="exh-btn exh-btn--primary" onClick={() => navigate("/")}>
            Back to home
          </button>
        </div>
      </div>
    );
  }

  /* ============================================================
     RENDER — error
     ============================================================ */
  if (status === "error") {
    return (
      <div className="exh-page">
        <div className="exh-card glass">
          <div className="exh-error-icon">
            <ErrorIcon />
          </div>
          <h1 className="exh-error-title">Something went wrong</h1>
          <p className="exh-error-sub">
            Could not load exhibitor data. Check your connection and try again.
          </p>
          <button className="exh-btn exh-btn--primary" onClick={() => navigate("/")}>
            Back to home
          </button>
        </div>
      </div>
    );
  }

  /* ============================================================
     RENDER — login
     ============================================================ */
  if (status === "login") {
    return (
      <>
        <div className="bg-grid" aria-hidden="true" />
        <div className="orb orb-1" aria-hidden="true" />
        <div className="orb orb-2" aria-hidden="true" />

        <div className="exh-page">
          <div className="exh-card glass">
            <div className="exh-login-header">
              <span className="exh-eyebrow">Exhibitor Access</span>
              <h1 className="exh-title">
                {exhibitorData?.orgName || "Sign in"}
              </h1>
              <p className="exh-sub">
                Sign in with the credentials provided during registration.
              </p>
            </div>

            <form onSubmit={handleLogin} className="exh-form">
              <div className="exh-field">
                <label className="exh-label" htmlFor="exh-email">
                  Email
                </label>
                <input
                  id="exh-email"
                  name="email"
                  type="email"
                  className="exh-input"
                  defaultValue={exhibitorData?.contactEmail || ""}
                  placeholder="you@example.com"
                  autoComplete="email"
                  required
                />
              </div>

              <div className="exh-field">
                <label className="exh-label" htmlFor="exh-password">
                  Password
                </label>
                <input
                  id="exh-password"
                  name="password"
                  type="password"
                  className="exh-input"
                  placeholder="Enter your password"
                  autoComplete="current-password"
                  required
                />
              </div>

              {scanError && (
                <div className="exh-alert exh-alert--error">{scanError}</div>
              )}

              <button type="submit" className="exh-btn exh-btn--primary">
                Sign in
              </button>
            </form>

            <button
              className="exh-btn exh-btn--ghost"
              onClick={() => navigate("/")}
            >
              Back to home
            </button>
          </div>
        </div>
      </>
    );
  }

  /* ============================================================
     RENDER — Dashboard
     ============================================================ */
  const displayName = exhibitorData?.orgName || "Exhibitor Dashboard";

  return (
    <>
      <div className="bg-grid" aria-hidden="true" />
      <div className="orb orb-1" aria-hidden="true" />
      <div className="orb orb-2" aria-hidden="true" />

      <div className="exh-page">
        <div className="exh-dashboard">
          {/* ---- Header ---- */}
          <header className="exh-dash-header">
            <div>
              <span className="exh-eyebrow">Exhibitor Dashboard</span>
              <h1 className="exh-dash-title">{displayName}</h1>
              <p className="exh-dash-sub">
                {exhibitorData?.registrationId} &middot;{" "}
                {exhibitorData?.contactEmail}
              </p>
            </div>
            <div className="exh-dash-actions">
              {participants.length > 0 && (
                <button
                  className="exh-btn exh-btn--accent"
                  onClick={exportToExcel}
                  title="Export scans to Excel"
                >
                  <DownloadIcon /> Export Excel
                </button>
              )}
              <button
                className="exh-btn exh-btn--ghost"
                onClick={handleLogout}
              >
                Sign out
              </button>
            </div>
          </header>

          {/* ---- NFC Reader Panel ---- */}
          <section className="exh-reader-panel glass">
            <div className="exh-reader-header">
              <h2 className="exh-reader-title">NFC Scanner</h2>
              {scanStatus === "ready" && (
                <span className="exh-badge exh-badge--active">Listening</span>
              )}
            </div>

            {scanStatus === "idle" && (
              <div className="exh-reader-idle">
                <NfcIcon />
                <p>Connect your NFC reader to start scanning participant tags.</p>
                {serialSupported ? (
                  <button
                    className="exh-btn exh-btn--primary"
                    onClick={connectSerial}
                  >
                    Connect NFC Reader
                  </button>
                ) : (
                  <div className="exh-alert exh-alert--warning">
                    Web Serial is not supported in this browser. Use the manual
                    UID input below.
                  </div>
                )}
              </div>
            )}

            {scanStatus === "connecting" && (
              <div className="exh-reader-connecting">
                <SpinnerIcon />
                <p>Connecting to NFC reader...</p>
              </div>
            )}

            {scanStatus === "ready" && (
              <div className="exh-reader-ready">
                <div className="exh-pulse">
                  <NfcIcon />
                </div>
                <p className="exh-ready-text">
                  Reader connected. Tap a participant&apos;s NFC chip.
                </p>
                <button
                  className="exh-btn exh-btn--ghost"
                  onClick={cleanupSerial}
                >
                  Disconnect reader
                </button>
              </div>
            )}

            {scanStatus === "found" && foundParticipant && (
              <div className="exh-scan-result">
                <div className="exh-scan-check">
                  <CheckIcon />
                </div>
                <h3 className="exh-scan-name">{foundParticipant.name}</h3>
                <p className="exh-scan-detail">
                  {foundParticipant.email} &middot; {foundParticipant.organization}
                </p>
                <button
                  className="exh-btn exh-btn--primary"
                  onClick={resetScan}
                >
                  Scan another
                </button>
              </div>
            )}

            {scanStatus === "error" && (
              <div className="exh-reader-error">
                <div className="exh-alert exh-alert--error">{scanError}</div>
                <button
                  className="exh-btn exh-btn--secondary"
                  onClick={resetScan}
                >
                  Try again
                </button>
              </div>
            )}

            {/* ---- Manual UID fallback ---- */}
            {(scanStatus === "idle" || scanStatus === "error") && (
              <details className="exh-manual-fallback">
                <summary className="exh-manual-summary">
                  Manual UID entry
                </summary>
                <form onSubmit={handleManualSubmit} className="exh-manual-form">
                  <input
                    className="exh-input"
                    type="text"
                    value={manualUid}
                    onChange={(e) => setManualUid(e.target.value)}
                    placeholder="Paste UID here (e.g. 04123456AB)"
                  />
                  <button type="submit" className="exh-btn exh-btn--secondary">
                    Look up UID
                  </button>
                </form>
              </details>
            )}
          </section>

          {/* ---- Scans Table ---- */}
          <section className="exh-scans-panel glass">
            <div className="exh-scans-header">
              <h2 className="exh-scans-title">
                Scanned Participants
                {participants.length > 0 && (
                  <span className="exh-scans-count">{participants.length}</span>
                )}
              </h2>
            </div>

            {participants.length === 0 ? (
              <div className="exh-scans-empty">
                <p>No participants scanned yet.</p>
                <p className="exh-scans-empty-hint">
                  Connect an NFC reader and tap a participant&apos;s chip to
                  register their visit.
                </p>
              </div>
            ) : (
              <div className="exh-scans-table-wrap">
                <table className="exh-scans-table">
                  <thead>
                    <tr>
                      <th>Name</th>
                      <th>Email</th>
                      <th>Organization</th>
                      <th>Phone</th>
                      <th>Scanned At</th>
                    </tr>
                  </thead>
                  <tbody>
                    {participants.map((p) => (
                      <tr key={p.id}>
                        <td className="exh-cell-name">{p.name || "—"}</td>
                        <td>{p.email || "—"}</td>
                        <td>{p.organization || "—"}</td>
                        <td>{p.phone || "—"}</td>
                        <td className="exh-cell-date">
                          {p.scannedAt?.toDate
                            ? p.scannedAt.toDate().toLocaleString()
                            : "—"}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        </div>
      </div>
    </>
  );
}

/* ============================================================
   ICONS
   ============================================================ */
function SpinnerIcon() {
  return (
    <svg className="exh-spinner" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" aria-hidden="true">
      <path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83" />
    </svg>
  );
}

function LockIcon() {
  return (
    <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
      <path d="M7 11V7a5 5 0 0 1 10 0v4" />
    </svg>
  );
}

function SearchIcon() {
  return (
    <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <circle cx="11" cy="11" r="8" />
      <path d="M21 21l-4.35-4.35" />
    </svg>
  );
}

function ErrorIcon() {
  return (
    <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <circle cx="12" cy="12" r="10" />
      <line x1="12" y1="8" x2="12" y2="12" />
      <line x1="12" y1="16" x2="12.01" y2="16" />
    </svg>
  );
}

function NfcIcon() {
  return (
    <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M6 8.32a7.43 7.43 0 0 1 0 7.36" />
      <path d="M9.46 6.21a11.76 11.76 0 0 1 0 11.58" />
      <path d="M12.91 4.1a15.91 15.91 0 0 1 .01 15.8" />
      <path d="M16.37 2a20.16 20.16 0 0 1 0 20" />
    </svg>
  );
}

function CheckIcon() {
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <polyline points="20 6 9 17 4 12" />
    </svg>
  );
}

function DownloadIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M12 15V3m0 12-4-4m4 4 4-4" />
      <path d="M2 17l.621 2.485A2 2 0 0 0 4.561 21h14.878a2 2 0 0 0 1.94-1.515L22 17" />
    </svg>
  );
}
