function TableBadge({ children, variant = "blue", style }) {
    return (
        <span className={`table-badge table-badge-${variant}`} style={style}>
            {children}
        </span>
    );
}

export default TableBadge;