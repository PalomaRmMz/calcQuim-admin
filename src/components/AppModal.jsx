import ModalHeader from "./ModalHeader";
import ValidatedForm from './ValidatedForm';
import { useId } from "react";
import { Dialog, DialogContent, DialogActions, Button } from "@mui/material";

export default function AppModal({ title, subtitle, icon, children, onClose, onSubmit, actions, submitLabel = "Guardar cambios", maxWidth = "sm" }) {
    const titleId = useId();
    const content = <>
        <ModalHeader titleId={titleId} title={title} subtitle={subtitle} icon={icon} onClose={onClose} />
        <DialogContent className="sale-modal-body">{children}</DialogContent>
        <DialogActions className="sale-modal-actions">{actions || <><Button color="inherit" onClick={onClose}>{onSubmit ? "Cancelar" : "Cerrar"}</Button>{onSubmit && <Button type="submit" variant="contained" disableElevation>{submitLabel}</Button>}</>}</DialogActions>
    </>;
    return <Dialog className="app-dialog" open onClose={onClose} fullWidth maxWidth={maxWidth} PaperProps={{ className: "sale-modal" }} aria-labelledby={titleId}>{onSubmit ? <ValidatedForm className="sale-modal-form" onSubmit={onSubmit}>{content}</ValidatedForm> : content}</Dialog>;
}
