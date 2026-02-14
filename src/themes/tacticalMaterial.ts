import { Color } from 'cesium';

export type TacticalMaterialDebugMode = 'off' | 'solidRed' | 'heightBands';

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
    debugShading?: boolean;
    debugMode?: TacticalMaterialDebugMode;
    enableRelief?: boolean;
    enableContour?: boolean;
    enableMacroGrid?: boolean;
    enableMicroGrid?: boolean;
}

/**
 * 获取战术材质的 Fabric 定义 - "Red Flag" Nellis Style
 * 风格特点：
 * 1. 内华达沙漠地貌 (Tan/Brown)
 * 2. 伪光照 (Slope Shading) - 使用 fwidth(height) 模拟地形起伏
 * 3. 战术网格 (Yellow/Cyan)
 */
export function getTacticalMaterialFabric(options: TacticalMaterialOptions) {
    if (options.debugMode === 'solidRed') {
        return {
            type: 'TacticalTerrainDebugSolidRed',
            source: `
                czm_material czm_getMaterial(czm_materialInput materialInput)
                {
                    czm_material material = czm_getDefaultMaterial(materialInput);
                    material.diffuse = vec3(1.0, 0.0, 0.0);
                    material.alpha = 1.0;
                    return material;
                }
            `
        };
    }

    if (options.debugMode === 'heightBands') {
        return {
            type: 'TacticalTerrainDebugHeightBands',
            uniforms: {
                elevationMin: options.elevationMin,
                elevationMax: options.elevationMax,
                colorLow: Color.fromCssColorString(options.colorLow),
                colorHigh: Color.fromCssColorString(options.colorHigh),
                colorRidge: Color.fromCssColorString(options.colorRidge)
            },
            source: `
                uniform float elevationMin;
                uniform float elevationMax;
                uniform vec4 colorLow;
                uniform vec4 colorHigh;
                uniform vec4 colorRidge;

                czm_material czm_getMaterial(czm_materialInput materialInput)
                {
                    czm_material material = czm_getDefaultMaterial(materialInput);
                    float h = materialInput.height;
                    float span = max(1.0, elevationMax - elevationMin);
                    float hNorm = clamp((h - elevationMin) / span, 0.0, 1.0);
                    vec3 bandLow = colorLow.rgb * 0.92;
                    vec3 bandMid = mix(colorLow.rgb, colorHigh.rgb, 0.78);
                    vec3 bandHigh = colorRidge.rgb;
                    float lowMask = 1.0 - step(0.36, hNorm);
                    float midMask = step(0.36, hNorm) * (1.0 - step(0.68, hNorm));
                    float highMask = step(0.68, hNorm);
                    vec3 base = bandLow * lowMask + bandMid * midMask + bandHigh * highMask;
                    material.diffuse = clamp(base, 0.0, 1.0);
                    material.alpha = 1.0;
                    return material;
                }
            `
        };
    }

    if (options.debugShading) {
        return {
            type: 'TacticalTerrainDebug',
            uniforms: {
                colorLow: Color.fromCssColorString(options.colorLow),
                colorHigh: Color.fromCssColorString(options.colorHigh),
                colorRidge: Color.fromCssColorString(options.colorRidge),
                macroGridDensity: Math.max(2.0, options.macroGridDensity)
            },
            source: `
                uniform vec4 colorLow;
                uniform vec4 colorHigh;
                uniform vec4 colorRidge;
                uniform float macroGridDensity;

                czm_material czm_getMaterial(czm_materialInput materialInput)
                {
                    czm_material material = czm_getDefaultMaterial(materialInput);
                    vec2 uv = materialInput.st;

                    float latBand = smoothstep(0.28, 0.72, uv.y);
                    vec3 base = mix(colorLow.rgb, colorHigh.rgb, latBand);

                    float meridian = step(0.96, fract(uv.x * macroGridDensity));
                    base = mix(base, colorRidge.rgb, meridian * 0.45);

                    material.diffuse = clamp(base, 0.0, 1.0);
                    material.alpha = 1.0;
                    return material;
                }
            `
        };
    }

    return {
        type: 'TacticalTerrain',
        uniforms: {
            colorLow: Color.fromCssColorString(options.colorLow),
            colorHigh: Color.fromCssColorString(options.colorHigh),
            colorRidge: Color.fromCssColorString(options.colorRidge),
            colorContour: Color.fromCssColorString(options.colorContour),
            colorMacroGrid: Color.fromCssColorString(options.colorMacroGrid),
            colorMicroGrid: Color.fromCssColorString(options.colorMicroGrid),
            debugShading: 0.0,
            elevationMin: options.elevationMin,
            elevationMax: options.elevationMax,
            contourInterval: options.contourInterval,
            contourThickness: options.contourThickness,
            macroGridDensity: options.macroGridDensity,
            macroGridWidth: options.macroGridWidth,
            microGridDensity: options.microGridDensity,
            microGridWidth: options.microGridWidth,
            enableRelief: options.enableRelief === false ? 0.0 : 1.0,
            enableContour: options.enableContour === false ? 0.0 : 1.0,
            enableMacroGrid: options.enableMacroGrid === false ? 0.0 : 1.0,
            enableMicroGrid: options.enableMicroGrid === false ? 0.0 : 1.0,
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
            uniform float debugShading;
            uniform float elevationMin;
            uniform float elevationMax;
            uniform float contourInterval;
            uniform float contourThickness;
            uniform float macroGridDensity;
            uniform float macroGridWidth;
            uniform float microGridDensity;
            uniform float microGridWidth;
            uniform float enableRelief;
            uniform float enableContour;
            uniform float enableMacroGrid;
            uniform float enableMicroGrid;
            uniform float lodNear;
            uniform float lodMid;
            uniform float lodFar;

            float gridMask(vec2 st, float density, float width) {
                vec2 g = abs(fract(st * density - 0.5) - 0.5) / fwidth(st * density);
                float line = min(g.x, g.y);
                return 1.0 - smoothstep(0.0, width * 30.0, line);
            }

            vec2 sphericalUV(vec3 normalEC) {
                float nLen = length(normalEC);
                vec3 n = nLen > 0.0001 ? normalEC / nLen : vec3(0.0, 0.0, 1.0);
                float lon = atan(n.y, n.x);
                float lat = asin(clamp(n.z, -1.0, 1.0));
                return vec2((lon + czm_pi) / czm_twoPi, (lat + czm_piOverTwo) / czm_pi);
            }

            czm_material czm_getMaterial(czm_materialInput materialInput)
            {
                czm_material material = czm_getDefaultMaterial(materialInput);
                vec2 uvSt = materialInput.st;
                vec2 uv = uvSt;
                float stGrad = length(dFdx(uvSt)) + length(dFdy(uvSt));
                if (uv.x != uv.x || uv.y != uv.y || stGrad < 1e-5) {
                    uv = sphericalUV(materialInput.normalEC);
                }
                float span = max(1.0, elevationMax - elevationMin);
                float hRaw = materialInput.height;
                // 某些 Cesium/驱动路径下 materialInput.height 可能恒定或异常，需做可靠性判定。
                float hReliable = 1.0;
                if (hRaw != hRaw || abs(hRaw) > 30000.0 || abs(hRaw) < 0.01) {
                    hReliable = 0.0;
                }
                float hSignal = abs(dFdx(hRaw)) + abs(dFdy(hRaw));
                if (hSignal < 0.003) {
                    hReliable = 0.0;
                }
                float hFallback = mix(elevationMin, elevationMax, clamp(uv.y, 0.0, 1.0));
                float h = mix(hFallback, hRaw, hReliable);
                float nLenBase = length(materialInput.normalEC);
                vec3 nBase = nLenBase > 0.0001 ? materialInput.normalEC / nLenBase : vec3(0.0, 0.0, 1.0);
                float slopeMetric = 1.0 - abs(clamp(nBase.z, -1.0, 1.0));
                float synthNoise = 0.5 + 0.5 * sin((uv.x * 180.0 + uv.y * 140.0) + slopeMetric * 7.0);
                float hNormHeight = clamp((h - elevationMin) / span, 0.0, 1.0);
                float hNormSynth = clamp(0.20 + 0.62 * slopeMetric + 0.18 * synthNoise, 0.0, 1.0);
                float hNorm = mix(hNormSynth, hNormHeight, hReliable);
                float seaMask = mix(1.0, smoothstep(-80.0, 120.0, h), hReliable); // 0:sea, 1:land
                float seaT = clamp((h - elevationMin) / max(1.0, -elevationMin), 0.0, 1.0);
                float landT = hNorm;
                vec3 seaColor = mix(colorLow.rgb * 0.82, colorLow.rgb * 1.02, seaT);
                vec3 landColor = mix(colorHigh.rgb * 0.68, colorRidge.rgb, pow(landT, 0.88));
                vec3 base = mix(seaColor, landColor, seaMask);
                base = mix(base, mix(colorLow.rgb * 0.92, colorHigh.rgb * 1.06, pow(hNorm, 0.84)), 0.30);
                // 岩石化分层：按坡度混入岩石色，避免“整片土色”。
                vec3 rockDark = mix(colorLow.rgb * 0.60, colorContour.rgb, 0.45);
                vec3 rockBright = mix(colorHigh.rgb * 1.05, colorRidge.rgb, 0.55);
                float rockMaskSlope = smoothstep(0.18, 0.82, slopeMetric);
                float rockMaskHeight = smoothstep(0.24, 0.92, hNorm);
                float rockMask = clamp(max(rockMaskSlope, 0.38 + 0.30 * rockMaskHeight), 0.0, 1.0);
                float rockTex = 0.5 + 0.5 * sin(uv.x * 900.0 + uv.y * 740.0 + hNorm * 11.0);
                rockTex = mix(rockTex, 0.5 + 0.5 * sin(uv.x * 1360.0 - uv.y * 1180.0), 0.45);
                float macroRelief = 0.5 + 0.5 * sin(uv.x * 130.0 + uv.y * 95.0);
                rockTex = mix(rockTex, macroRelief, 0.28);
                vec3 rockColor = mix(rockDark, rockBright, clamp(0.28 + 0.72 * rockTex, 0.0, 1.0));
                base = mix(base, rockColor, 0.82 * rockMask);

                // 当高度梯度极低（远景/瓦片细节不足）时，注入稳定的纬向分层，避免整球发灰。
                float hGrad = length(vec2(dFdx(h), dFdy(h)));
                float lowDetailMask = 1.0 - smoothstep(0.5, 5.0, hGrad);
                vec3 fallbackBands = mix(colorLow.rgb * 0.92, colorHigh.rgb * 0.95, smoothstep(0.18, 0.82, uv.y));
                base = mix(base, fallbackBands, 0.03 * lowDetailMask);

                // 兼容不同 Cesium 版本：避免依赖可能缺失的 materialInput.slope。
                float ridge = smoothstep(0.55, 0.95, hNorm);
                base = mix(base, colorRidge.rgb, ridge * 0.42);

                // 无真实 slope 时，用法线与光向构造形体明暗；零法线时回退为 1.0，避免整球发黑。
                float relief = 1.0;
                if (enableRelief > 0.5) {
                    float nLen = length(materialInput.normalEC);
                    if (nLen > 0.0001) {
                        float lambert = clamp(dot(materialInput.normalEC / nLen, normalize(czm_lightDirectionEC)), -1.0, 1.0);
                        float halfLambert = 0.5 + 0.5 * lambert;
                        relief = 0.72 + 0.28 * halfLambert;
                    }
                }
                base *= relief;
                // 抬升基础亮度，保证谷底与山体细节不被整体压黑。
                base = mix(base, base * 1.14, 0.26);
                float slopeBoost = clamp(hGrad / 9.0, 0.0, 1.0);
                base = mix(base * 0.62, base * 1.36, slopeBoost);

                // RedFlag 风格增强：当地形本身分辨率有限时，叠加轻量程序化地貌纹理以提升可读性。
                float ridgeNoiseA = sin((uv.x + uv.y) * 220.0);
                float ridgeNoiseB = sin((uv.x - uv.y) * 170.0);
                float ridgeNoiseC = sin((uv.x * 1.7 + uv.y * 0.6) * 310.0);
                float ridgeNoiseD = sin((uv.x * 4.2 - uv.y * 2.5) * 520.0);
                float ridgeNoiseE = sin((uv.x * 9.0 + uv.y * 7.0) * 680.0);
                float ridgeNoise = (ridgeNoiseA + ridgeNoiseB + 0.6 * ridgeNoiseC + 0.45 * ridgeNoiseD + 0.35 * ridgeNoiseE) / 3.4;
                float dune = 0.5 + 0.5 * ridgeNoise;
                float duneGain = 0.74 + 0.58 * dune;
                base *= mix(1.0, duneGain, 0.72 * enableRelief);

                // 峡谷地表细节增强：使用高频条纹模拟裸岩/冲沟纹理，避免“糊成一片”。
                float strata = 0.5 + 0.5 * sin((uv.x * 730.0 + uv.y * 510.0) + hNorm * 18.0);
                float strataFine = 0.5 + 0.5 * sin((uv.x * 1320.0 - uv.y * 990.0) + hNorm * 33.0);
                float floorMask = 1.0 - smoothstep(0.16, 0.55, hNorm);
                base = mix(base, base * (0.72 + 0.45 * strata + 0.20 * strataFine), 0.44 * floorMask);
                float ridgeMask = smoothstep(0.62, 0.96, hNorm);
                float cavityMask = floorMask * (1.0 - smoothstep(0.9, 4.2, hGrad));
                base *= (1.0 - 0.24 * cavityMask);
                base = mix(base, colorRidge.rgb, 0.24 * ridgeMask * slopeBoost);

                float hForContour = mix(elevationMin + hNorm * span, h, hReliable);
                float contourPhase = abs(fract(hForContour / contourInterval) - 0.5);
                // 不依赖导数抗锯齿，避免在部分驱动上等高线被“吃掉”导致整片平色。
                float contourHalfWidth = clamp(0.015 * contourThickness, 0.01, 0.12);
                float contour = 1.0 - smoothstep(0.5 - contourHalfWidth, 0.5, contourPhase);
                if (contour != contour) {
                    contour = 0.0;
                }

                float d = max(czm_eyeHeight, 0.0);
                float nearW = 1.0 - smoothstep(lodNear, lodMid, d);
                float midW = smoothstep(lodNear, lodMid, d) * (1.0 - smoothstep(lodMid, lodFar, d));
                float farW = smoothstep(lodMid, lodFar, d);
                float nearDetailGain = 1.0 - smoothstep(lodNear * 0.72, lodMid, d);
                base = mix(base, base * (0.78 + 0.38 * strataFine), 0.38 * nearDetailGain);

                float macroGrid = 0.0;
                if (enableMacroGrid > 0.5) {
                    macroGrid = gridMask(uv, macroGridDensity, macroGridWidth);
                }
                float microGrid = 0.0;
                if (enableMicroGrid > 0.5) {
                    microGrid = gridMask(uv, microGridDensity, microGridWidth);
                }

                vec3 colorNear = base;
                colorNear = mix(colorNear, colorContour.rgb, contour * 0.92 * enableContour);
                colorNear = mix(colorNear, colorMicroGrid.rgb, microGrid * 0.55 * enableMicroGrid);

                vec3 colorMid = base;
                colorMid = mix(colorMid, colorContour.rgb, contour * 0.78 * enableContour);
                colorMid = mix(colorMid, colorMacroGrid.rgb, macroGrid * 0.52 * enableMacroGrid);

                vec3 colorFar = mix(base * 0.92, colorMacroGrid.rgb, macroGrid * 0.30 * enableMacroGrid);

                vec3 finalColor = colorNear * nearW + colorMid * midW + colorFar * farW;
                // 提升整体可读性：拉升亮度并增加中间调对比，避免“整片泥色”。
                finalColor = pow(clamp(finalColor, 0.0, 1.0), vec3(0.82));
                finalColor *= 1.18;
                finalColor = mix(finalColor, finalColor * (0.84 + 0.30 * hNorm), 0.20);
                finalColor = clamp(finalColor, 0.0, 1.0);
                if (finalColor.r != finalColor.r || finalColor.g != finalColor.g || finalColor.b != finalColor.b) {
                    finalColor = clamp(base, 0.0, 1.0);
                }

                material.diffuse = finalColor;
                material.alpha = 1.0;
                return material;
            }
        `
    };
}
