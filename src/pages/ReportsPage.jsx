import { useMemo, useState } from 'react';
import { Link } from 'react-router';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faChartSimple } from '@fortawesome/free-solid-svg-icons';
import { useCatalog } from '../context/CatalogHooks.js';
import { useProcurement } from '../context/ProcurementContext.js';
import ContentPanel from '../components/ContentPanel';
import EmptyState from '../components/EmptyState';
import Feedback from '../components/Feedback';
import DataTable from '../components/DataTable';
import AppModal from '../components/AppModal';
import { reportAnalytics, purchaseReport } from '../utils/reportAnalytics.js';
import { SOURCING_TYPES, yieldText, supplyPresentation } from '../utils/procurementUtils.js';
import { getProductDisplayName } from '../utils/catalogUtils.js';
import { categoryStyle } from '../utils/categoryColors.js';
import { money, localDate } from '../utils/salesUtils.js';
import { unitCostText } from '../utils/purchaseUtils.js';
import { unitLabel } from '../utils/units.js';
import { costOfferLabel, yieldOfferLabel } from '../utils/procurementLabels.js';
import '../styles/components/Reports.css';

const tabs = ['Resumen', 'Abastecimiento y rendimientos', 'Compras y proveedores', 'Catálogo', 'Calidad de configuración'];
const pct = n => `${Number(n.toFixed(1))}%`;
const nameColumn = { accessorKey: 'name', header: 'Producto' };
const purchaseColumns = [{ accessorKey: 'date', header: 'Fecha' }, { accessorKey: 'supplierNameSnapshot', header: 'Proveedor registrado' }, { id: 'items', header: 'Artículos registrados', accessorFn: p => p.items.map(i => i.name).join(', ') }, { id: 'total', header: 'Total pagado', accessorFn: p => money(p.total) }];

function Ranking({ title, subtitle, rows, onSelect, value = r => `${r.count} ${r.count === 1 ? 'producto' : 'productos'}`, category = false, percentScale = false }) {
    const [all, setAll] = useState(false);
    const max = percentScale ? 100 : Math.max(1, ...rows.map(r => r.count));
    return <ContentPanel title={title} subtitle={subtitle}>
        {!rows.length ? <EmptyState title="Sin datos para este reporte">Los registros aparecerán cuando exista configuración o historial disponible.</EmptyState> : <div className="report-ranking">{(all ? rows : rows.slice(0, 5)).map(row => <button type="button" key={row.id} className="report-bar" onClick={() => onSelect(row)} style={category ? categoryStyle(row) : undefined}>
            <span className="report-bar-label">{row.name}</span><strong>{value(row)}</strong><span className="report-bar-track" aria-hidden="true"><span style={{ width: `${(percentScale ? row.percent : row.count) / max * 100}%` }} /></span>
        </button>)}</div>}
        {rows.length > 5 && <button className="btn btn-outline-secondary mt-3" onClick={() => setAll(!all)}>{all ? 'Ver top 5' : `Ver todos (${rows.length})`}</button>}
    </ContentPanel>;
}

