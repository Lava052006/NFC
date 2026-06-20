import { useState } from "react";
import { collection, addDoc, serverTimestamp } from "firebase/firestore";
import { QRCodeCanvas } from "qrcode.react";
import { db } from "../lib/firebase";
import { generateRegistrationId } from "../lib/generateId";
import "./Register.css";

const initialForm = {
  name: "",
  email: "",
  company: "",
  category: "Visitor",
  phone: "",
};

export default function Register() {
  const [form, setForm] = useState(initialForm);
  const [status, setStatus] = useState("idle"); // idle | saving | done | error
  const [errorMsg, setErrorMsg] = useState("");
  const [registrationId, setRegistrationId] = useState("");

  function update(field, value) {
    setForm((f) => ({ ...f, [field]: value }));
  }

  function validate() {
    if (!form.name.trim()) return "Enter a name.";
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email)) return "Enter a valid email.";
    if (!form.company.trim()) return "Enter a company or organization.";
    return null;
  }

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

    try {
      await addDoc(collection(db, "registrations"), {
        registrationId: id,
        name: form.name.trim(),
        email: form.email.trim(),
        company: form.company.trim(),
        category: form.category,
        phone: form.phone.trim() || null,
        ringUid: null,
        ringAssigned: false,
        createdAt: serverTimestamp(),
      });
      setRegistrationId(id);
      setStatus("done");
    } catch (err) {
      console.error(err);
      setStatus("error");
      setErrorMsg("Couldn't save your registration. Check your connection and try again.");
    }
  }

  function downloadQr() {
    const canvas = document.getElementById("reg-qr-canvas");
    if (!canvas) return;
    const url = canvas.toDataURL("image/png");
    const link = document.createElement("a");
    link.href = url;
    link.download = `${registrationId}.png`;
    link.click();
  }

  function startOver() {
    setForm(initialForm);
    setStatus("idle");
    setErrorMsg("");
    setRegistrationId("");
  }

  if (status === "done") {
    return (
      <div className="page">
        <div className="card confirm-card">
          <span className="eyebrow eyebrow--done">Registered</span>
          <h1 className="confirm-name">{form.name}</h1>
          <p className="confirm-sub">{form.company} &middot; {form.category}</p>

          <div className="qr-wrap">
            <QRCodeCanvas
              id="reg-qr-canvas"
              value={registrationId}
              size={220}
              bgColor="#ffffff"
              fgColor="#14171f"
              level="M"
            />
          </div>

          <div className="reg-id">{registrationId}</div>
          <p className="confirm-hint">
            Bring this QR code to the counter to collect your ring.
          </p>

          <button className="btn btn--primary" onClick={downloadQr}>
            Download QR code
          </button>
          <button className="btn btn--ghost" onClick={startOver}>
            Register another person
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="page">
      <div className="card">
        <span className="eyebrow">Event registration</span>
        <h1 className="page-title">Get your ring credential</h1>
        <p className="page-sub">
          Fill this in once. You'll get a QR code to bring to the counter.
        </p>

        <form onSubmit={handleSubmit} className="form">
          <label className="field">
            <span>Full name</span>
            <input
              type="text"
              value={form.name}
              onChange={(e) => update("name", e.target.value)}
              placeholder="Lavanya Iyer"
              autoComplete="name"
            />
          </label>

          <label className="field">
            <span>Email</span>
            <input
              type="email"
              value={form.email}
              onChange={(e) => update("email", e.target.value)}
              placeholder="you@company.com"
              autoComplete="email"
            />
          </label>

          <label className="field">
            <span>Company / organization</span>
            <input
              type="text"
              value={form.company}
              onChange={(e) => update("company", e.target.value)}
              placeholder="GreenFiber Co."
              autoComplete="organization"
            />
          </label>

          <label className="field">
            <span>Category</span>
            <select value={form.category} onChange={(e) => update("category", e.target.value)}>
              <option value="Visitor">Visitor</option>
              <option value="Exhibitor">Exhibitor</option>
            </select>
          </label>

          <label className="field">
            <span>Phone <span className="optional">(optional)</span></span>
            <input
              type="tel"
              value={form.phone}
              onChange={(e) => update("phone", e.target.value)}
              placeholder="+91 90000 00000"
              autoComplete="tel"
            />
          </label>

          {status === "error" && <div className="alert alert--error">{errorMsg}</div>}

          <button type="submit" className="btn btn--primary" disabled={status === "saving"}>
            {status === "saving" ? "Saving…" : "Register"}
          </button>
        </form>
      </div>
    </div>
  );
}
