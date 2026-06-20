import { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { collection, query, where, getDocs } from "firebase/firestore";
import { db } from "../lib/firebase";
import "./Profile.css";

/**
 * Public profile card — rendered when someone taps a participant's NFC chip.
 * The chip stores: https://your-domain.com/p/EVT-A3K9MZ
 * This page fetches the registration doc by that ID and shows the contact card.
 */
export default function Profile() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [status, setStatus] = useState("loading"); // loading | found | notfound | error
  const [data, setData] = useState(null);

  useEffect(() => {
    if (!id) { setStatus("notfound"); return; }

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

        const doc = snap.docs[0].data();
        // Only show participant profiles on this page
        if (doc.type !== "participant") {
          setStatus("notfound");
          return;
        }

        setData(doc);
        setStatus("found");
      } catch (err) {
        console.error(err);
        if (!cancelled) setStatus("error");
      }
    })();

    return () => { cancelled = true; };
  }, [id]);

  /* ---- Loading ---- */
  if (status === "loading") {
    return (
      <div className="profile-page">
        <div className="profile-loading">
          <div className="profile-spinner" aria-label="Loading" />
          <p>Loading profile…</p>
        </div>
      </div>
    );
  }

  /* ---- Not found / Error ---- */
  if (status === "notfound" || status === "error") {
    return (
      <div className="profile-page">
        <div className="profile-error-card glass">
          <div className="profile-error-icon" aria-hidden="true">
            <NfcIcon />
          </div>
          <h1 className="profile-error-title">
            {status === "error" ? "Something went wrong" : "Profile not found"}
          </h1>
          <p className="profile-error-sub">
            {status === "error"
              ? "Check your connection and try again."
              : "This NFC chip doesn't match any registered participant."}
          </p>
          <button className="profile-btn" onClick={() => navigate("/")}>
            Go to event registration
          </button>
        </div>
      </div>
    );
  }

  /* ---- Profile card ---- */
  const initials = data.name
    .split(" ")
    .map((w) => w[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();

  return (
    <>
      <div className="bg-grid" aria-hidden="true" />
      <div className="orb orb-1" aria-hidden="true" />
      <div className="orb orb-2" aria-hidden="true" />

      <main className="profile-page">
        <article className="profile-card glass" aria-label={`Profile card for ${data.name}`}>

          {/* NFC badge */}
          <div className="profile-nfc-badge" aria-label="NFC participant card">
            <NfcIcon /> NFC Participant
          </div>

          {/* Avatar */}
          <div className="profile-avatar" aria-hidden="true">
            {initials}
          </div>

          {/* Name & role */}
          <h1 className="profile-name">{data.name}</h1>
          <p className="profile-role">
            {data.role}
            {data.organization && <> &middot; {data.organization}</>}
          </p>

          {/* Divider */}
          <div className="profile-divider" role="separator" />

          {/* Contact details */}
          <ul className="profile-details" aria-label="Contact details">
            {data.email && (
              <li className="profile-detail">
                <span className="profile-detail-icon" aria-hidden="true"><EmailIcon /></span>
                <div className="profile-detail-content">
                  <span className="profile-detail-label">Email</span>
                  <a
                    href={`mailto:${data.email}`}
                    className="profile-detail-value profile-detail-link"
                  >
                    {data.email}
                  </a>
                </div>
              </li>
            )}

            {data.phone && (
              <li className="profile-detail">
                <span className="profile-detail-icon" aria-hidden="true"><PhoneIcon /></span>
                <div className="profile-detail-content">
                  <span className="profile-detail-label">Phone</span>
                  <a
                    href={`tel:${data.phone}`}
                    className="profile-detail-value profile-detail-link"
                  >
                    {data.phone}
                  </a>
                </div>
              </li>
            )}

            {data.organization && (
              <li className="profile-detail">
                <span className="profile-detail-icon" aria-hidden="true"><OrgIcon /></span>
                <div className="profile-detail-content">
                  <span className="profile-detail-label">Organization</span>
                  <span className="profile-detail-value">{data.organization}</span>
                </div>
              </li>
            )}

            {data.eventInterest && (
              <li className="profile-detail">
                <span className="profile-detail-icon" aria-hidden="true"><StarIcon /></span>
                <div className="profile-detail-content">
                  <span className="profile-detail-label">Interested in</span>
                  <span className="profile-detail-value">{data.eventInterest}</span>
                </div>
              </li>
            )}
          </ul>

          {/* Registration ID */}
          <div className="profile-reg-id" aria-label={`Registration ID: ${data.registrationId}`}>
            <span className="profile-reg-id-label">ID</span>
            <span className="profile-reg-id-value">{data.registrationId}</span>
          </div>
        </article>

        <p className="profile-footnote">
          Powered by NFC Event System &middot; Tap a chip to view a profile
        </p>
      </main>
    </>
  );
}

/* ---- Icons ---- */
function NfcIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M6 8.32a7.43 7.43 0 0 1 0 7.36" />
      <path d="M9.46 6.21a11.76 11.76 0 0 1 0 11.58" />
      <path d="M12.91 4.1a15.91 15.91 0 0 1 .01 15.8" />
      <path d="M16.37 2a20.16 20.16 0 0 1 0 20" />
    </svg>
  );
}
function EmailIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <rect x="2" y="4" width="20" height="16" rx="2" />
      <path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7" />
    </svg>
  );
}
function PhoneIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07A19.5 19.5 0 0 1 4.69 12 19.79 19.79 0 0 1 1.61 3.28 2 2 0 0 1 3.6 1h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L7.91 8.6a16 16 0 0 0 6 6l.92-.92a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z" />
    </svg>
  );
}
function OrgIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <rect x="2" y="7" width="20" height="14" rx="2" />
      <path d="M16 7V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v2" />
    </svg>
  );
}
function StarIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
    </svg>
  );
}
