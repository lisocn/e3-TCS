import {
    Cartographic,
    sampleTerrain,
    sampleTerrainMostDetailed,
    Viewer,
    Math as CesiumMath,
    TerrainProvider
} from 'cesium';
import { calculateSonarParams, type SonarParams } from './OceanPhysics';

export type TerrainType = 'land' | 'ocean';

export interface LocationInfo {
    longitude: number;
    latitude: number;
    elevation: number;
    terrainType: TerrainType;
    sonar: SonarParams;
}

/**
 * 数据管理器：封装高程查询与态势点位信息聚合。
 */
export class DataManager {
    private viewer: Viewer;
    private preferredTerrainProvider?: TerrainProvider;
    private queryLevel?: number;

    constructor(viewer: Viewer) {
        this.viewer = viewer;
    }

    /**
     * 指定用于查询的地形源。
     * 说明：渲染层可能因全局回退切到椭球地形，但查询仍应尽量使用真实地形源。
     */
    public setPreferredTerrainProvider(provider: TerrainProvider): void {
        this.preferredTerrainProvider = provider;
    }

    /**
     * 设置固定查询层级。
     * 若设置为 9，则按 z9 查询而非 mostDetailed。
     */
    public setQueryLevel(level: number | undefined): void {
        this.queryLevel = level;
    }

    /**
     * 查询点位信息：
     * 1. 优先使用 sampleTerrainMostDetailed 获取高程
     * 2. 失败时降级为 globe.getHeight
     */
    public async queryPositionInfo(cartographic: Cartographic): Promise<LocationInfo> {
        const point = Cartographic.clone(cartographic);
        let elevation = 0;
        const terrainProvider = this.preferredTerrainProvider ?? this.viewer.terrainProvider;

        try {
            const sampled = this.queryLevel !== undefined
                ? await sampleTerrain(terrainProvider, this.queryLevel, [point])
                : await sampleTerrainMostDetailed(terrainProvider, [point]);
            const sampledHeight = sampled[0]?.height;
            if (sampledHeight !== undefined && Number.isFinite(sampledHeight)) {
                elevation = sampledHeight;
            } else {
                elevation = this.viewer.scene.globe.getHeight(point) ?? 0;
            }
        } catch {
            elevation = this.viewer.scene.globe.getHeight(point) ?? 0;
        }

        return this.buildLocationInfo(point, elevation);
    }

    /**
     * 快速查询：仅使用当前渲染地球高程，同步返回，适合鼠标跟随刷新。
     */
    public queryPositionInfoFast(cartographic: Cartographic): LocationInfo {
        const point = Cartographic.clone(cartographic);
        const elevation = this.viewer.scene.globe.getHeight(point) ?? 0;
        return this.buildLocationInfo(point, elevation);
    }

    private buildLocationInfo(point: Cartographic, elevation: number): LocationInfo {
        const terrainType: TerrainType = elevation < -150 ? 'ocean' : 'land';
        // 声呐模型只针对海洋深度，陆地按 0 深度处理。
        const sonarDepth = terrainType === 'ocean' ? Math.abs(elevation) : 0;
        const sonar = calculateSonarParams(sonarDepth);
        return {
            longitude: CesiumMath.toDegrees(point.longitude),
            latitude: CesiumMath.toDegrees(point.latitude),
            elevation,
            terrainType,
            sonar
        };
    }

}
