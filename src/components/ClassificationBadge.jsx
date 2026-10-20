import { getClassification } from "../utils/classificationUtils.js";
import { categoryStyle } from '../utils/categoryColors.js';

export default function ClassificationBadge({ product, categories, productLines }) {
    const classification = getClassification(product, categories, productLines);
    return <span className="classification-label category-accent" style={categoryStyle(categories.find(category => category.id === product?.categoryId))}>{classification.label}</span>;
}
