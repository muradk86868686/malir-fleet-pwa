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
        const filesToCopy = ['vehicles_master.json', 'sw.js', 'manifest.json', '404.html'];
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

        // Fix manifest reference in dist/index.html so mobile shortcut opens root (no 404!)
        const htmlPath = path.resolve(distDir, 'index.html');
        if (fs.existsSync(htmlPath)) {
          let html = fs.readFileSync(htmlPath, 'utf8');
          html = html.replace(/href=["']\.\/assets\/manifest-[^"']+\.json["']/g, 'href="./manifest.json"');
          fs.writeFileSync(htmlPath, html, 'utf8');
          console.log('[Vite Plugin] Fixed manifest link to ./manifest.json in dist/index.html');
        }

        // Also fix any assets/manifest-*.json start_url if Chrome cached it
        const assetsDir = path.resolve(distDir, 'assets');
        if (fs.existsSync(assetsDir)) {
          const assetFiles = fs.readdirSync(assetsDir);
          assetFiles.forEach((f) => {
            if (f.startsWith('manifest-') && f.endsWith('.json')) {
              const mPath = path.resolve(assetsDir, f);
              try {
                const mData = JSON.parse(fs.readFileSync(mPath, 'utf8'));
                mData.start_url = '../index.html';
                mData.scope = '../';
                fs.writeFileSync(mPath, JSON.stringify(mData, null, 2), 'utf8');
                console.log(`[Vite Plugin] Fixed start_url in ${f}`);
              } catch (e) {}
            }
          });
        }
      }
    }
  ]
});
