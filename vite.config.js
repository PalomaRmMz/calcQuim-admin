import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'
import { existsSync,readFileSync } from 'node:fs'

const marker=new URL('./server/artifacts/operational/activation.private.json',import.meta.url)
const operational=existsSync(marker)
let apiPort=3003
if(operational) {
  const activation=JSON.parse(readFileSync(marker,'utf8'))
  if(activation.validated!==true||activation.restoreVerified!==true||activation.database!=='calcquim_operational')throw new Error('Activación PostgreSQL no validada.')
  apiPort=activation.apiPort
  if(!Number.isInteger(apiPort)||apiPort<1||apiPort>65535)throw new Error('Puerto operativo inválido.')
}

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  define:{'import.meta.env.CALCQUIM_OPERATIONAL':JSON.stringify(operational)},
  server:{host:'127.0.0.1',port:5173,strictPort:true,proxy:{'/api':{target:`http://127.0.0.1:${apiPort}`,changeOrigin:true}}},
  preview:{host:'127.0.0.1',port:4173,strictPort:true,proxy:{'/api':{target:`http://127.0.0.1:${apiPort}`,changeOrigin:true}}},
})
