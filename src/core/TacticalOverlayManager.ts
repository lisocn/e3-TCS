import {
    Viewer,
    Color,
    Cartesian3,
    CallbackPositionProperty,
    JulianDate,
    LabelStyle,
    HeightReference,
    HorizontalOrigin,
    VerticalOrigin,
    Cartesian2,
    Math as CesiumMath,
    PolylineDashMaterialProperty,
    type Entity
} from 'cesium';

interface Waypoint {
    lon: number;
    lat: number;
    alt: number;
}

interface AirTrackSpec {
    id: string;
    callsign: string;
    color: Color;
    speed: number;
    waypoints: Waypoint[];
}

/**
 * 战术态势叠加层管理器：
 * 负责绘制演示用途的航迹、编队、地面阵位与战术网格。
 */
export class TacticalOverlayManager {
    private readonly viewer: Viewer;
    private readonly entities: Entity[] = [];
    private scenarioStart?: JulianDate;

    constructor(viewer: Viewer) {
        this.viewer = viewer;
    }

    public applyRedFlagScenario(): void {
        this.clear();
        this.scenarioStart = JulianDate.now();
        this.addGroundGrid();
        this.addAirCorridors();
        this.addGroundUnits();
        this.addAirTracks();
        console.log('TacticalOverlay: Red Flag scenario applied.');
    }

    public clear(): void {
        for (const entity of this.entities) {
            this.viewer.entities.remove(entity);
        }
        this.entities.length = 0;
    }

    public destroy(): void {
        this.clear();
    }

    private addGroundGrid(): void {
        const west = -118.95;
        const east = -117.55;
        const south = 36.15;
        const north = 36.92;
        const lonStep = 0.11;
        const latStep = 0.09;
        const gridColor = Color.fromCssColorString('#f4c76a').withAlpha(0.30);

        for (let lon = west; lon <= east + 1e-6; lon += lonStep) {
            const entity = this.viewer.entities.add({
                name: 'RedFlag.Grid.Lon',
                polyline: {
                    positions: Cartesian3.fromDegreesArray([
                        lon, south,
                        lon, north
                    ]),
                    width: 1.15,
                    clampToGround: true,
                    material: gridColor
                }
            });
            this.entities.push(entity);
        }

        for (let lat = south; lat <= north + 1e-6; lat += latStep) {
            const entity = this.viewer.entities.add({
                name: 'RedFlag.Grid.Lat',
                polyline: {
                    positions: Cartesian3.fromDegreesArray([
                        west, lat,
                        east, lat
                    ]),
                    width: 1.15,
                    clampToGround: true,
                    material: gridColor
                }
            });
            this.entities.push(entity);
        }
    }

    private addAirCorridors(): void {
        const corridorColor = Color.fromCssColorString('#4ae8ff').withAlpha(0.78);
        const strikeColor = Color.fromCssColorString('#ff45a1').withAlpha(0.82);
        const corridorA = this.viewer.entities.add({
            name: 'RedFlag.CorridorA',
            polyline: {
                positions: Cartesian3.fromDegreesArrayHeights([
                    -118.78, 36.35, 6200,
                    -118.42, 36.55, 6800,
                    -118.05, 36.70, 6400
                ]),
                width: 10.5,
                material: corridorColor
            }
        });
        const corridorB = this.viewer.entities.add({
            name: 'RedFlag.CorridorB',
            polyline: {
                positions: Cartesian3.fromDegreesArrayHeights([
                    -118.72, 36.22, 6200,
                    -118.34, 36.40, 6600,
                    -117.95, 36.58, 6200
                ]),
                width: 10.5,
                material: corridorColor
            }
        });
        const strikeAxis = this.viewer.entities.add({
            name: 'RedFlag.StrikeAxis',
            polyline: {
                positions: Cartesian3.fromDegreesArrayHeights([
                    -118.18, 36.28, 5200,
                    -117.86, 36.45, 5600
                ]),
                width: 5.0,
                material: strikeColor
            }
        });
        this.entities.push(corridorA, corridorB, strikeAxis);
    }

    private addGroundUnits(): void {
        const units = [
            { id: 'SAM-A', lon: -118.54, lat: 36.36, color: '#ffcf66' },
            { id: 'SAM-B', lon: -118.22, lat: 36.48, color: '#ffcf66' },
            { id: 'EW-1', lon: -117.95, lat: 36.62, color: '#ff5f5f' },
            { id: 'CMD', lon: -118.67, lat: 36.58, color: '#8affc9' }
        ];
        for (const unit of units) {
            const entity = this.viewer.entities.add({
                name: `RedFlag.Ground.${unit.id}`,
                position: Cartesian3.fromDegrees(unit.lon, unit.lat, 1400.0),
                point: {
                    pixelSize: 15,
                    color: Color.fromCssColorString(unit.color),
                    outlineColor: Color.BLACK.withAlpha(0.8),
                    outlineWidth: 2,
                    heightReference: HeightReference.CLAMP_TO_GROUND,
                    disableDepthTestDistance: Number.POSITIVE_INFINITY
                },
                label: {
                    text: unit.id,
                    font: '600 13px "JetBrains Mono", monospace',
                    fillColor: Color.fromCssColorString(unit.color),
                    outlineColor: Color.BLACK.withAlpha(0.9),
                    outlineWidth: 2,
                    style: LabelStyle.FILL_AND_OUTLINE,
                    pixelOffset: new Cartesian2(0, -18),
                    horizontalOrigin: HorizontalOrigin.CENTER,
                    verticalOrigin: VerticalOrigin.BOTTOM,
                    disableDepthTestDistance: Number.POSITIVE_INFINITY
                }
            });
            this.entities.push(entity);
        }
    }

