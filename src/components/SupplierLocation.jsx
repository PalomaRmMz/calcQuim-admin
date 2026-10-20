import { locationShareUrl, validLocationUrl } from "../utils/supplierLocation.js";

export default function SupplierLocation({ supplier }) {
    const hasMap = validLocationUrl(supplier.mapsUrl);
    return <div className="supplier-location">
        {supplier.address && <p className="mb-1 preserve-text">{supplier.address}</p>}
        {hasMap ? <div className="d-flex flex-wrap gap-2">
            <a className="btn btn-sm btn-outline-primary" href={supplier.mapsUrl.trim()} target="_blank" rel="noopener noreferrer">Abrir en Maps</a>
            <a className="btn btn-sm btn-outline-secondary" href={locationShareUrl(supplier)} target="_blank" rel="noopener noreferrer">Compartir por WhatsApp</a>
        </div> : <span className="text-muted small">Sin ubicación registrada</span>}
    </div>;
}
