import FormLabel, { RequiredLegend } from "./FormLabel";
import { useState } from "react";
import { Button } from "@mui/material";
import AppModal from "./AppModal";
import ExportExcelButton from "./ExportExcelButton";
import RawBackupButton from "./RawBackupButton.jsx";
import { canResetData } from "../services/dataReset.js";

export default function ResetDataModal({ onClose, onReset }) {
    const [confirmation, setConfirmation] = useState("");
    const [exporting, setExporting] = useState(false);
    const [error, setError] = useState("");
    function reset() {
        if (!canResetData(confirmation) || exporting) return;
        const result = onReset(confirmation);
        if (!result.ok) setError(result.message);
    }
    return <AppModal title="Eliminar todos los datos de CalcQuim" onClose={onClose} actions={<><Button color="inherit" onClick={onClose}>Cancelar</Button><Button color="error" variant="contained" disabled={!canResetData(confirmation) || exporting} onClick={reset}>Eliminar todos los datos</Button></>}>
        <p>Esta acción eliminará permanentemente todos los datos de CalcQuim almacenados en este dispositivo.</p>
        <p>Se eliminarán productos, categorías, líneas, grupos de precio, ventas, compras, proveedores, abastecimiento, costos y sus historiales.</p>
        <p className="text-danger fw-semibold">Esta acción no se puede deshacer.</p>
        <section className="alert alert-warning"><p>Se recomienda exportar un respaldo antes de continuar. Solo el archivo JSON permite restaurar los datos.</p><RawBackupButton primary /><div className="mt-2"><ExportExcelButton scope="full" onBusy={setExporting}>Exportar Excel de consulta</ExportExcelButton></div></section>
        <RequiredLegend />
        <FormLabel required htmlFor="resetConfirmation">Para continuar escribe exactamente <strong>ELIMINAR</strong></FormLabel>
        <input id="resetConfirmation" required aria-required="true" className="form-control" value={confirmation} onChange={e => setConfirmation(e.target.value)} autoComplete="off" spellCheck={false} />
        {error && <p className="alert alert-danger mt-3" role="alert">{error}</p>}
    </AppModal>;
}
