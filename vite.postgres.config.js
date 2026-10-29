import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';
import { env } from 'node:process';
import { isolatedViteCache } from './scripts/vite-cache.mjs';
const port=env.CALCQUIM_API_PORT || '3001';
if(!/^\d+$/.test(port)||Number(port)<1||Number(port)>65535) throw new Error('Puerto API inválido.');
// Origen distinto y explícito. No cambia la configuración de Vite habitual.
export default defineConfig({plugins:[react(),isolatedViteCache('sandbox')],server:{host:'127.0.0.1',port:5174,strictPort:true,
    proxy:{'/api':{target:`http://127.0.0.1:${port}`,changeOrigin:true}}}});
