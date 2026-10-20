import { useEffect, useState } from "react";
import { acquireDataSession } from "../services/dataSession.js";
import RawBackupButton from "./RawBackupButton.jsx";

export default function DataSessionGate({ children }) {
    const [status, setStatus] = useState("pending");
    const [attempt, setAttempt] = useState(0);
    useEffect(() => {
        const session = acquireDataSession(navigator.locks, setStatus);
        return session.release;
    }, [attempt]);
    if (status === "active") return children;
    return <main className="container py-5" aria-live="polite">
        <h1>CalcQuim</h1>
        {status === "pending" ? <p>Abriendo los datos de este dispositivo…</p> : <>
            <p role="alert">{status === "busy"
                ? "CalcQuim ya está abierto en otra pestaña. Usa esa pestaña o ciérrala antes de continuar aquí para evitar cambios simultáneos."
                : "No se pudo abrir una sesión segura. Usa un navegador actualizado en HTTPS o localhost. Tus datos se conservaron sin cambios."}</p>
            <button type="button" className="btn btn-primary" onClick={() => { setStatus("pending"); setAttempt(value => value + 1); }}>Volver a intentar</button>
            {status !== "busy" && <div className="mt-3"><RawBackupButton /></div>}
        </>}
    </main>;
}
