import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import {defineConfig} from 'vite';

export default defineConfig(({ mode }) => {
  const isDesktopBuild = mode === 'desktop';
  return {
    plugins: [react(), tailwindcss()],
    build: {
      outDir: isDesktopBuild ? 'dist' : '../wordpress-plugin/linkflow-dashboard/build',
      // The shared workspace is cloud-synced and Windows can temporarily pin the
      // plugin's .vite directory. Retain hashed plugin assets and let the manifest
      // select the current build instead of failing while deleting a pinned folder.
      emptyOutDir: isDesktopBuild,
      manifest: true,
    },
    resolve: {
      alias: {
        '@': path.resolve(__dirname, '.'),
      },
    },
    server: {
      // HMR is disabled in AI Studio via DISABLE_HMR env var.
      // Do not modifyâfile watching is disabled to prevent flickering during agent edits.
      hmr: process.env.DISABLE_HMR !== 'true',
      // Disable file watching when DISABLE_HMR is true to save CPU during agent edits.
      watch: process.env.DISABLE_HMR === 'true' ? null : {},
    },
  };
});
