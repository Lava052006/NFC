import { useState, useRef, useEffect, useCallback } from "react";
import { collection, query, where, getDocs, updateDoc, doc, serverTimestamp } from "firebase/firestore";
import { Html5Qrcode } from "html5-qrcode";
import { db } from "../lib/firebase";
import "./Provision.css";

const STAFF_PASSWORD = import.meta.env.VITE_STAFF_PASSWORD || "changeme";
const QR_REGION_ID = "qr-scan-region";

// Step constants
const STEP_SCAN = "scan";
const STEP_CONFIRM_OVERWRITE = "confirm_overwrite";
const STEP_TAP = "tap";
const STEP_SUCCESS = "success";

export default function Provision() {
  const [authed, setAuthed] = useState(false);
  const [pwInput, setPwInput] = useState("");
  const [pwError, setPwError] = useState("");

  const [step, setStep] = useState(STEP_SCAN);
  const [scanError, setScanError] = useState("");
  const [lookupLoading, setLookupLoading] = useState(false);
  const [matchedDoc, setMatchedDoc] = useState(null); // { id, data }
  const [nfcSupported] = useState(() => typeof window !== "undefined" && "NDEFReader" in window);
  const [nfcError, setNfcError] = useState("");
  const [nfcListening, setNfcListening] = useState(false);

  const scannerRef = useRef(null);
  const abortControllerRef = useRef(null);

  // ---- Auth ----
  function handleLogin(e) {
    e.preventDefault();
    if (pwInput === STAFF_PASSWORD) {
      setAuthed(true);
      setPwError("");
    } else {
      setPwError("Incorrect password.");
    }
  }

  const handleQrDecoded = useCallback(async (registrationId) => {
    setScanError("");
    setLookupLoading(true);
    try {
      const q = query(
        collection(db, "registrations"),
        where("registrationId", "==", registrationId)
      );
      const snap = await getDocs(q);

      if (snap.empty) {
        setScanError(`No registration found for "${registrationId}". Rescan or check the QR code.`);
        setLookupLoading(false);
        return;
      }

      const docSnap = snap.docs[0];
      const data = docSnap.data();
      setMatchedDoc({ id: docSnap.id, data });
      setLookupLoading(false);

      if (data.ringAssigned) {
        setStep(STEP_CONFIRM_OVERWRITE);
      } else {
        setStep(STEP_TAP);
      }
    } catch (err) {
      console.error(err);
      setScanError("Lookup failed. Check your connection and try scanning again.");
      setLookupLoading(false);
    }
  }, []);

  // ---- QR scanning ----
  useEffect(() => {
    if (!authed || step !== STEP_SCAN) return;

    const scanner = new Html5Qrcode(QR_REGION_ID);
    scannerRef.current = scanner;
    let isRunning = true;

    scanner
      .start(
        { facingMode: "environment" },
        { fps: 10, qrbox: 230 },
        (decodedText) => {
          if (!isRunning) return;
          isRunning = false;
          scanner.stop().catch(() => {});
          handleQrDecoded(decodedText.trim());
        },
        () => {
          // per-frame "no QR found" — expected constantly, ignore
        }
      )
      .catch((err) => {
        console.error(err);
        setScanError(
          "Couldn't access the camera. Check camera permissions for this site and reload."
        );
      });

    return () => {
      isRunning = false;
      scanner.stop().catch(() => {});
    };
  }, [authed, step, handleQrDecoded]);

  function rescan() {
    setScanError("");
    setMatchedDoc(null);
    setNfcError("");
    setStep(STEP_SCAN);
  }

  // ---- NFC tap ----
  const assignRing = useCallback(
    async (uid) => {
      if (!matchedDoc) return;
      try {
        await updateDoc(doc(db, "registrations", matchedDoc.id), {
          ringUid: uid,
          ringAssigned: true,
          assignedAt: serverTimestamp(),
        });
        setStep(STEP_SUCCESS);
      } catch (err) {
        console.error(err);
        setNfcError("Saved the tag read, but couldn't update the record. Check your connection and try again.");
      }
    },
    [matchedDoc]
  );

  const startNfcRead = useCallback(async () => {
    setNfcError("");
    try {
      const controller = new AbortController();
      abortControllerRef.current = controller;

      // eslint-disable-next-line no-undef
      const ndef = new NDEFReader();
      await ndef.scan({ signal: controller.signal });
      setNfcListening(true);

      ndef.onreading = (event) => {
        // event.serialNumber is the tag UID, colon-separated hex
        const uid = event.serialNumber;
        if (!uid) {
          setNfcError("Couldn't read a UID from that tag. Try tapping again.");
          return;
        }
        controller.abort();
        setNfcListening(false);
        assignRing(uid);
      };

      ndef.onreadingerror = () => {
        setNfcError("Couldn't read that tag. Hold the ring flat against the back of the phone and try again.");
      };
    } catch (err) {
      console.error(err);
      setNfcListening(false);
      if (err.name === "NotAllowedError") {
        setNfcError("NFC permission was denied. Allow NFC access for this site and try again.");
      } else {
        setNfcError("Couldn't start NFC scanning. Make sure NFC is turned on for this phone.");
      }
    }
  }, [assignRing]);

  useEffect(() => {
    if (step !== STEP_TAP || !nfcSupported) return;

    const timeoutId = setTimeout(() => {
      startNfcRead();
    }, 0);

    return () => {
      clearTimeout(timeoutId);
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
    };
  }, [step, nfcSupported, startNfcRead]);

  function scanNext() {
    setMatchedDoc(null);
    setNfcError("");
    setScanError("");
    setNfcListening(false);
    setStep(STEP_SCAN);
  }

  // ---- Render: login gate ----
  if (!authed) {
    return (
      <div className="page">
        <div className="card login-card">
          <span className="eyebrow">Staff access</span>
          <h1 className="page-title">Provisioning station</h1>
          <p className="page-sub">Enter the staff password to continue.</p>
          <form onSubmit={handleLogin} className="form">
            <label className="field">
              <span>Password</span>
              <input
                type="password"
                value={pwInput}
                onChange={(e) => setPwInput(e.target.value)}
                autoFocus
              />
            </label>
            {pwError && <div className="alert alert--error">{pwError}</div>}
            <button type="submit" className="btn btn--primary">Continue</button>
          </form>
        </div>
      </div>
    );
  }

  // ---- Render: success ----
  if (step === STEP_SUCCESS) {
    return (
      <div className="page">
        <div className="card status-card status-card--success">
          <div className="status-icon status-icon--success">✓</div>
          <h1 className="status-title">Ring assigned</h1>
          <p className="status-name">{matchedDoc?.data?.name}</p>
          <p className="status-sub">{matchedDoc?.data?.company} &middot; {matchedDoc?.data?.category}</p>
          <button className="btn btn--primary" onClick={scanNext}>Scan next person</button>
        </div>
      </div>
    );
  }

  // ---- Render: tap ring ----
  if (step === STEP_TAP || step === STEP_CONFIRM_OVERWRITE) {
    return (
      <div className="page">
        <div className="card">
          <StepIndicator activeStep={2} />

          <div className="match-banner">
            <span className="match-label">Matched</span>
            <h2 className="match-name">{matchedDoc?.data?.name}</h2>
            <p className="match-sub">{matchedDoc?.data?.company} &middot; {matchedDoc?.data?.category}</p>
          </div>

          {step === STEP_CONFIRM_OVERWRITE && (
            <div className="alert alert--warning">
              This person already has a ring assigned. Tapping a new ring will replace it.
              <button className="btn btn--warning-confirm" onClick={() => setStep(STEP_TAP)}>
                Continue anyway
              </button>
              <button className="btn btn--ghost" onClick={rescan}>Cancel, rescan instead</button>
            </div>
          )}

          {step === STEP_TAP && (
            <>
              {!nfcSupported ? (
                <div className="alert alert--error">
                  NFC reading isn't supported on this device or browser. Open this page in
                  Chrome on an Android phone with NFC turned on.
                </div>
              ) : (
                <>
                  <div className="tap-zone">
                    <div className={`tap-pulse ${nfcListening ? "tap-pulse--active" : ""}`}>📡</div>
                    <p className="tap-instruction">Hold the ring against the back of the phone</p>
                  </div>
                  {nfcError && <div className="alert alert--error">{nfcError}</div>}
                </>
              )}
              <button className="btn btn--ghost" onClick={rescan}>Cancel, rescan instead</button>
            </>
          )}
        </div>
      </div>
    );
  }

  // ---- Render: scan QR (default) ----
  return (
    <div className="page">
      <div className="card">
        <StepIndicator activeStep={1} />
        <h1 className="page-title">Scan registration QR</h1>
        <p className="page-sub">Point the camera at the visitor's or exhibitor's QR code.</p>

        <div id={QR_REGION_ID} className="qr-scan-region" />

        {lookupLoading && <p className="loading-text">Looking up registration…</p>}
        {scanError && <div className="alert alert--error">{scanError}</div>}
      </div>
    </div>
  );
}

function StepIndicator({ activeStep }) {
  return (
    <div className="step-indicator">
      <div className={`step ${activeStep === 1 ? "step--active" : "step--done"}`}>
        <span className="step-icon">▭</span>
        <span>Scan QR</span>
      </div>
      <div className="step-divider" />
      <div className={`step ${activeStep === 2 ? "step--active" : ""}`}>
        <span className="step-icon">◎</span>
        <span>Tap ring</span>
      </div>
    </div>
  );
}
