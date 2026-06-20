import { Link } from "react-router-dom";
import "./Home.css";

export default function Home() {
  return (
    <div className="page">
      <div className="card home-card">
        <span className="eyebrow">NFC ring system</span>
        <h1 className="page-title">Phase 1: registration &amp; ring provisioning</h1>
        <p className="page-sub">Choose where you're starting from.</p>

        <Link to="/register" className="btn btn--primary home-link">
          I'm registering for the event
        </Link>
        <Link to="/provision" className="btn btn--ghost home-link">
          Staff: provision a ring
        </Link>
      </div>
    </div>
  );
}
