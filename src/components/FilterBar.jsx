export default function FilterBar({ children, onClear }) {
    return <div className="filter-bar">{children}<button type="button" className="btn btn-outline-secondary" onClick={onClear}>Limpiar filtros</button></div>;
}
