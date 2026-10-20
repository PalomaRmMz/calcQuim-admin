import { STORAGE_KEYS } from "./catalogStorage.js";

// Preserve exact bytes, unknown fields and even malformed JSON for recovery.
// Unlike the readable Excel export, this backup never interprets business data.
export function collectRawBackup(storage = localStorage) {
    const keys = [...new Set(Object.values(STORAGE_KEYS))];
    const before = keys.map(key => storage.getItem(key));
    const after = keys.map(key => storage.getItem(key));
    if (before.some((raw, index) => raw !== after[index])) throw new Error("Los datos cambiaron durante el respaldo. Inténtalo de nuevo.");
    return { application: "CalcQuim", formatVersion: 1, capturedAt: new Date().toISOString(), storage: Object.fromEntries(keys.map((key, index) => [key, before[index]])) };
}

export function downloadRawBackup() {
    const backup = collectRawBackup();
    const blob = new Blob([JSON.stringify(backup, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `CalcQuim_Respaldo_Original_${backup.capturedAt.replace(/[:.]/g, "-")}.json`;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    setTimeout(() => URL.revokeObjectURL(url), 60000);
}
