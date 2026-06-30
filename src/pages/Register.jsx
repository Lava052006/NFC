import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { collection, addDoc, serverTimestamp } from "firebase/firestore";
import { QRCodeCanvas } from "qrcode.react";
import { db, auth, createUserWithEmailAndPassword } from "../lib/firebase";
import { generateRegistrationId, buildQrPayload } from "../lib/generateId";
import "./Register.css";

/* ============================================================
   INITIAL FORM STATES
   ============================================================ */
const initialParticipant = {
  name: "",
  email: "",
  phone: "",
  organization: "",
  role: "",
  customRole: "",
  eventInterest: "",
};

const initialExhibitor = {
  orgName: "",
  contactName: "",
  contactEmail: "",
  contactPhone: "",
  website: "",
  brochureUrl: "",
  programs: "",
  tagline: "",
  password: "",
  confirmPassword: "",
};

const ROLES = ["Student", "Researcher", "Engineer", "Manager", "Educator", "Entrepreneur", "Other"];

/* ============================================================
   MAIN COMPONENT
   ============================================================ */
export default function Register({ type }) {
  const navigate = useNavigate();
  const isExhibitor = type === "exhibitor";

  const [form, setForm]           = useState(isExhibitor ? initialExhibitor : initialParticipant);
  const [status, setStatus]       = useState("idle"); // idle | saving | done | error
  const [errorMsg, setErrorMsg]   = useState("");
  const [regId, setRegId]         = useState("");
  const [qrPayload, setQrPayload] = useState("");
  /* ---- helpers ---- */
  function update(field, value) {
    setForm((f) => ({ ...f, [field]: value }));
  }

  function validate() {
    if (isExhibitor) {
      if (!form.orgName.trim())       return "Enter the organization name.";
      if (!form.contactName.trim())   return "Enter the contact person's name.";
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.contactEmail)) return "Enter a valid contact email.";
      if (!form.website.trim())       return "Enter the organization website URL.";
      if (form.website.trim() && !/^https?:\/\/.+/.test(form.website.trim()))
        return "Website must start with http:// or https://";
      if (form.brochureUrl.trim() && !/^https?:\/\/.+/.test(form.brochureUrl.trim()))
        return "Brochure URL must start with http:// or https://";
      if (!form.password)             return "Enter a password for your exhibitor account.";
      if (form.password.length < 6)   return "Password must be at least 6 characters.";
      if (form.password !== form.confirmPassword) return "Passwords do not match.";
    } else {
      if (!form.name.trim())          return "Enter your full name.";
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email)) return "Enter a valid email.";
      if (!form.organization.trim())  return "Enter your organization or institution.";
      if (!form.role)                 return "Select your role.";
      if (form.role === "Other" && !form.customRole.trim()) return "Please specify your role.";
    }
    return null;
  }

  /* ---- submit ---- */
  async function handleSubmit(e) {
    e.preventDefault();
    const validationError = validate();
    if (validationError) {
      setStatus("error");
      setErrorMsg(validationError);
      return;
    }

    setStatus("saving");
    const id = generateRegistrationId();
    const payload = buildQrPayload(id, type);

    try {
      if (isExhibitor) {
        const userCred = await createUserWithEmailAndPassword(
          auth,
          form.contactEmail.trim(),
          form.password
        );

        await addDoc(collection(db, "registrations"), {
          authUid:         userCred.user.uid,
          registrationId:  id,
          type:            "exhibitor",
          orgName:         form.orgName.trim(),
          contactName:     form.contactName.trim(),
          contactEmail:    form.contactEmail.trim(),
          contactPhone:    form.contactPhone.trim() || null,
          website:         form.website.trim(),
          brochureUrl:     form.brochureUrl.trim() || null,
          programs:        form.programs.trim() || null,
          tagline:         form.tagline.trim() || null,
          nfcUid:          null,
          nfcAssigned:     false,
          createdAt:       serverTimestamp(),
        });
      } else {
        const effectiveRole = form.role === "Other" ? form.customRole.trim() : form.role;
        await addDoc(collection(db, "registrations"), {
          registrationId:  id,
          type:            "participant",
          name:            form.name.trim(),
          email:           form.email.trim(),
          phone:           form.phone.trim() || null,
          organization:    form.organization.trim(),
          role:            effectiveRole,
          eventInterest:   form.eventInterest.trim() || null,
          nfcUid:          null,
          nfcAssigned:     false,
          createdAt:       serverTimestamp(),
        });
      }

      setRegId(id);
      setQrPayload(payload);
      setStatus("done");
    } catch (err) {
      console.error(err);
      setStatus("error");
      setErrorMsg("Couldn't save your registration. Check your connection and try again.");
    }
  }

  /* ---- QR download ---- */
  function downloadQr() {
    const canvas = document.getElementById("reg-qr-canvas");
    if (!canvas) return;
    const link = document.createElement("a");
    link.href = canvas.toDataURL("image/png");
    link.download = `${regId}.png`;
    link.click();
  }

  function startOver() {
    setForm(isExhibitor ? initialExhibitor : initialParticipant);
    setStatus("idle");
    setErrorMsg("");
    setRegId("");
    setQrPayload("");
  }

  /* ============================================================
     SUCCESS SCREEN
     ============================================================ */
  if (status === "done") {
    const displayName = isExhibitor ? form.orgName : form.name;
    const displaySub  = isExhibitor
      ? (form.tagline || form.website)
      : `${form.organization} · ${form.role === "Other" ? form.customRole : form.role}`;

    return (
      <>
        <div className="bg-grid" aria-hidden="true" />
        <div className="orb orb-1" aria-hidden="true" />
        <div className="orb orb-2" aria-hidden="true" />

        <main className="reg-page">
          <div className={`reg-card reg-card--success glass`} role="main">

            {/* Success badge */}
            <div className="success-badge" aria-label="Registration complete">
              <SuccessIcon />
            </div>

            <span className={`reg-eyebrow reg-eyebrow--${type}`}>
              {isExhibitor ? "Exhibitor" : "Participant"} Registered
            </span>
            <h1 className="success-name">{displayName}</h1>
            <p className="success-sub">{displaySub}</p>

            {/* QR code */}
            <div className="qr-container" aria-label="Your registration QR code">
              <div className="qr-inner">
                <QRCodeCanvas
                  id="reg-qr-canvas"
                  value={qrPayload}
                  size={200}
                  bgColor="#ffffff"
                  fgColor="#0a0d14"
                  level="L"
                  includeMargin={false}
                />
              </div>
              <div className="qr-id" aria-label={`Registration ID: ${regId}`}>
                {regId}
              </div>
              <p className="qr-hint">
                {isExhibitor
                  ? "Bring this QR to the NFC counter — your chip will be programmed with your website."
                  : "Bring this QR to the NFC counter — your chip will carry your contact details."}
              </p>
            </div>

            {/* NFC info chip */}
            <div className={`nfc-info-banner nfc-info-banner--${type}`}>
              <NfcIcon />
              <div>
                <strong>What goes on your NFC chip</strong>
                {isExhibitor ? (
                  <p>{form.website}</p>
                ) : (
                  <p>{form.name} · {form.email}</p>
                )}
              </div>
            </div>

            {isExhibitor && (
              <div className="reg-credentials-banner">
                <strong>Login credentials saved</strong>
                <p>Email: {form.contactEmail}</p>
                <p>Password: <code className="reg-password-display">{form.password}</code></p>
                <p className="reg-credentials-hint">
                  Use these to sign in to your exhibitor dashboard at /exhibit/{regId}
                </p>
              </div>
            )}

            <div className="success-actions">
              <button className={`reg-btn reg-btn--primary reg-btn--${type}`} onClick={downloadQr}>
                <DownloadIcon /> Download QR Code
              </button>
              <button className="reg-btn reg-btn--ghost" onClick={startOver}>
                Register another {isExhibitor ? "exhibitor" : "participant"}
              </button>
              <button className="reg-btn reg-btn--ghost" onClick={() => navigate("/")}>
                Back to home
              </button>
            </div>
          </div>
        </main>
      </>
    );
  }

  /* ============================================================
     REGISTRATION FORM
     ============================================================ */
  return (
    <>
      <div className="bg-grid" aria-hidden="true" />
      <div className="orb orb-1" aria-hidden="true" />
      <div className="orb orb-2" aria-hidden="true" />

      <main className="reg-page">
        <div className={`reg-card glass`} role="main">

          {/* Back link */}
          <button
            className="reg-back"
            onClick={() => navigate("/")}
            aria-label="Back to home"
          >
            <BackIcon /> Back
          </button>

          {/* Header */}
          <div className="reg-header">
            <span className={`reg-eyebrow reg-eyebrow--${type}`}>
              {isExhibitor ? "Exhibitor Registration" : "Participant Registration"}
            </span>
            <h1 className="reg-title">
              {isExhibitor ? "Register your organization" : "Register for the event"}
            </h1>
            <p className="reg-subtitle">
              {isExhibitor
                ? "Fill in your organization details. Attendees will be able to tap your NFC chip to visit your website or brochure."
                : "Fill in your details once. You'll get a QR code to collect your NFC chip at the counter."}
            </p>
          </div>

          {/* Form */}
          <form onSubmit={handleSubmit} className="reg-form" noValidate>
            {isExhibitor ? (
              <ExhibitorForm form={form} update={update} />
            ) : (
              <ParticipantForm form={form} update={update} />
            )}

            {status === "error" && (
              <div className="reg-alert reg-alert--error" role="alert">
                <ErrorIcon /> {errorMsg}
              </div>
            )}

            <button
              type="submit"
              id="btn-register"
              className={`reg-btn reg-btn--primary reg-btn--${type}`}
              disabled={status === "saving"}
              aria-busy={status === "saving"}
            >
              {status === "saving" ? (
                <><SpinnerIcon /> Saving…</>
              ) : (
                <>{isExhibitor ? "Register Organization" : "Register & Get QR"} <ArrowIcon /></>
              )}
            </button>
          </form>
        </div>
      </main>
    </>
  );
}

