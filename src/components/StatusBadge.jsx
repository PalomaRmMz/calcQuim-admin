function StatusBadge({ active, activeText = "Activo", inactiveText = "Inactivo" }) {
    return (
        <span className={`table-status ${active ? "table-status-active" : "table-status-inactive"}`}>
            <span className={`table-status-dot ${active ? "" : "inactive"}`} />
            {active ? activeText : inactiveText}
        </span>
    );
}

export default StatusBadge;