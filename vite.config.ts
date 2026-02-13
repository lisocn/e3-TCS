import { defineConfig } from 'vite';
import cesium from 'vite-plugin-cesium';
import dts from 'vite-plugin-dts';

export default defineConfig({
    plugins: [
        cesium(),
        dts({ include: ['src'] })
    ]
});
