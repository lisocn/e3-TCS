/* global process */
import { CesiumTerrainProvider, Cartographic, sampleTerrain } from 'cesium';

const url = 'http://localhost:4444/terrain/';

try {
  const provider = await CesiumTerrainProvider.fromUrl(url);
  const points = [
    { name: 'Tibet-1', lon: 90.05433, lat: 33.38933 },
    { name: 'Tibet-2', lon: 88.0, lat: 31.0 },
    { name: 'Everest', lon: 86.925, lat: 27.9881 },
    { name: 'Pacific', lon: 150.0, lat: 20.0 }
  ];

  for (const p of points) {
    const c = Cartographic.fromDegrees(p.lon, p.lat);
    const sampled = await sampleTerrain(provider, 9, [c]);
    console.log(`${p.name} lon=${p.lon} lat=${p.lat} h=${sampled[0].height}`);
  }
} catch (err) {
  console.error('terrain_probe_failed:', err?.message || err);
  process.exit(2);
}
