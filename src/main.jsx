import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router";
import "bootstrap/dist/css/bootstrap.min.css";
import ApplicationRoot from "./ApplicationRoot.jsx";
import DataSessionGate from "./components/DataSessionGate.jsx";
import PostgresApplication from './PostgresApplication.jsx';

createRoot(document.getElementById("root")).render(
  <StrictMode>
    <BrowserRouter>
      {import.meta.env.CALCQUIM_OPERATIONAL ? <PostgresApplication operational /> : import.meta.env.MODE === 'postgres-sandbox' ? <PostgresApplication /> : <DataSessionGate><ApplicationRoot /></DataSessionGate>}
    </BrowserRouter>
  </StrictMode>
);