/* ============================================================
   PARTICIPANT FORM
   ============================================================ */
function ParticipantForm({ form, update }) {
  return (
    <fieldset className="reg-fieldset">
      <legend className="reg-fieldset-legend">Personal Details</legend>

      <Field label="Full name" required>
        <input
          id="field-name"
          type="text"
          value={form.name}
          onChange={(e) => update("name", e.target.value)}
          placeholder="Lavanya Iyer"
          autoComplete="name"
          required
        />
      </Field>

      <div className="reg-row">
        <Field label="Email" required>
          <input
            id="field-email"
            type="email"
            value={form.email}
            onChange={(e) => update("email", e.target.value)}
            placeholder="you@example.com"
            autoComplete="email"
            required
          />
        </Field>
        <Field label="Phone" optional>
          <input
            id="field-phone"
            type="tel"
            value={form.phone}
            onChange={(e) => update("phone", e.target.value)}
            placeholder="+91 90000 00000"
            autoComplete="tel"
          />
        </Field>
      </div>

      <Field label="Organization / Institution" required>
        <input
          id="field-organization"
          type="text"
          value={form.organization}
          onChange={(e) => update("organization", e.target.value)}
          placeholder="BITS Pilani, IIT Bombay…"
          autoComplete="organization"
          required
        />
      </Field>

      <div className="reg-row">
        <Field label="Role / Designation" required>
          <select
            id="field-role"
            value={form.role}
            onChange={(e) => update("role", e.target.value)}
            required
          >
            <option value="" disabled>Select role…</option>
            {ROLES.map((r) => (
              <option key={r} value={r}>{r}</option>
            ))}
          </select>
        </Field>

        {form.role === "Other" && (
          <Field label="Specify role" required>
            <input
              id="field-custom-role"
              type="text"
              value={form.customRole}
              onChange={(e) => update("customRole", e.target.value)}
              placeholder="e.g. Journalist"
              required
            />
          </Field>
        )}
      </div>

      <Field label="Area of interest" optional>
        <input
          id="field-event-interest"
          type="text"
          value={form.eventInterest}
          onChange={(e) => update("eventInterest", e.target.value)}
          placeholder="e.g. Engineering programs abroad"
        />
      </Field>
    </fieldset>
  );
}

