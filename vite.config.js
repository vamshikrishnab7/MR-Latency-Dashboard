import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    host: '0.0.0.0', // Listen on all network interfaces
    port: 5173,
    strictPort: true,
    hmr: {
      host: '144.54.163.94', // Use VPN IP for hot module replacement
      port: 5173
    }
  }
});