function CostEvolution({ analytics, from, to }) {
    const [source, setSource] = useState('');
    const [origin, setOrigin] = useState('Compra real');
    const history = analytics.observations.filter(o => o.supplyItemId === source && o.source === origin && (!from || o.date >= from) && (!to || o.date <= to));
    // Separate series for each historical unit. Never join incompatible quantities.
    const units = [...new Set(history.map(o => o.priceUnit))];
    return <ContentPanel title="Evolución de costos registrados" subtitle="Costo por unidad de compra; compras pagadas y costos informados se consultan por separado.">
        <div className="filter-bar"><label>Artículo, proveedor y presentación<select className="form-select" value={source} onChange={e => setSource(e.target.value)}><option value="">Selecciona una oferta</option>{[...analytics.bySupply].map(([id, row]) => <option key={id} value={id}>{costOfferLabel(row)}</option>)}</select></label>
            <label>Origen<select className="form-select" value={origin} onChange={e => setOrigin(e.target.value)}><option>Compra real</option><option>Costo informado</option></select></label></div>
        {!history.length && <EmptyState title="Sin historial en este período">Selecciona una oferta y un origen con registros para consultar su evolución.</EmptyState>}
        {units.map(unit => {
            const points = history.filter(o => o.priceUnit === unit && o.priceQuantity > 0 && Number.isFinite(o.price / o.priceQuantity)).sort((a, b) => a.date.localeCompare(b.date) || (a.createdAt || '').localeCompare(b.createdAt || ''));
            if (!points.length) return null;
            const values = points.map(o => o.price / o.priceQuantity), min = Math.min(...values), max = Math.max(...values);
            const start = Date.parse(points[0].date), end = Date.parse(points.at(-1).date);
            const x = p => 30 + (Date.parse(p.date) - start) / (end - start || 1) * 540;
            const y = v => 145 - (v - min) / (max - min || 1) * 110;
            return <div key={unit}><p>{origin} · por {unitLabel(unit)} · {points.length} registros</p>{points.length > 1 ? <svg className="report-line" viewBox="0 0 600 180" role="img" aria-label={`${origin}: de ${unitCostText(values[0])} a ${unitCostText(values.at(-1))} por ${unitLabel(unit)}`}><line x1="30" y1="150" x2="570" y2="150" stroke="#cbd5e1" /><polyline points={points.map((p, i) => `${x(p)},${y(values[i])}`).join(' ')} fill="none" stroke="#2563eb" strokeWidth="3" />{points.map((p, i) => <circle key={p.id} cx={x(p)} cy={y(values[i])} r="4" fill="#2563eb"><title>{p.date}: {unitCostText(values[i])}</title></circle>)}<text x="30" y="175" fontSize="24">{points[0].date}</text><text x="570" y="175" textAnchor="end" fontSize="24">{points.at(-1).date}</text><text x="30" y="25" fontSize="24">{unitCostText(min)} – {unitCostText(max)}</text></svg> : <p className="form-text">Se requieren al menos dos registros para mostrar una tendencia.</p>}
                <details><summary>Ver registros y nombres históricos</summary><ul>{points.map((p, i) => <li key={p.id}>{p.date} · {p.snapshot.name} · {p.supplierNameSnapshot || 'Sin nombre histórico'} · {unitCostText(values[i])} / {unitLabel(unit)}</li>)}</ul></details></div>;
        })}
    </ContentPanel>;
}

