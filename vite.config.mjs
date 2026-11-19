import { defineConfig } from 'vite';
import fs from 'fs';
import path from 'path';

const currentDir = import.meta.dirname || process.cwd();

export default defineConfig({
  base: './',
  build: {
    outDir: 'dist',
    emptyOutDir: true,
  },
  plugins: [
    {
      name: 'copy-pwa-assets',
      closeBundle() {
        const distDir = path.resolve(currentDir, 'dist');
        if (!fs.existsSync(distDir)) {
          fs.mkdirSync(distDir, { recursive: true });
        }

        // Copy static files required for standalone PWA and Service Worker
        const filesToCopy = ['vehicles_master.json', 'sw.js', 'manifest.json'];
        filesToCopy.forEach((file) => {
          const src = path.resolve(currentDir, file);
          const dest = path.resolve(distDir, file);
          if (fs.existsSync(src)) {
            fs.copyFileSync(src, dest);
            console.log(`[Vite Plugin] Copied ${file} -> dist/${file}`);
          }
        });

        // Copy icons directory
        const iconsSrc = path.resolve(currentDir, 'icons');
        const iconsDest = path.resolve(distDir, 'icons');
        if (fs.existsSync(iconsSrc)) {
          fs.cpSync(iconsSrc, iconsDest, { recursive: true });
          console.log(`[Vite Plugin] Copied icons/ -> dist/icons/`);
        }

        // Copy js directory for runtime modular scripts
        const jsSrc = path.resolve(currentDir, 'js');
        const jsDest = path.resolve(distDir, 'js');
        if (fs.existsSync(jsSrc)) {
          fs.cpSync(jsSrc, jsDest, { recursive: true });
          console.log(`[Vite Plugin] Copied js/ -> dist/js/`);
        }
      }
    }
  ]
});
