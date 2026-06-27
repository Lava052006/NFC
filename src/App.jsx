import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import Home from "./pages/Home";
import Register from "./pages/Register";
import Provision from "./pages/Provision";
import Profile from "./pages/Profile";
import Exhibitor from "./pages/Exhibitor";

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/register/participant" element={<Register type="participant" />} />
        <Route path="/register/exhibitor" element={<Register type="exhibitor" />} />
        <Route path="/register" element={<Navigate to="/" replace />} />
        <Route path="/provision" element={<Provision />} />
        <Route path="/p/:id" element={<Profile />} />
        {/* <Route path="/exhibit/:id" element={<Exhibitor />} /> */}
      </Routes>
    </BrowserRouter>
  );
}
