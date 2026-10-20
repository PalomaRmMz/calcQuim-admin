export default function EmptyState({ title = "Sin registros", children }) {
    return <div className="sale-empty mb-3"><strong>{title}</strong>{children && <p>{children}</p>}</div>;
}
