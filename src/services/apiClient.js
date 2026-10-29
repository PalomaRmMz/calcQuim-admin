export function createApiClient(fetcher = fetch, keyStore = null, mode='synthetic') {
    let snapshot = null;
    let busy = false;
    const pending = new Map();
    async function responseJson(response) {
        const value = await response.json();
        if (!response.ok) throw new Error(value.error?.message || `No se pudo guardar (${value.error?.code || response.status}).`);
        return value;
    }
    return {
        async read() { snapshot = await responseJson(await fetcher('/api/v1/dataset')); return snapshot; },
        async command(name, args) {
            if (busy) return { ok: false, message: 'Espera a que termine la operación anterior.' };
            if (!snapshot) return { ok: false, message: 'Carga los datos antes de guardar.' };
            busy = true;
            const body = JSON.stringify({ args });
            const identity = `${snapshot.generation}:${name}:${body}`;
            try {
                const bytes = await crypto.subtle.digest('SHA-256',new TextEncoder().encode(identity));
                const storeKey = 'calcquim-sandbox-request:' + [...new Uint8Array(bytes)].map(b=>b.toString(16).padStart(2,'0')).join('');
                const requestKey = pending.get(identity) || keyStore?.getItem(storeKey) || crypto.randomUUID();
                pending.set(identity,requestKey);
                // Solo huella y clave técnica en sessionStorage del origen de ensayo; nunca datos del negocio.
                keyStore?.setItem(storeKey,requestKey);
                const value = await responseJson(await fetcher(`/api/v1/commands/${name}`, {
                    method: 'POST', headers: { 'Content-Type': 'application/json', 'X-CalcQuim-Mode': mode,
                        'If-Match': String(snapshot.revision), 'X-Dataset-Generation': snapshot.generation, 'Idempotency-Key': requestKey }, body,
                }));
                snapshot = value; pending.delete(identity); keyStore?.removeItem(storeKey);
                return { ...value.result, ok: true, snapshot: value };
            } catch (error) { return { ok: false, message: error.message || 'Conexión interrumpida. Reintenta sin cerrar esta página.' }; }
            finally { busy = false; }
        },
    };
}
