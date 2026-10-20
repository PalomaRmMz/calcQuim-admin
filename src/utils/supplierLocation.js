export function validLocationUrl(value) {
    if (typeof value !== "string" || !value.trim()) return false;
    try { const url = new URL(value.trim()); return ["http:", "https:"].includes(url.protocol) && Boolean(url.hostname) && !url.username && !url.password; }
    catch { return false; }
}

export function locationShareUrl(supplier) {
    if (!validLocationUrl(supplier.mapsUrl)) return null;
    const message = [supplier.name, supplier.address, "", "Ubicación:", supplier.mapsUrl.trim()].filter(value => value != null && value !== "").join("\n");
    return `https://wa.me/?text=${encodeURIComponent(message)}`;
}
