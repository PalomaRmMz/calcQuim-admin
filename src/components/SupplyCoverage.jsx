import { SOURCING_TYPES } from '../utils/procurementUtils.js';
import { activeSupplyCount, supplySelectionMessage } from '../utils/supplyContext.js';

export default function SupplyCoverage({ routes = [], selected = false, articleId }) {
    const count = activeSupplyCount(routes);
    return <div className="mt-2 small">
        <span className={count ? 'text-primary' : 'text-muted'}>{count ? `${count} abastecimiento${count === 1 ? '' : 's'} existente${count === 1 ? '' : 's'}` : 'Sin abastecimiento'}</span>
        {selected && <p className="mb-1">{supplySelectionMessage(routes, articleId)}</p>}
        {routes.length > 0 && <details className="mt-1"><summary>Ver abastecimientos ({routes.length})</summary><ul className="list-unstyled mb-1 ps-3">{routes.map(({ relation, article, active, supplierCount, sourceCount }) => <li className="mt-2" key={relation.id}><strong>{article.name}</strong><span className="d-block text-muted">{SOURCING_TYPES[article.sourcingType]} · {article.unit}{!active && ' · Inactivo'}</span><span>{supplierCount} proveedor{supplierCount === 1 ? '' : 'es'} activo{supplierCount === 1 ? '' : 's'} · {sourceCount} oferta{sourceCount === 1 ? '' : 's'} activa{sourceCount === 1 ? '' : 's'}</span></li>)}</ul></details>}
    </div>;
}