/* ============================================================
   EXHIBITOR FORM
   ============================================================ */
function ExhibitorForm({ form, update }) {
  return (
    <>
      <fieldset className="reg-fieldset">
        <legend className="reg-fieldset-legend">Organization Details</legend>

        <Field label="University / Organization name" required>
          <input
            id="field-org-name"
            type="text"
            value={form.orgName}
            onChange={(e) => update("orgName", e.target.value)}
            placeholder="Massachusetts Institute of Technology"
            autoComplete="organization"
            required
          />
        </Field>

        <Field label="Short tagline" optional>
          <input
            id="field-tagline"
            type="text"
            value={form.tagline}
            onChange={(e) => update("tagline", e.target.value)}
            placeholder="e.g. Mind and Hand"
            maxLength={80}
          />
        </Field>

        <Field label="Programs / Categories offered" optional>
          <input
            id="field-programs"
            type="text"
            value={form.programs}
            onChange={(e) => update("programs", e.target.value)}
            placeholder="e.g. Engineering, CS, MBA, Arts"
          />
        </Field>
      </fieldset>

      <fieldset className="reg-fieldset">
        <legend className="reg-fieldset-legend">
          NFC Content
          <span className="reg-fieldset-note">This is what gets written to the chip</span>
        </legend>

        <Field
          label="Website URL"
          required
          hint="Primary content for the NFC chip — attendees tap the chip to open this."
        >
          <input
            id="field-website"
            type="url"
            value={form.website}
            onChange={(e) => update("website", e.target.value)}
            placeholder="https://mit.edu"
            autoComplete="url"
            required
          />
        </Field>

        <Field
          label="Brochure / Info sheet URL"
          optional
          hint="Optional fallback — e.g. a Google Drive PDF or hosted brochure link."
        >
          <input
            id="field-brochure"
            type="url"
            value={form.brochureUrl}
            onChange={(e) => update("brochureUrl", e.target.value)}
            placeholder="https://drive.google.com/…"
          />
        </Field>
      </fieldset>

      <fieldset className="reg-fieldset">
        <legend className="reg-fieldset-legend">Contact Person</legend>

        <div className="reg-row">
          <Field label="Contact name" required>
            <input
              id="field-contact-name"
              type="text"
              value={form.contactName}
              onChange={(e) => update("contactName", e.target.value)}
              placeholder="Dr. Priya Nair"
              autoComplete="name"
              required
            />
          </Field>
          <Field label="Contact phone" optional>
            <input
              id="field-contact-phone"
              type="tel"
              value={form.contactPhone}
              onChange={(e) => update("contactPhone", e.target.value)}
              placeholder="+91 80000 00000"
              autoComplete="tel"
            />
          </Field>
        </div>

        <Field label="Contact email" required>
          <input
            id="field-contact-email"
            type="email"
            value={form.contactEmail}
            onChange={(e) => update("contactEmail", e.target.value)}
            placeholder="admissions@university.edu"
            autoComplete="email"
            required
          />
        </Field>
      </fieldset>

      <fieldset className="reg-fieldset">
        <legend className="reg-fieldset-legend">
          Account Password
          <span className="reg-fieldset-note">Used to sign in to your dashboard</span>
        </legend>

        <Field label="Password" required hint="At least 6 characters.">
          <input
            id="field-password"
            type="password"
            value={form.password}
            onChange={(e) => update("password", e.target.value)}
            placeholder="Create a password"
            autoComplete="new-password"
            required
          />
        </Field>

        <Field label="Confirm password" required>
          <input
            id="field-confirm-password"
            type="password"
            value={form.confirmPassword}
            onChange={(e) => update("confirmPassword", e.target.value)}
            placeholder="Re-enter your password"
            autoComplete="new-password"
            required
          />
        </Field>
      </fieldset>
    </>
  );
}