    private addAirTracks(): void {
        const specs: AirTrackSpec[] = [
            {
                id: 'BLUE-11',
                callsign: 'BLUE-11',
                color: Color.fromCssColorString('#4be6ff'),
                speed: 0.22,
                waypoints: [
                    { lon: -118.84, lat: 36.26, alt: 7100 },
                    { lon: -118.45, lat: 36.48, alt: 7600 },
                    { lon: -118.05, lat: 36.64, alt: 7300 },
                    { lon: -117.78, lat: 36.80, alt: 6900 }
                ]
            },
            {
                id: 'BLUE-12',
                callsign: 'BLUE-12',
                color: Color.fromCssColorString('#52f5d2'),
                speed: 0.20,
                waypoints: [
                    { lon: -118.92, lat: 36.17, alt: 6600 },
                    { lon: -118.58, lat: 36.33, alt: 6900 },
                    { lon: -118.22, lat: 36.52, alt: 6700 },
                    { lon: -117.90, lat: 36.70, alt: 6400 }
                ]
            },
            {
                id: 'RED-31',
                callsign: 'RED-31',
                color: Color.fromCssColorString('#ff57b0'),
                speed: 0.24,
                waypoints: [
                    { lon: -117.74, lat: 36.38, alt: 6200 },
                    { lon: -118.03, lat: 36.49, alt: 6400 },
                    { lon: -118.32, lat: 36.57, alt: 6000 },
                    { lon: -118.56, lat: 36.68, alt: 5900 }
                ]
            }
        ];

        for (const spec of specs) {
            const plannedRoute = this.viewer.entities.add({
                name: `RedFlag.Route.${spec.callsign}`,
                polyline: {
                    positions: Cartesian3.fromDegreesArrayHeights(
                        spec.waypoints.flatMap((p) => [p.lon, p.lat, p.alt])
                    ),
                    width: 2.4,
                    material: new PolylineDashMaterialProperty({
                        color: spec.color.withAlpha(0.65),
                        dashLength: 18.0,
                        dashPattern: 255
                    })
                }
            });
            this.entities.push(plannedRoute);

            const position = new CallbackPositionProperty((time?: JulianDate) => {
                if (!this.scenarioStart) return Cartesian3.fromDegrees(spec.waypoints[0].lon, spec.waypoints[0].lat, spec.waypoints[0].alt);
                if (!time) return Cartesian3.fromDegrees(spec.waypoints[0].lon, spec.waypoints[0].lat, spec.waypoints[0].alt);
                const elapsedSeconds = Math.max(0.0, JulianDate.secondsDifference(time, this.scenarioStart));
                const progress = (elapsedSeconds * spec.speed) % 1.0;
                return this.interpolateWaypoint(spec.waypoints, progress);
            }, false);

            const track = this.viewer.entities.add({
                id: spec.id,
                name: `RedFlag.Air.${spec.callsign}`,
                position,
                point: {
                    pixelSize: 16,
                    color: spec.color,
                    outlineColor: Color.WHITE.withAlpha(0.92),
                    outlineWidth: 1.5,
                    disableDepthTestDistance: Number.POSITIVE_INFINITY
                },
                path: {
                    width: 4.0,
                    leadTime: 0,
                    trailTime: 180,
                    material: spec.color.withAlpha(0.55),
                    resolution: 1
                },
                label: {
                    text: spec.callsign,
                    font: '700 13px "JetBrains Mono", monospace',
                    fillColor: spec.color,
                    outlineColor: Color.BLACK.withAlpha(0.92),
                    outlineWidth: 2,
                    style: LabelStyle.FILL_AND_OUTLINE,
                    pixelOffset: new Cartesian2(15, -12),
                    horizontalOrigin: HorizontalOrigin.LEFT,
                    verticalOrigin: VerticalOrigin.CENTER,
                    disableDepthTestDistance: Number.POSITIVE_INFINITY
                }
            });
            this.entities.push(track);
        }
    }

    private interpolateWaypoint(waypoints: Waypoint[], progress: number): Cartesian3 {
        const pointCount = waypoints.length;
        if (pointCount === 0) {
            return Cartesian3.fromDegrees(-118.30, 36.58, 6000.0);
        }
        if (pointCount === 1) {
            const p = waypoints[0];
            return Cartesian3.fromDegrees(p.lon, p.lat, p.alt);
        }
        const scaled = progress * pointCount;
        const startIndex = Math.floor(scaled) % pointCount;
        const endIndex = (startIndex + 1) % pointCount;
        const t = scaled - Math.floor(scaled);
        const a = waypoints[startIndex];
        const b = waypoints[endIndex];
        const lon = CesiumMath.lerp(a.lon, b.lon, t);
        const lat = CesiumMath.lerp(a.lat, b.lat, t);
        const alt = CesiumMath.lerp(a.alt, b.alt, t);
        return Cartesian3.fromDegrees(lon, lat, alt);
    }
}
