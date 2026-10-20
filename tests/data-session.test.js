import test from "node:test";
import assert from "node:assert/strict";
import { acquireDataSession, DATA_SESSION_LOCK } from "../src/services/dataSession.js";
import { createServer } from "vite";
import React from "react";
import { renderToString } from "react-dom/server";

function lockManager() {
    let held = false;
    return { async request(name, options, callback) {
        assert.equal(name, DATA_SESSION_LOCK);
        assert.deepEqual(options, { mode: "exclusive", ifAvailable: true });
        if (held) return callback(null);
        held = true;
        try { return await callback({ name }); }
        finally { held = false; }
    } };
}

test("solo una sesión monta escritores; la segunda puede reintentar tras liberar la primera", async () => {
    const locks = lockManager(), first = [], second = [];
    const a = acquireDataSession(locks, status => first.push(status));
    const b = acquireDataSession(locks, status => second.push(status));
    await b.done;
    assert.deepEqual(first, ["active"]);
    assert.deepEqual(second, ["busy"]);
    a.release();
    await a.done;
    b.release();
    const retry = acquireDataSession(locks, status => second.push(status));
    await Promise.resolve();
    assert.deepEqual(second, ["busy", "active"]);
    retry.release();
    await retry.done;
});

test("cleanup inmediato de StrictMode no activa una sesión vieja ni retiene bloqueo", async () => {
    const locks = lockManager(), states = [];
    const old = acquireDataSession(locks, value => states.push(value));
    old.release();
    await old.done;
    assert.deepEqual(states, []);
    const current = acquireDataSession(locks, value => states.push(value));
    await Promise.resolve();
    assert.deepEqual(states, ["active"]);
    current.release();
    current.release();
    await current.done;
});

test("sin API o permiso no se habilitan escrituras; concesión tardía tras cleanup se descarta", async () => {
    for (const [locks, expected] of [[undefined, "unsupported"], [{ request: () => Promise.reject(new Error("SecurityError")) }, "error"]]) {
        const states = [], session = acquireDataSession(locks, value => states.push(value));
        await session.done;
        assert.deepEqual(states, [expected]);
        session.release();
    }
    let grant;
    const states = [], delayed = acquireDataSession({ request: (_name, _options, callback) => new Promise(resolve => { grant = () => resolve(callback({})); }) }, value => states.push(value));
    await Promise.resolve();
    delayed.release();
    grant();
    await delayed.done;
    assert.deepEqual(states, []);
});

test("el gate no renderiza providers ni ejecuta migraciones/reset antes de obtener sesión", async () => {
    const server = await createServer({ server: { middlewareMode: true, ws: false }, appType: "custom" });
    try {
        const { default: Gate } = await server.ssrLoadModule("/src/components/DataSessionGate.jsx");
        let mounted = false;
        function Runtime() { mounted = true; throw new Error("No debe leer ni escribir almacenamiento"); }
        const html = renderToString(React.createElement(Gate, null, React.createElement(Runtime)));
        assert.equal(mounted, false);
        assert.match(html, /Abriendo los datos/);
    } finally { await server.close(); }
});
