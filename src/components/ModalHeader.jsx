import { DialogTitle } from "@mui/material";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faXmark } from "@fortawesome/free-solid-svg-icons";
import "../styles/components/ModalHeader.css";

export default function ModalHeader({ title, subtitle, onClose, titleId, icon }) {
    return <div className="app-modal-header">
        <div className="app-modal-heading"><DialogTitle id={titleId}>{icon && <FontAwesomeIcon icon={icon} className="me-2 text-primary" />}{title}</DialogTitle>{subtitle && <p>{subtitle}</p>}</div>
        <button type="button" className="app-modal-close" aria-label="Cerrar" title="Cerrar" onClick={onClose}><FontAwesomeIcon icon={faXmark} /></button>
    </div>;
}
