// Classification colors only: never infer status from these accents.
export const CATEGORY_COLORS = [
    { key: 'blue', name: 'Azul', accent: '#2858ba', background: '#e2ebff' },
    { key: 'sky', name: 'Celeste', accent: '#087697', background: '#dbf3fc' },
    { key: 'teal', name: 'Turquesa', accent: '#07766b', background: '#d9f3ec' },
    { key: 'sage', name: 'Verde', accent: '#35752e', background: '#e3f2da' },
    { key: 'olive', name: 'Lima', accent: '#62710f', background: '#eef3cd' },
    { key: 'sand', name: 'Ámbar', accent: '#956400', background: '#fff0ca' },
    { key: 'clay', name: 'Terracota', accent: '#ac4915', background: '#ffe8d8' },
    { key: 'rose', name: 'Rosa', accent: '#ad3669', background: '#fce0ec' },
    { key: 'lilac', name: 'Lila', accent: '#7845b3', background: '#eee1fc' },
    { key: 'slate', name: 'Pizarra', accent: '#525f78', background: '#e6ebf3' },
];

// Reserve palette: activated only after the original ten identities are occupied.
export const CATEGORY_COLOR_EXTENSIONS = [
    { key: 'coral', name: 'Coral', accent: '#ae3935', background: '#ffe4e0' },
    { key: 'violet', name: 'Violeta', accent: '#513ab0', background: '#e9e4ff' },
    { key: 'berry', name: 'Frambuesa', accent: '#922252', background: '#fbddea' },
    { key: 'forest', name: 'Bosque', accent: '#236044', background: '#dceee0' },
    { key: 'copper', name: 'Cobre', accent: '#854b27', background: '#f6e4d2' },
    { key: 'indigo', name: 'Índigo', accent: '#344984', background: '#e0e7fb' },
    { key: 'plum', name: 'Ciruela', accent: '#793766', background: '#f3dfef' },
    { key: 'petrol', name: 'Petróleo', accent: '#215b67', background: '#d9eced' },
];
export const ALL_CATEGORY_COLORS = [...CATEGORY_COLORS, ...CATEGORY_COLOR_EXTENSIONS];

export function availableCategoryColors(categories) {
    const used = new Set(categories.map(c => categoryColor(c).key));
    const base = CATEGORY_COLORS.filter(c => !used.has(c.key));
    if (base.length) return base;
    const reserve = CATEGORY_COLOR_EXTENSIONS.filter(c => !used.has(c.key));
    if (reserve.length) return reserve;
    // A finite, controlled palette cannot guarantee perceptual uniqueness forever.
    const counts = ALL_CATEGORY_COLORS.map(c => categories.filter(category => categoryColor(category).key === c.key).length);
    return ALL_CATEGORY_COLORS.filter((_, i) => counts[i] === Math.min(...counts));
}

export function assignCategoryColor(categories, random = Math.random) {
    const pool = availableCategoryColors(categories);
    const sample = random();
    if (!Number.isFinite(sample) || sample < 0 || sample >= 1) throw new Error('La selección aleatoria debe estar entre 0 y 1.');
    return pool[Math.floor(sample * pool.length)].key;
}

export function categoryColor(category) {
    if (!category) return CATEGORY_COLORS[9];
    const explicit = ALL_CATEGORY_COLORS.find(color => color.key === category.colorKey);
    if (explicit) return explicit;
    // Derive older records by immutable ID; no migration/write on read or rename.
    const hash = [...String(category.id ?? '')].reduce((value, char) => (value * 31 + char.charCodeAt(0)) >>> 0, 0);
    return CATEGORY_COLORS[hash % CATEGORY_COLORS.length];
}

export function categoryStyle(category) {
    const color = categoryColor(category);
    return { '--category-accent': color.accent, '--category-background': color.background };
}
