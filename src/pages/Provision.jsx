import { useState, useRef, useEffect, useCallback } from "react";
import { collection, query, where, getDocs, updateDoc, doc, serverTimestamp } from "firebase/firestore";
import jsQR from "jsqr";
import { db } from "../lib/firebase";
import "./Provision.css";

const STAFF_PASSWORD = import.meta.env.VITE_STAFF_PASSWORD || "changeme";
const BASE_URL = import.meta.env.VITE_APP_BASE_URL || window.location.origin;

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
  const [matchedDoc, setMatchedDoc] = useState(null);
  const [nfcSupported] = useState(() => typeof window !== "undefined" && "NDEFReader" in window);
  const [nfcError, setNfcError] = useState("");
  const [nfcListening, setNfcListening] = useState(false);

  const videoRef = useRef(null);
  const abortControllerRef = useRef(null);

  /* ---- Auth ---- */
  function handleLogin(e) {
    e.preventDefault();
    if (pwInput === STAFF_PASSWORD) {
      setAuthed(true);
      setPwError("");
    } else {
      setPwError("Incorrect password.");
    }
  }

  /* ---- QR decode handler ---- */
  const handleQrDecoded = useCallback(async (qrText) => {
    setScanError("");
    setLookupLoading(true);
    try {
      let payload;
      try {
        payload = JSON.parse(qrText);
      } catch (err) {
        payload = { id: qrText.trim(), type: "participant", v: 1 };
      }

      const q = query(
        collection(db, "registrations"),
        where("registrationId", "==", payload.id)
      );
      const snap = await getDocs(q);

      if (snap.empty) {
        setScanError(`No registration found for "${payload.id}". Rescan or check the QR code.`);
        setLookupLoading(false);
        return;
      }

      const docSnap = snap.docs[0];
      const data = docSnap.data();

      let writeUrl = "";
      if (data.type === "exhibitor") {
        writeUrl = data.website || data.brochureUrl || "";
      } else {
        writeUrl = `${BASE_URL}/p/${data.registrationId}`;
      }

      setMatchedDoc({ id: docSnap.id, data, writeUrl });
      setLookupLoading(false);

      if (data.nfcAssigned) {
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

  /* ---- QR scanner setup (optimized) ---- */
  useEffect(() => {
    if (!authed || step !== STEP_SCAN) return;

    let active = true;
    let scanInterval = null;
    const videoEl = videoRef.current;
    if (!videoEl) return;

    async function startScanner() {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: {
            facingMode: { ideal: "environment" },
            width: { ideal: 1280 }, // Higher res for better QR detection
            height: { ideal: 720 },
          },
        });
        if (!active) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }

        videoEl.srcObject = stream;
        await videoEl.play();
        console.log(
          "Camera resolution:",
          videoEl.videoWidth,
          "x",
          videoEl.videoHeight
        );

        // Create canvas once
        const canvas = document.createElement("canvas");
        const ctx = canvas.getContext("2d", {
          willReadFrequently: true,
        });

        let barcodeDetector = null;
        let useBarcodeDetector = false;

        if ("BarcodeDetector" in window) {
          try {
            barcodeDetector = new BarcodeDetector({ formats: ["qr_code"] });
            useBarcodeDetector = true;
            console.log("BarcodeDetector available and ready");
          } catch (err) {
            console.log("BarcodeDetector available but QR format not supported, falling back to jsQR");
          }
        } else {
          console.log("BarcodeDetector not available, using jsQR");
        }

        // Faster scan interval - 30ms = ~33 scans/sec
        // For jsQR fallback, use a smaller canvas to reduce processing
        // QR codes can be detected reliably at 320x240 resolution
        const processingCanvas = document.createElement("canvas");
        processingCanvas.width = 320;
        processingCanvas.height = 240;
        const processingCtx = processingCanvas.getContext("2d", {
          willReadFrequently: true,
        });

        scanInterval = setInterval(async () => {
          if (!active || videoEl.readyState < 2) return;

          try {
            let decodedText = null;

            if (useBarcodeDetector && barcodeDetector) {
              try {
                canvas.width = videoEl.videoWidth;
                canvas.height = videoEl.videoHeight;
                ctx.drawImage(videoEl, 0, 0);

                const barcodes = await barcodeDetector.detect(canvas);
                if (barcodes.length > 0 && barcodes[0].rawValue) {
                  decodedText = barcodes[0].rawValue;
                }
              } catch (err) {
                // BarcodeDetector failed this frame, fall back to jsQR
                console.log("BarcodeDetector failed, trying jsQR");
                useBarcodeDetector = false;
              }
            }

            // If BarcodeDetector didn't find anything, try jsQR with downsampled canvas
            if (!decodedText && !useBarcodeDetector) {
              processingCtx.drawImage(videoEl, 0, 0, 320, 240);
              const imageData = processingCtx.getImageData(0, 0, 320, 240);
              const code = jsQR(imageData.data, 320, 240);
              if (code?.data) {
                decodedText = code.data;
              }
            }

            if (decodedText && active) {
              active = false;
              clearInterval(scanInterval);
              stream.getTracks().forEach((t) => t.stop());
              handleQrDecoded(decodedText.trim());
            }
          } catch (err) {
            // Frame processing error, try next frame
            console.error("Scan error:", err);
          }
        }, 30); // 30ms interval for ~33 fps scanning

      } catch (err) {
        console.error(err);
        if (active) {
          setScanError("Couldn't access the camera. Check camera permissions for this site and reload.");
        }
      }
    }

    startScanner();

    return () => {
      active = false;
      if (scanInterval) clearInterval(scanInterval);
      if (videoEl && videoEl.srcObject) {
        videoEl.srcObject.getTracks().forEach((t) => t.stop());
      }
    };
  }, [authed, step, handleQrDecoded]);

  function rescan() {
    setScanError("");
    setMatchedDoc(null);
    setNfcError("");
    setStep(STEP_SCAN);
  }

  /* ---- NFC logic ---- */
  const assignChip = useCallback(
    async (serialNumber) => {
      if (!matchedDoc) return;
      try {
        await updateDoc(doc(db, "registrations", matchedDoc.id), {
          nfcUid: serialNumber || "manual_write",
          nfcAssigned: true,
          assignedAt: serverTimestamp(),
        });
        setStep(STEP_SUCCESS);
      } catch (err) {
        console.error(err);
        setNfcError("Wrote to chip successfully, but couldn't update Firestore. Check connection.");
      }
    },
    [matchedDoc]
  );

  const startNfcWrite = useCallback(async () => {
    if (!matchedDoc?.writeUrl) {
      setNfcError("No valid URL to write to this chip.");
      return;
    }

    setNfcError("");
    try {
      const controller = new AbortController();
      abortControllerRef.current = controller;

      // eslint-disable-next-line no-undef
      const ndef = new NDEFReader();
      setNfcListening(true);

      await ndef.write({
        records: [{ recordType: "url", data: matchedDoc.writeUrl }]
      }, { signal: controller.signal });

      setNfcListening(false);
      assignChip("written_by_web_nfc");

    } catch (err) {
      console.error(err);
      setNfcListening(false);
      if (err.name === "NotAllowedError") {
        setNfcError("NFC permission was denied. Allow NFC access for this site and try again.");
      } else {
        setNfcError("Failed to write. Make sure the chip is held steady against the back of the phone.");
      }
    }
  }, [assignChip, matchedDoc]);

  useEffect(() => {
    if (step !== STEP_TAP || !nfcSupported) return;

    startNfcWrite();

    return () => {
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
    };
  }, [step, nfcSupported, startNfcWrite]);

  function handleManualConfirm() {
    assignChip("manual_fallback");
  }

  /* ============================================================
     RENDER
     ============================================================ */

  if (!authed) {
    return (
      <div className="prov-page">
        <div className="prov-card glass">
          <span className="prov-eyebrow">Staff Access</span>
          <h1 className="prov-title">Provisioning Station</h1>
          <p className="prov-sub">Enter the staff password to continue.</p>
          <form onSubmit={handleLogin} className="prov-form">
            <input
              className="prov-input"
              type="password"
              placeholder="Password"
              value={pwInput}
              onChange={(e) => setPwInput(e.target.value)}
              autoFocus
            />
            {pwError && <div className="prov-alert prov-alert--error">{pwError}</div>}
            <button type="submit" className="prov-btn prov-btn--primary">Continue</button>
          </form>
        </div>
      </div>
    );
  }

  if (step === STEP_SUCCESS) {
    return (
      <div className="prov-page">
        <div className="prov-card glass prov-card--success">
          <div className="prov-success-icon">✓</div>
          <h1 className="prov-success-title">Chip programmed</h1>
          <p className="prov-success-name">
            {matchedDoc?.data?.type === "exhibitor" ? matchedDoc?.data?.orgName : matchedDoc?.data?.name}
          </p>
          <p className="prov-success-sub">
            Registration: {matchedDoc?.data?.registrationId}
          </p>
          <button className="prov-btn prov-btn--primary" onClick={rescan}>Scan next person</button>
        </div>
      </div>
    );
  }

  if (step === STEP_TAP || step === STEP_CONFIRM_OVERWRITE) {
    const isExhibitor = matchedDoc?.data?.type === "exhibitor";
    const displayName = isExhibitor ? matchedDoc?.data?.orgName : matchedDoc?.data?.name;
    const displaySub = isExhibitor ? matchedDoc?.data?.website : matchedDoc?.data?.role;

    return (
      <div className="prov-page">
        <div className="prov-card glass">
          <StepIndicator activeStep={2} />

          <div className={`prov-match-banner prov-match-banner--${matchedDoc?.data?.type}`}>
            <span className="prov-match-label">Matched {isExhibitor ? "Exhibitor" : "Participant"}</span>
            <h2 className="prov-match-name">{displayName}</h2>
            <p className="prov-match-sub">{displaySub}</p>
          </div>

          <div className="prov-write-preview">
            <span className="prov-write-preview-label">Will write NDEF URI:</span>
            <code className="prov-write-preview-url">{matchedDoc?.writeUrl}</code>
            <p className="prov-write-preview-hint">
              {isExhibitor
                ? "When tapped, chip will directly open this exhibitor's website."
                : "When tapped, chip will open their digital profile card."}
            </p>
          </div>

          {step === STEP_CONFIRM_OVERWRITE && (
            <div className="prov-alert prov-alert--warning">
              This registration already has an NFC chip assigned. Tapping a new one will overwrite the record.
              <button className="prov-btn prov-btn--warning" onClick={() => setStep(STEP_TAP)}>
                Continue anyway
              </button>
            </div>
          )}

          {step === STEP_TAP && (
            <>
              {nfcSupported ? (
                <div className="prov-nfc-zone">
                  <div className={`prov-pulse ${nfcListening ? "prov-pulse--active" : ""}`}>
                    <NfcIcon />
                  </div>
                  <p className="prov-nfc-instruction">Hold the chip to the back of the phone</p>
                  {nfcError && <div className="prov-alert prov-alert--error">{nfcError}</div>}
                </div>
              ) : (
                <div className="prov-manual-fallback">
                  <div className="prov-alert prov-alert--warning">
                    <strong>Web NFC not supported</strong><br />
                    Open <b>NFC Tools</b> app, select "Write", "Add a record", "URL/URI", and paste the link below.
                  </div>
                  <button className="prov-btn prov-btn--secondary" onClick={() => {
                    navigator.clipboard.writeText(matchedDoc?.writeUrl);
                  }}>
                    Copy URL
                  </button>
                  <button className="prov-btn prov-btn--primary" onClick={handleManualConfirm} style={{ marginTop: 10 }}>
                    Mark as Written Manually
                  </button>
                </div>
              )}
            </>
          )}

          <button className="prov-btn prov-btn--ghost" onClick={rescan}>Cancel, scan different QR</button>
        </div>
      </div>
    );
  }

  return (
    <div className="prov-page">
      <div className="prov-card glass">
        <StepIndicator activeStep={1} />
        <h1 className="prov-title">Scan QR code</h1>
        <p className="prov-sub">Point camera at attendee's QR to retrieve their profile.</p>

        <div className="prov-scanner-wrap">
          <video ref={videoRef} className="prov-scanner" playsInline autoPlay muted />
        </div>

        {lookupLoading && <div className="prov-loading">Looking up…</div>}
        {scanError && <div className="prov-alert prov-alert--error">{scanError}</div>}
      </div>
    </div>
  );
}

function StepIndicator({ activeStep }) {
  return (
    <div className="prov-steps">
      <div className={`prov-step ${activeStep >= 1 ? "prov-step--active" : ""}`}>1. Scan QR</div>
      <div className="prov-step-divider" />
      <div className={`prov-step ${activeStep >= 2 ? "prov-step--active" : ""}`}>2. Write Chip</div>
    </div>
  );
}

function NfcIcon() {
  return (
    <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M6 8.32a7.43 7.43 0 0 1 0 7.36" />
      <path d="M9.46 6.21a11.76 11.76 0 0 1 0 11.58" />
      <path d="M12.91 4.1a15.91 15.91 0 0 1 .01 15.8" />
      <path d="M16.37 2a20.16 20.16 0 0 1 0 20" />
    </svg>
  );
}