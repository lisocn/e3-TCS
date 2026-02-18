import { Color } from 'cesium';

export interface TacticalMaterialOptions {
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
    toneGamma?: number;
    toneShadowFloor?: number;
    minLighting?: number;
    atmosphereHazeColor?: string;
    atmosphereFarStart?: number;
    atmosphereFarEnd?: number;
    atmosphereStrength?: number;
    enableRelief?: boolean;
    enableContour?: boolean;
    enableMacroGrid?: boolean;
    enableMicroGrid?: boolean;
    redFlagSlopeStart?: number;
    redFlagSlopeEnd?: number;
    redFlagHardBand?: number;
    redFlagGridMix?: number;
    redFlagGridEmissive?: number;
}

/**
 * 战术材质：仅保留 RedFlag 风格主链路。
 * 设计目标：高对比、硬分层、HUD 网格叠加，去除写实噪声干扰。
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
            toneGamma: options.toneGamma ?? 1.2,
            toneShadowFloor: options.toneShadowFloor ?? 0.3,
            minLighting: options.minLighting ?? 0.1,
            atmosphereHazeColor: Color.fromCssColorString(options.atmosphereHazeColor ?? '#000000'),
            atmosphereFarStart: options.atmosphereFarStart ?? 22000.0,
            atmosphereFarEnd: options.atmosphereFarEnd ?? 100000.0,
            atmosphereStrength: options.atmosphereStrength ?? 0.3,
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
            redFlagSlopeStart: options.redFlagSlopeStart ?? 0.20,
            redFlagSlopeEnd: options.redFlagSlopeEnd ?? 0.78,
            redFlagHardBand: options.redFlagHardBand ?? 0.82,
            redFlagGridMix: options.redFlagGridMix ?? 1.0,
            redFlagGridEmissive: options.redFlagGridEmissive ?? 1.9,
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
            uniform float toneGamma;
            uniform float toneShadowFloor;
            uniform float minLighting;
            uniform vec4 atmosphereHazeColor;
            uniform float atmosphereFarStart;
            uniform float atmosphereFarEnd;
            uniform float atmosphereStrength;
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
            uniform float redFlagSlopeStart;
            uniform float redFlagSlopeEnd;
            uniform float redFlagHardBand;
            uniform float redFlagGridMix;
            uniform float redFlagGridEmissive;
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
                vec2 uv = sphericalUV(materialInput.normalEC);

                float nLen = length(materialInput.normalEC);
                vec3 nBase = nLen > 0.0001 ? materialInput.normalEC / nLen : vec3(0.0, 0.0, 1.0);
                float slopeMetric = 1.0 - abs(clamp(nBase.z, -1.0, 1.0));
                float normalDeriv = length(dFdx(nBase)) + length(dFdy(nBase));
                float nDotL = clamp(dot(nBase, normalize(czm_lightDirectionEC)), -1.0, 1.0);
                float litResponse = max(nDotL, 0.0);
                float litFloor = clamp(minLighting, 0.0, 0.5);
                float lit = clamp(litFloor + (1.0 - litFloor) * litResponse, 0.0, 1.0);

                float slopeStart = clamp(redFlagSlopeStart, 0.02, 0.90);
                float slopeEnd = clamp(redFlagSlopeEnd, slopeStart + 0.02, 0.98);
                float hardSlope = smoothstep(slopeStart, slopeEnd, slopeMetric);
                float hardBand = clamp(redFlagHardBand, 0.0, 1.0);
                hardSlope = mix(hardSlope, step(0.5, hardSlope), hardBand);

                vec3 base = mix(colorLow.rgb, colorHigh.rgb, hardSlope);
                float ridgeMask = smoothstep(0.34, 0.90, slopeMetric + 0.55 * normalDeriv);
                ridgeMask = mix(ridgeMask, step(0.60, ridgeMask), 0.75 * hardBand);
                base = mix(base, colorRidge.rgb, ridgeMask * 0.72);

                float shade = mix(clamp(toneShadowFloor, 0.05, 0.9), 1.08, smoothstep(0.08, 0.84, lit));
                vec3 finalColor = base * mix(1.0, shade, enableRelief);
                float plainMask = 1.0 - smoothstep(0.20, 0.56, slopeMetric);
                float shadowMask = smoothstep(0.14, 0.90, 1.0 - lit) * smoothstep(0.18, 0.88, slopeMetric);
                vec3 shadowWarmTone = vec3(
                    colorLow.r * 1.06 + colorHigh.r * 0.14,
                    colorLow.g * 0.94 + colorHigh.g * 0.10,
                    colorLow.b * 0.80 + colorHigh.b * 0.04
                );
                finalColor = mix(finalColor, clamp(shadowWarmTone, 0.0, 1.0), 0.34 * shadowMask);
                vec3 plainLiftTone = mix(colorHigh.rgb * 1.04, colorRidge.rgb * 0.86, 0.32);
                finalColor = mix(finalColor, plainLiftTone, 0.24 * plainMask);
                float plainWave1 = sin(uv.x * 182.0 + uv.y * 116.0);
                float plainWave2 = sin(uv.x * 94.0 - uv.y * 143.0);
                float plainBi = 0.5 * plainWave1 + 0.5 * plainWave2;
                vec3 plainWarm = vec3(finalColor.r * 1.05, finalColor.g * 1.01, finalColor.b * 0.95);
                vec3 plainCool = vec3(finalColor.r * 0.95, finalColor.g * 1.00, finalColor.b * 1.07);
                finalColor = mix(finalColor, mix(plainCool, plainWarm, plainWave1 * 0.5 + 0.5), 0.24 * plainMask);
                finalColor = clamp(finalColor + vec3(plainBi * 0.082 * plainMask), 0.0, 1.0);
                finalColor = clamp(finalColor + vec3(0.036 * plainMask), 0.0, 1.0);

                float contour = 0.0;
                if (enableContour > 0.5) {
                    float contourFreq = max(4.0, contourInterval * 0.08);
                    float contourCoord = hardSlope * contourFreq;
                    float contourPhase = abs(fract(contourCoord) - 0.5);
                    float contourHalfWidth = clamp(0.002 * contourThickness, 0.0012, 0.010);
                    float contourAA = clamp(fwidth(contourCoord) * 0.7, 0.001, 0.012);
                    contour = 1.0 - smoothstep(contourHalfWidth, contourHalfWidth + contourAA, contourPhase);
                }
                finalColor = mix(finalColor, colorContour.rgb, contour * 0.40);

                float macroGrid = 0.0;
                if (enableMacroGrid > 0.5) {
                    macroGrid = gridMask(uv, macroGridDensity, macroGridWidth);
                }
                float microGrid = 0.0;
                if (enableMicroGrid > 0.5) {
                    microGrid = gridMask(uv, microGridDensity, microGridWidth);
                }

                float d = max(czm_eyeHeight, 0.0);
                float farAtmos = smoothstep(atmosphereFarStart, atmosphereFarEnd, d);
                float haze = farAtmos * clamp(atmosphereStrength, 0.0, 1.0);
                finalColor = pow(clamp(finalColor, 0.0, 1.0), vec3(max(0.01, toneGamma)));
                finalColor = mix(finalColor, atmosphereHazeColor.rgb, haze);
                float luma = dot(finalColor, vec3(0.299, 0.587, 0.114));
                finalColor = mix(finalColor, vec3(luma), 0.03);
                finalColor = clamp(finalColor * vec3(1.04, 1.00, 0.89), 0.0, 1.0);
                finalColor = clamp((finalColor - 0.5) * 1.03 + 0.5, 0.0, 1.0);

                float gridMix = clamp(redFlagGridMix, 0.0, 1.0);
                float grid = clamp(macroGrid * 0.82 + microGrid * 0.38, 0.0, 1.0);
                vec3 gridColor = clamp(colorMacroGrid.rgb * max(0.0, redFlagGridEmissive), 0.0, 2.0);
                vec3 overlay = clamp(finalColor + gridColor, 0.0, 1.0);
                finalColor = mix(finalColor, overlay, grid * gridMix);

                if (finalColor.r != finalColor.r || finalColor.g != finalColor.g || finalColor.b != finalColor.b) {
                    finalColor = clamp(base, 0.0, 1.0);
                }

                material.diffuse = clamp(finalColor, 0.0, 1.0);
                material.alpha = 1.0;
                return material;
            }
        `
    };
}
