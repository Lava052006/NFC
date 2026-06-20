import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import Home from "./pages/Home";
import Register from "./pages/Register";
import Provision from "./pages/Provision";

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Home />} />
        {/* Explicit routes for both registration types */}
        <Route path="/register/participant" element={<Register type="participant" />} />
        <Route path="/register/exhibitor"   element={<Register type="exhibitor" />} />
        {/* Redirect bare /register to home */}
        <Route path="/register" element={<Navigate to="/" replace />} />
        <Route path="/provision" element={<Provision />} />
      </Routes>
    </BrowserRouter>
  );
}
