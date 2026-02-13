import { Color } from 'cesium';

export interface TacticalMaterialOptions {
    elevationMin: number;
    elevationMax: number;
    contourInterval: number;
    contourThickness: number;
    macroGridDensity: number;
    macroGridWidth: number;
    microGridDensity: number;
    microGridWidth: number;
    lodNear: number;
    lodMid: number;
    lodFar: number;
    colorLow: string;
    colorHigh: string;
    colorRidge: string;
    colorContour: string;
    colorMacroGrid: string;
    colorMicroGrid: string;
}

/**
 * 获取战术材质的 Fabric 定义 - "Red Flag" Nellis Style
 * 风格特点：
 * 1. 内华达沙漠地貌 (Tan/Brown)
 * 2. 伪光照 (Slope Shading) - 使用 fwidth(height) 模拟地形起伏
 * 3. 战术网格 (Yellow/Cyan)
 */
export function getTacticalMaterialFabric(options: TacticalMaterialOptions) {
    return {
        type: 'TacticalTerrain',
        uniforms: {
            colorLow: Color.fromCssColorString(options.colorLow),
            colorHigh: Color.fromCssColorString(options.colorHigh),
            colorRidge: Color.fromCssColorString(options.colorRidge),
            colorContour: Color.fromCssColorString(options.colorContour),
            colorMacroGrid: Color.fromCssColorString(options.colorMacroGrid),
            colorMicroGrid: Color.fromCssColorString(options.colorMicroGrid),
            elevationMin: options.elevationMin,
            elevationMax: options.elevationMax,
            contourInterval: options.contourInterval,
            contourThickness: options.contourThickness,
            macroGridDensity: options.macroGridDensity,
            macroGridWidth: options.macroGridWidth,
            microGridDensity: options.microGridDensity,
            microGridWidth: options.microGridWidth,
            lodNear: options.lodNear,
            lodMid: options.lodMid,
            lodFar: options.lodFar
        },
        source: `
            uniform vec4 colorLow;
            uniform vec4 colorHigh;
            uniform vec4 colorRidge;
            uniform vec4 colorContour;
            uniform vec4 colorMacroGrid;
            uniform vec4 colorMicroGrid;
            uniform float elevationMin;
            uniform float elevationMax;
            uniform float contourInterval;
            uniform float contourThickness;
            uniform float macroGridDensity;
            uniform float macroGridWidth;
            uniform float microGridDensity;
            uniform float microGridWidth;
            uniform float lodNear;
            uniform float lodMid;
            uniform float lodFar;

            float gridMask(vec2 st, float density, float width) {
                vec2 g = abs(fract(st * density - 0.5) - 0.5) / fwidth(st * density);
                float line = min(g.x, g.y);
                return 1.0 - smoothstep(0.0, width * 30.0, line);
            }

            vec2 sphericalUV(vec3 normalEC) {
                vec3 n = normalize(normalEC);
                float lon = atan(n.y, n.x);
                float lat = asin(clamp(n.z, -1.0, 1.0));
                return vec2((lon + czm_pi) / czm_twoPi, (lat + czm_piOverTwo) / czm_pi);
            }

            czm_material czm_getMaterial(czm_materialInput materialInput)
            {
                czm_material material = czm_getDefaultMaterial(materialInput);
                vec2 uv = sphericalUV(materialInput.normalEC);
                float span = max(1.0, elevationMax - elevationMin);
                float hRaw = materialInput.height;
                // 部分地形数据或驱动环境下 height 可能退化为常量，这里提供 UV 回退以避免纯色球
                float hFallback = mix(elevationMin, elevationMax, uv.y);
                float hHasDetail = step(1.0, abs(hRaw));
                float h = mix(hFallback, hRaw, hHasDetail);
                float hNorm = clamp((h - elevationMin) / span, 0.0, 1.0);

                vec3 base = mix(colorLow.rgb, colorHigh.rgb, pow(hNorm, 0.85));

                float slope = clamp(materialInput.slope, 0.0, 1.0);
                float ridge = smoothstep(0.48, 0.92, slope);
                base = mix(base, colorRidge.rgb, ridge * 0.5);

                // 无真实 slope 时，用法线与光向构造形体明暗，避免纯色球
                float lambert = clamp(dot(normalize(materialInput.normalEC), normalize(czm_lightDirectionEC)), -1.0, 1.0);
                float relief = 0.72 + 0.28 * lambert;
                base *= relief;

                float contourPhase = abs(fract(h / contourInterval) - 0.5);
                float contourAA = fwidth(h / contourInterval) * max(0.5, contourThickness);
                float contour = 1.0 - smoothstep(0.0, contourAA, contourPhase);

                float d = max(czm_eyeHeight, 0.0);
                float nearW = 1.0 - smoothstep(lodNear, lodMid, d);
                float midW = smoothstep(lodNear, lodMid, d) * (1.0 - smoothstep(lodMid, lodFar, d));
                float farW = smoothstep(lodMid, lodFar, d);

                float macroGrid = gridMask(uv, macroGridDensity, macroGridWidth);
                float microGrid = gridMask(uv, microGridDensity, microGridWidth);

                vec3 colorNear = base;
                colorNear = mix(colorNear, colorContour.rgb, contour * 0.45);
                colorNear = mix(colorNear, colorMicroGrid.rgb, microGrid * 0.55);

                vec3 colorMid = base;
                colorMid = mix(colorMid, colorContour.rgb, contour * 0.35);
                colorMid = mix(colorMid, colorMacroGrid.rgb, macroGrid * 0.35);

                vec3 colorFar = mix(base, colorMacroGrid.rgb, macroGrid * 0.24);

                vec3 finalColor = colorNear * nearW + colorMid * midW + colorFar * farW;
                finalColor = clamp(finalColor, 0.0, 1.0);

                material.diffuse = finalColor;
                material.alpha = 1.0;
                return material;
            }
        `
    };
}
