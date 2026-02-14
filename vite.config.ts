import { defineConfig } from 'vite';
import cesium from 'vite-plugin-cesium';
import dts from 'vite-plugin-dts';

export default defineConfig({
    plugins: [
        cesium(),
        dts({ include: ['src'] })
    ],
    build: {
        lib: {
            entry: 'src/index.ts',
            name: 'TacticalCesiumSdk',
            formats: ['es', 'umd'],
            fileName: (format) => format === 'es' ? 'tactical-cesium-sdk.js' : 'tactical-cesium-sdk.umd.cjs'
        }
    }
});
