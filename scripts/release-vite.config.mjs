import react from '@vitejs/plugin-react';
import {defineConfig} from 'vite';

// This configuration only builds deployment artifacts. The launcher owns hosting.
export default defineConfig({
  plugins:[react()],
  define:{'import.meta.env.CALCQUIM_OPERATIONAL':'true'},
});
