import { CesiumTerrainProvider, Cartographic, sampleTerrain, sampleTerrainMostDetailed } from 'cesium';

const url = 'http://localhost:4444/terrain/';
const provider = await CesiumTerrainProvider.fromUrl(url);
const points = [
  { name: 'Tibet-1', lon: 90.05433, lat: 33.38933 },
  { name: 'Everest', lon: 86.925, lat: 27.9881 },
  { name: 'Pacific', lon: 150.0, lat: 20.0 }
];
for (const p of points) {
  const c1 = Cartographic.fromDegrees(p.lon, p.lat);
  const c2 = Cartographic.fromDegrees(p.lon, p.lat);
  const z9 = await sampleTerrain(provider, 9, [c1]);
  const md = await sampleTerrainMostDetailed(provider, [c2]);
  console.log(`${p.name} z9=${z9[0].height} mostDetailed=${md[0].height}`);
}
