import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faEye, faPen, faTrash } from "@fortawesome/free-solid-svg-icons";

function TableActions({ onView, onEdit, onDelete, showEdit = Boolean(onEdit), showDelete = Boolean(onDelete), label = "registro", deleteLabel = "Eliminar", viewIcon = faEye, viewLabel = 'Ver' }) {
    return (
        <div className="table-actions">
            {onView && <button type="button" className="table-action-button view" title={`${viewLabel} ${label}`} aria-label={`${viewLabel} ${label}`} onClick={onView}><FontAwesomeIcon icon={viewIcon} aria-hidden="true" /></button>}
            {showEdit && (
                <button
                    type="button"
                    className="table-action-button edit"
                    title={`Editar ${label}`}
                    aria-label={`Editar ${label}`}
                    onClick={onEdit}
                >
                    <FontAwesomeIcon icon={faPen} />
                </button>
            )}

            {showDelete && (
                <button
                    type="button"
                    className="table-action-button delete"
                    title={`${deleteLabel} ${label}`}
                    aria-label={`${deleteLabel} ${label}`}
                    onClick={onDelete}
                >
                    <FontAwesomeIcon icon={faTrash} />
                </button>
            )}
        </div>
    );
}

export default TableActions;
