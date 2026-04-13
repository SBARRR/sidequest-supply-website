import path from 'node:path';
import { defineConfig } from 'vite';

export default defineConfig({
    base: './',
    build: {
        outDir: 'dist',
        emptyOutDir: true,
        rollupOptions: {
            input: {
                index: path.resolve('index.html'),
                catalogue: path.resolve('catalogue.html'),
                product: path.resolve('product.html')
            }
        }
    }
});
