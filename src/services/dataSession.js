export const DATA_SESSION_LOCK = "calcquim-data-writer-v1";

// Hold one origin-wide writer session before mounting any storage consumers.
// No leases, timeouts or stealing: a suspended tab must retain its ownership.
export function acquireDataSession(locks, onStatus) {
    let cancelled = false;
    let releaseHold;
    const hold = new Promise(resolve => { releaseHold = resolve; });
    const done = Promise.resolve().then(async () => {
        if (cancelled) return;
        if (!locks?.request) { onStatus("unsupported"); return; }
        await locks.request(DATA_SESSION_LOCK, { mode: "exclusive", ifAvailable: true }, lock => {
            if (cancelled) return;
            if (!lock) { onStatus("busy"); return; }
            onStatus("active");
            return hold;
        });
    }).catch(() => { if (!cancelled) onStatus("error"); });
    return { done, release() { cancelled = true; releaseHold(); } };
}
