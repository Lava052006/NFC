import { useNavigate } from "react-router-dom";
import "./Home.css";

export default function Home() {
  const navigate = useNavigate();

  return (
    <>
      {/* Ambient background */}
      <div className="bg-grid" aria-hidden="true" />
      <div className="orb orb-1" aria-hidden="true" />
      <div className="orb orb-2" aria-hidden="true" />
      <div className="orb orb-3" aria-hidden="true" />

      <main className="home-page">
        {/* Header */}
        <header className="home-header">
          <div className="home-badge">
            <span className="home-badge-dot" />
            NFC Event System
          </div>
          <h1 className="home-title">
            Register for the{" "}
            <span className="text-gradient">Event</span>
          </h1>
          <p className="home-subtitle">
            Choose your role to get started. You&rsquo;ll receive a unique QR code
            that will be used to program your NFC chip at the counter.
          </p>
        </header>

        {/* Role cards */}
        <div className="role-grid" role="list">
          {/* Participant */}
          <RoleCard
            id="role-participant"
            role="Participant"
            accent="participant"
            icon={<ParticipantIcon />}
            description="Students, visitors, and professionals attending the event."
            features={["Personal contact details", "Role & organization", "Contact card on NFC chip"]}
            cta="Register as Participant"
            onClick={() => navigate("/register/participant")}
          />

          {/* Exhibitor */}
          <RoleCard
            id="role-exhibitor"
            role="Exhibitor"
            accent="exhibitor"
            icon={<ExhibitorIcon />}
            description="Universities, colleges, and organizations showcasing at the event."
            features={["Organization profile", "Website & brochure URL", "Website link on NFC chip"]}
            cta="Register as Exhibitor"
            onClick={() => navigate("/register/exhibitor")}
          />
        </div>

        {/* Footer note */}
        <p className="home-footnote">
          Already registered? Bring your QR code to the NFC counter to collect your chip.
        </p>
      </main>
    </>
  );
}

function RoleCard({ id, role, accent, icon, description, features, cta, onClick }) {
  return (
    <article className={`role-card role-card--${accent}`} role="listitem">
      <div className="role-card-inner">
        <div className={`role-icon-wrap role-icon-wrap--${accent}`}>
          {icon}
        </div>
        <div className={`role-tag role-tag--${accent}`}>{role}</div>
        <p className="role-desc">{description}</p>

        <ul className="role-features" aria-label={`${role} features`}>
          {features.map((f) => (
            <li key={f} className="role-feature">
              <span className={`role-feature-dot role-feature-dot--${accent}`} aria-hidden="true" />
              {f}
            </li>
          ))}
        </ul>

        <button
          id={id}
          className={`role-btn role-btn--${accent}`}
          onClick={onClick}
          aria-label={`Register as ${role}`}
        >
          {cta}
          <ArrowIcon />
        </button>
      </div>
    </article>
  );
}

/* ---- Icons ---- */
function ParticipantIcon() {
  return (
    <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <circle cx="12" cy="8" r="4" />
      <path d="M4 20c0-4 3.6-7 8-7s8 3 8 7" />
    </svg>
  );
}

function ExhibitorIcon() {
  return (
    <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <rect x="2" y="7" width="20" height="14" rx="2" />
      <path d="M16 7V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v2" />
      <line x1="12" y1="12" x2="12" y2="16" />
      <line x1="10" y1="14" x2="14" y2="14" />
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
