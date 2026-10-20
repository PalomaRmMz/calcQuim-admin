import { useState } from "react";
import { downloadRawBackup } from "../services/rawBackup.js";
import Feedback from "./Feedback";

export default function RawBackupButton({ primary = false }) {
    const [error, setError] = useState("");
    return <><button type="button" className={primary ? 'btn btn-primary' : 'btn btn-outline-secondary'} onClick={() => {
        try { downloadRawBackup(); setError(""); }
        catch (failure) { setError(`No se generó el respaldo original: ${failure.message}`); }
    }}>Descargar respaldo original (JSON)</button><Feedback message={error} /></>;
}
