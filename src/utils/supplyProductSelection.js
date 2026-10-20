import { activeSupplyCount } from './supplyContext.js';
import { getProductDisplayName, normalizeText } from './catalogUtils.js';

export function supplySelectionLines(productLines, categoryId) {
    return categoryId ? productLines.filter(line => String(line.categoryId) === String(categoryId)) : [];
}

export function compatibleSupplyLine(productLines, categoryId, lineId) {
    return supplySelectionLines(productLines, categoryId).some(line => String(line.id) === String(lineId)) ? lineId : '';
}

export function visibleSupplyProducts(products, selected, categories, productLines, { search = '', categoryId = '', lineId = '', supplyFilter = '', supplyContext, articleId }) {
    const query = normalizeText(search);
    const hasCriteria = Boolean(query || categoryId || lineId || supplyFilter);
    return products.filter(product => {
        if (selected.includes(product.id)) return true;
        if (!hasCriteria || (categoryId && String(product.categoryId) !== String(categoryId)) || (lineId && String(product.lineId) !== String(lineId))) return false;
        const routes = supplyContext?.byProduct.get(product.id) || [];
        const count = activeSupplyCount(routes);
        if (supplyFilter === 'none' && count || supplyFilter === 'some' && !count || supplyFilter === 'related' && !routes.some(r => r.article.id === articleId)) return false;
        const category = categories.find(entry => String(entry.id) === String(product.categoryId));
        const line = productLines.find(entry => String(entry.id) === String(product.lineId) && String(entry.categoryId) === String(product.categoryId));
        return [product.name, getProductDisplayName(product, categories, productLines), category?.name, line?.name].some(value => normalizeText(value).includes(query));
    });
}