export default function ReportsPage() {
    const catalog = useCatalog();
    const { data, analytics, error } = useProcurement();
    const products = useMemo(() => catalog.products.map(p => ({ ...p, name: getProductDisplayName(p, catalog.categories, catalog.productLines) })), [catalog.products, catalog.categories, catalog.productLines]);
    const report = useMemo(() => data && analytics ? reportAnalytics(data, products, catalog.categories, catalog.productLines, analytics) : null, [data, products, catalog.categories, catalog.productLines, analytics]);
    const [tab, setTab] = useState(0);
    const [detail, setDetail] = useState(null);
    const [from, setFrom] = useState('');
    const [to, setTo] = useState('');
    const [period, setPeriod] = useState('all');
    const invalidPeriod = Boolean(from && to && from > to);
    const purchases = useMemo(() => data ? purchaseReport(data, from, to) : null, [data, from, to]);
    if (!report) return <Feedback message={error || 'No se pudieron leer los datos de reportes.'} />;
    const show = (title, rows, columns, link = '/compras/abastecimiento') => setDetail({ title, rows, columns, link });
    const showProducts = (title, rows) => show(title, rows, [nameColumn, { id: 'category', header: 'Categoría', accessorFn: p => catalog.categories.find(c => c.id === p.categoryId)?.name || 'Sin categoría' }, { id: 'alternatives', header: 'Alternativas activas', accessorFn: p => report.productRows.find(r => r.id === p.id)?.count || 0 }]);
    const relationColumns = [{ id: 'article', header: 'Artículo', accessorFn: r => r.article.name }, { id: 'product', header: 'Producto final', accessorFn: r => r.product.name }, { id: 'type', header: 'Modalidad', accessorFn: r => SOURCING_TYPES[r.article.sourcingType] }, { id: 'category', header: 'Categoría', accessorFn: r => catalog.categories.find(c => c.id === r.product.categoryId)?.name || 'Sin categoría' }, { accessorKey: 'status', header: 'Estado del rendimiento' }, { id: 'suppliers', header: 'Proveedores activos', accessorFn: r => new Set(r.effective.filter(e => e.valid).map(e => e.source.supplierId)).size }, { id: 'yield', header: 'Rendimiento base del producto', accessorFn: r => yieldText(r.conversion.yield) }, { id: 'effective', header: 'Rendimiento por oferta activa', accessorFn: r => r.effective.map(e => yieldOfferLabel(e.source, data.suppliers.find(s => s.id === e.source.supplierId)?.name, e.rule, e.valid)).join('; ') || 'Sin oferta activa' }, { accessorKey: 'overrides', header: 'Excepciones por oferta' }];
    const showRelations = (title, rows) => show(title, rows, relationColumns);
    const showArticle = a => showRelations(`${a.name} · productos relacionados (${a.count} con abastecimiento)`, report.relations.filter(r => r.article.id === a.id));
    const showRisks = () => show('Artículos con proveedor único', report.risks, [{ accessorKey: 'name', header: 'Artículo' }, { id: 'type', header: 'Modalidad', accessorFn: a => SOURCING_TYPES[a.sourcingType] }, { id: 'supplier', header: 'Proveedor', accessorFn: a => data.suppliers.find(s => s.id === a.sources[0]?.supplierId)?.name }, { accessorKey: 'count', header: 'Productos afectados' }, { id: 'products', header: 'Productos finales', accessorFn: a => a.products.map(p => p.name).join(', ') }]);
    const showOpportunities = () => show('Mejor alternativa vs segunda mejor', report.opportunities, [nameColumn, { id: 'best', header: 'Mejor alternativa', accessorFn: p => `${p.best.reference.supplierName} · ${p.best.reference.snapshot.name} · ${unitCostText(p.best.reference.cost)} / ${unitLabel(p.unit)}` }, { id: 'second', header: 'Segunda mejor', accessorFn: p => `${p.second.reference.supplierName} · ${p.second.reference.snapshot.name} · ${unitCostText(p.second.reference.cost)} / ${unitLabel(p.unit)}` }, { id: 'saving', header: 'Diferencia por unidad final', accessorFn: p => `${unitCostText(p.saving)} / ${unitLabel(p.unit)} · ${pct(p.percent)} de la segunda mejor` }, { id: 'range', header: 'Mayor costo comparable', accessorFn: p => `${unitCostText(p.highest.reference.cost)} / ${unitLabel(p.unit)}` }, { id: 'origin', header: 'Referencia mejor / segunda', accessorFn: p => [p.best, p.second].map(r => `${r.reference.source} · ${r.reference.date} · ${r.reference.age.label}`).join(' / ') }], '/compras/comparador');
    const metrics = [
        ['Productos activos', report.active.length, () => showProducts('Productos activos', report.active), 'Catálogo actual, independiente del período de compras.'],
        ['Sin abastecimiento', report.uncovered.length, () => showProducts('Productos sin abastecimiento', report.uncovered), 'Sin alternativa activa válida; un rendimiento pendiente puede tener abastecimiento configurado, pero aún no costo comparable.'],
        ['Rendimientos pendientes', report.pending.length, () => showRelations('Rendimientos pendientes', report.pending), 'Rendimientos por producto a artículos activos con rendimiento pendiente o parcial.'],
        ['Artículos con proveedor único', report.risks.length, showRisks, 'Un proveedor activo distinto; varias presentaciones del mismo proveedor no reducen esta dependencia.'],
        ['Productos afectados por proveedor único', report.affected.length, () => showProducts('Productos afectados por proveedor único', report.affected), 'Productos distintos relacionados con artículos de proveedor único; pueden tener otras alternativas.'],
        ['Oportunidades de menor costo', report.opportunities.length, showOpportunities, 'Mejor alternativa vs segunda mejor comparable; no supone un proveedor preferido.'],
    ];
    const modalities = <Ranking title="Cobertura por modalidad" subtitle={`Porcentaje de ${report.active.length} productos activos. Las modalidades pueden superponerse y no suman necesariamente 100%.`} rows={report.modalities} onSelect={r => showProducts(r.name, r.products)} value={r => `${r.count} · ${pct(r.percent)}`} percentScale />;
    const articleRanking = <Ranking title="Productos obtenibles por artículo" subtitle="Productos distintos con abastecimiento y oferta activos. Un rendimiento pendiente no es cero; revisa su estado en el detalle." rows={report.articles} onSelect={showArticle} value={r => `${r.count} ${r.count === 1 ? 'producto' : 'productos'} · ${r.supplierCount} ${r.supplierCount === 1 ? 'proveedor' : 'proveedores'}${r.variable ? ' · Rendimiento variable' : ''}`} />;
    const riskRanking = <Ranking title="Dependencia de proveedor único" subtitle="Riesgo operativo por productos afectados; no representa concentración del gasto." rows={report.risks} onSelect={showArticle} />;
    function preset(value) {
        setPeriod(value);
        const today = localDate(), date = new Date(`${today}T12:00:00`);
        setTo(value === 'all' ? '' : today);
        if (value === 'all') setFrom('');
        if (value === 'month') setFrom(`${today.slice(0, 7)}-01`);
        if (value === 'year') setFrom(`${today.slice(0, 4)}-01-01`);
        const dateText = d => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
        if (value === '30') { date.setDate(date.getDate() - 29); setFrom(dateText(date)); }
        if (value === '3months') { const day = date.getDate(); date.setDate(1); date.setMonth(date.getMonth() - 3); const last = new Date(date.getFullYear(), date.getMonth() + 1, 0).getDate(); date.setDate(Math.min(day, last)); setFrom(dateText(date)); }
    }
    return <div className="reports-page">
        <nav className="report-tabs page-tabs" aria-label="Secciones de reportes">{tabs.map((label, i) => <button key={label} type="button" className={`btn ${i === tab ? 'btn-primary' : 'btn-outline-secondary'}`} aria-current={i === tab ? 'page' : undefined} onClick={() => setTab(i)}>{label}</button>)}</nav>
        <h2 className="report-heading"><FontAwesomeIcon icon={faChartSimple} /> {tabs[tab]}</h2>
        {tab === 0 && <><p className="text-muted">Configuración actual para decidir qué abastecer y dónde completar información.</p><div className="report-metrics">{metrics.map(([title, value, click, help]) => <button type="button" className="report-metric" key={title} onClick={click}><span>{title}</span><strong>{value}</strong><small>{help}</small><span className="report-action">Ver detalle →</span></button>)}</div><div className="report-grid">{modalities}{articleRanking}{riskRanking}<ContentPanel title="Configuración pendiente" subtitle="Prioriza los registros que necesitan atención."><div className="report-actions"><button className="btn btn-outline-secondary" onClick={metrics[1][2]}>Sin abastecimiento: {report.uncovered.length}</button><button className="btn btn-outline-secondary" onClick={metrics[2][2]}>Rendimientos pendientes: {report.pending.length}</button><button className="btn btn-outline-secondary" onClick={() => setTab(4)}>Ver calidad de configuración</button></div></ContentPanel></div></>}
        {tab === 1 && <><ContentPanel title="Cobertura de abastecimiento" subtitle="Cada alternativa combina un artículo, un producto final y una oferta de proveedor con su presentación, activos y con unidades compatibles. No exige costo ni rendimiento ya conocido."><div className="report-actions">{[['Con alguna alternativa', report.productRows.filter(p => p.count)], ['Sin abastecimiento', report.uncovered], ['Con una sola alternativa', report.single], ['Con múltiples alternativas', report.multiple], ['Dependencia de una sola oferta', report.dependent]].map(([label, rows]) => <button className="btn btn-outline-secondary" key={label} onClick={() => showProducts(label, rows)}>{label}: <strong>{rows.length}</strong></button>)}</div><p className="form-text">Base: {report.active.length} productos activos. Las ofertas distinguen presentaciones; proveedor único se analiza por separado.</p></ContentPanel><div className="report-grid">{articleRanking}{riskRanking}{modalities}<ContentPanel title="Estado de los rendimientos" subtitle="Cada registro corresponde a un artículo y un producto final activos. Pendiente incluye rendimiento parcial."><div className="report-actions">{[['Rendimientos por producto', report.relations], ['Configuradas', report.configured], ['Pendientes', report.pending], ['Parcialmente configuradas', report.partial], ['Con excepción por oferta', report.overrides]].map(([label, rows]) => <button className="btn btn-outline-secondary" key={label} onClick={() => showRelations(label, rows)}>{label}: {rows.length}</button>)}<button className="btn btn-outline-secondary" onClick={() => showRelations('Rendimientos variables por artículo', report.relations.filter(r => report.variable.some(a => a.id === r.article.id)))}>Artículos con rendimiento variable: {report.variable.length}</button></div><p className="form-text">Artículos con excepción por oferta: {new Set(report.overrides.map(r => r.article.id)).size}. El rendimiento específico de cada oferta tiene prioridad sobre el rendimiento base del producto.</p><Link to="/compras/abastecimiento" className="btn btn-primary">Ver en Abastecimiento</Link></ContentPanel></div><ContentPanel title="Oportunidades de menor costo" subtitle="Mismas referencias y reglas del Comparador. Se excluyen alternativas pendientes, inválidas o inactivas.">{report.opportunities.length ? <button className="btn btn-outline-secondary" onClick={showOpportunities}>Ver {report.opportunities.length} oportunidades comparables</button> : <EmptyState title="Sin oportunidades comparables">Se necesitan dos alternativas válidas con costos diferentes para el mismo producto.</EmptyState>}</ContentPanel></>}
        {tab === 2 && <><ContentPanel title="Período de compras e historial" subtitle="Este filtro solo afecta compras, gasto y evolución de costos. La configuración actual conserva su alcance."><div className="filter-bar"><label>Desde<input className="form-control" type="date" value={from} onChange={e => { setFrom(e.target.value); setPeriod('custom'); }} /></label><label>Hasta<input className="form-control" type="date" value={to} onChange={e => { setTo(e.target.value); setPeriod('custom'); }} /></label><label>Períodos rápidos<select className="form-select" value={period} onChange={e => preset(e.target.value)}><option value="custom" disabled>Personalizado</option><option value="all">Todo</option><option value="30">Últimos 30 días</option><option value="month">Mes actual</option><option value="3months">Últimos 3 meses</option><option value="year">Año actual</option></select></label></div>{invalidPeriod && <p role="alert">Desde debe ser anterior o igual a Hasta.</p>}</ContentPanel>{!invalidPeriod && <><ContentPanel title="Compras válidas del período" subtitle="Compras anuladas excluidas. Importes registrados en MXN."><button className="btn btn-outline-secondary" onClick={() => show('Compras del período', purchases.purchases, purchaseColumns, '/compras')}>{purchases.purchases.length} compras · {money(purchases.total)}</button></ContentPanel><div className="report-grid"><Ranking title="Gasto por proveedor" percentScale subtitle={`Porcentaje del gasto válido del período: ${money(purchases.total)}. Agrupado por identidad; conserva los nombres históricos.`} rows={purchases.suppliers.map(r => ({ ...r, count: r.total }))} value={r => `${money(r.total)} · ${pct(r.percent)} · ${r.purchases.length} compras`} onSelect={r => show(`Compras · ${r.name}`, r.purchases, purchaseColumns, '/compras')} /><Ranking title="Artículos con mayor gasto" subtitle="Totales pagados; cantidades separadas por unidad y nombres históricos conservados." rows={purchases.articles.map(r => ({ ...r, count: r.total }))} value={r => `${money(r.total)} · ${r.purchases.length} compras · ${SOURCING_TYPES[r.sourcingType] || 'Modalidad no registrada'} · ${Object.entries(r.quantities).map(([u, q]) => `${q} ${unitLabel(u)}`).join(' + ')}`} onSelect={r => show(`Compras · ${r.name}`, r.purchases, purchaseColumns, '/compras')} /></div><CostEvolution analytics={analytics} from={from} to={to} /></>}</>}
        {tab === 3 && <div className="report-grid"><Ranking title="Composición del catálogo por categoría" subtitle={`Denominador: ${report.active.length} productos activos. Sin categoría es información de organización.`} rows={report.categories} onSelect={r => showProducts(r.name, r.products)} value={r => `${r.count} · ${pct(r.percent)}`} category percentScale /><Ranking title="Productos por línea" subtitle="Productos activos; el contexto de color pertenece a la categoría." rows={report.lines.map(r => ({ ...r, name: `${r.name} · ${catalog.categories.find(c => c.id === r.categoryId)?.name || 'Sin categoría'}` }))} onSelect={r => showProducts(r.name, r.products)} />{modalities}</div>}
        {tab === 4 && <ContentPanel title="Calidad de configuración" subtitle="Lectura y diagnóstico. Los estados inactivos y los artículos sin producto relacionado no se consideran errores."><div className="report-quality">{[
            ['Productos sin abastecimiento', report.uncovered.length, metrics[1][2]],
            ['Rendimientos pendientes', report.pending.length, metrics[2][2]],
            ['Artículos sin oferta activa', report.withoutSource.length, () => show('Artículos sin oferta activa', report.withoutSource, [{ accessorKey: 'name', header: 'Artículo' }, { id: 'type', header: 'Modalidad', accessorFn: r => SOURCING_TYPES[r.sourcingType] }])],
            ['Ofertas sin costo disponible', report.withoutCost.length, () => show('Ofertas sin costo disponible', report.withoutCost.map(s => ({ ...s, name: data.purchasedItems.find(a => a.id === s.purchasedItemId)?.name, supplier: data.suppliers.find(p => p.id === s.supplierId)?.name })), [{ accessorKey: 'name', header: 'Artículo' }, { accessorKey: 'supplier', header: 'Proveedor' }, { id: 'presentation', header: 'Presentación', accessorFn: s => supplyPresentation(s) }])],
            ['Productos sin categoría (organización)', report.active.filter(p => p.categoryId == null).length, () => showProducts('Productos sin categoría', report.active.filter(p => p.categoryId == null))],
            ['Líneas inconsistentes con la categoría', report.inconsistentLines.length, () => showProducts('Líneas inconsistentes con la categoría', report.inconsistentLines)],
        ].map(([label, count, click]) => <button key={label} className="report-quality-row" onClick={click}><span>{label}</span><strong>{count} →</strong></button>)}</div><p className="form-text">Sin costo disponible significa que no existe una referencia utilizable; no es un error obligatorio. Reportes no modifica datos.</p></ContentPanel>}
        {detail && <AppModal title={detail.title} subtitle={`${detail.rows.length} registros · datos del reporte`} onClose={() => setDetail(null)} maxWidth="lg"><Link className="btn btn-outline-secondary mb-3" to={detail.link}>Ver en {detail.link === '/compras/comparador' ? 'Comparador' : detail.link === '/compras' ? 'Compras' : 'Abastecimiento'}</Link>{detail.rows.length ? <DataTable mobileCards key={detail.title} columns={detail.columns} data={detail.rows} /> : <EmptyState title="Sin registros">No hay elementos que cumplan esta condición.</EmptyState>}</AppModal>}
    </div>;
}
