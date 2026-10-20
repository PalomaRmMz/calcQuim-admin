import { useState } from "react";
import { Button } from "@mui/material";
import AppModal from "./AppModal";
import Feedback from "./Feedback";

export default function ConfirmDialog({ title = "Eliminar registro", children, onClose, onConfirm, confirmText = "Eliminar" }) {
    const [error, setError] = useState("");
    function confirm() {
        const result = onConfirm();
        if (result && !result.ok) setError(result.message);
        else onClose();
    }
    return <AppModal title={title} onClose={onClose} maxWidth="xs" actions={<><Button autoFocus color="inherit" onClick={onClose}>Cancelar</Button><Button color="error" variant="contained" onClick={confirm}>{confirmText}</Button></>}><p>{children}</p><Feedback message={error} /></AppModal>;
}