/* ============================================================
   FIELD WRAPPER
   ============================================================ */
function Field({ label, required, optional, hint, children }) {
  return (
    <div className="reg-field">
      <label className="reg-label">
        {label}
        {required && <span className="reg-required" aria-hidden="true">*</span>}
        {optional && <span className="reg-optional">(optional)</span>}
      </label>
      {children}
      {hint && <span className="reg-hint">{hint}</span>}
    </div>
  );
}

/* ============================================================
   ICONS
   ============================================================ */
function SuccessIcon() {
  return (
    <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <polyline points="20 6 9 17 4 12" />
    </svg>
  );
}
function NfcIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M6 8.32a7.43 7.43 0 0 1 0 7.36" />
      <path d="M9.46 6.21a11.76 11.76 0 0 1 0 11.58" />
      <path d="M12.91 4.1a15.91 15.91 0 0 1 .01 15.8" />
      <path d="M16.37 2a20.16 20.16 0 0 1 0 20" />
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
function BackIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M19 12H5M12 19l-7-7 7-7" />
    </svg>
  );
}
function ArrowIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M5 12h14M12 5l7 7-7 7" />
    </svg>
  );
}
function ErrorIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <circle cx="12" cy="12" r="10" />
      <line x1="12" y1="8" x2="12" y2="12" />
      <line x1="12" y1="16" x2="12.01" y2="16" />
    </svg>
  );
}
function SpinnerIcon() {
  return (
    <svg className="spinner-icon" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" aria-hidden="true">
      <path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83" />
    </svg>
  );
}
