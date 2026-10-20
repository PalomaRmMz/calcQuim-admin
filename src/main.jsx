import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router";
import "bootstrap/dist/css/bootstrap.min.css";
import ApplicationRoot from "./ApplicationRoot.jsx";
import DataSessionGate from "./components/DataSessionGate.jsx";

createRoot(document.getElementById("root")).render(
  <StrictMode>
    <BrowserRouter>
      <DataSessionGate><ApplicationRoot /></DataSessionGate>
    </BrowserRouter>
  </StrictMode>
);
