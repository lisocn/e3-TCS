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
    enableRelief?: boolean;
    enableContour?: boolean;
    enableMacroGrid?: boolean;
    enableMicroGrid?: boolean;
}

/**
 * 获取战术地形材质 Fabric 定义。
 * 当前路线：完全基于法线与视距进行地形表达，不再依赖高度链路。
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

                float nLenBase = length(materialInput.normalEC);
                vec3 nBase = nLenBase > 0.0001 ? materialInput.normalEC / nLenBase : vec3(0.0, 0.0, 1.0);
                float slopeMetric = 1.0 - abs(clamp(nBase.z, -1.0, 1.0));
                float nDotL = clamp(dot(nBase, normalize(czm_lightDirectionEC)), -1.0, 1.0);
                float lambert = max(nDotL, 0.0);
                float lit = 0.30 + 0.70 * pow(lambert, 0.85);
                float normalVar = clamp((length(dFdx(nBase)) + length(dFdy(nBase))) * 10.0, 0.0, 1.0);
                float macroNoise = 0.5 + 0.5 * sin(uv.x * 34.0 + uv.y * 27.0 + slopeMetric * 6.0);
                float microNoise = 0.5 + 0.5 * sin(uv.x * 240.0 - uv.y * 210.0 + normalVar * 9.0);
                float terrainShape = clamp(0.58 * slopeMetric + 0.28 * normalVar + 0.14 * macroNoise, 0.0, 1.0);

                vec3 valleyColor = mix(colorLow.rgb * 0.56, colorContour.rgb * 0.94, 0.34);
                vec3 ridgeColor = mix(colorHigh.rgb * 1.12, colorRidge.rgb, 0.66);
                vec3 base = mix(valleyColor, ridgeColor, pow(terrainShape, 0.94));
                float ridgeMask = smoothstep(0.64, 0.96, terrainShape);
                base = mix(base, colorRidge.rgb, 0.42 * ridgeMask);

                float rockMask = smoothstep(0.10, 0.88, slopeMetric);
                float strata = 0.5 + 0.5 * sin((uv.x * 68.0 + uv.y * 52.0) + terrainShape * 14.0);
                float strataFine = 0.5 + 0.5 * sin((uv.x * 210.0 - uv.y * 176.0) + terrainShape * 20.0);
                vec3 rockTone = mix(colorContour.rgb * 0.70, colorRidge.rgb, 0.14 + 0.86 * strata);
                base = mix(base, rockTone, 0.68 * rockMask);

                float reliefGain = mix(0.62, 1.58, lit);
                base *= mix(1.0, reliefGain, enableRelief);
                float cavity = smoothstep(0.10, 0.80, slopeMetric) * (1.0 - lit);
                base *= (1.0 - 0.42 * cavity);

                float pseudoElev = terrainShape + 0.24 * macroNoise;
                float contourFreq = max(6.0, contourInterval * 0.08);
                float contourPhase = abs(fract(pseudoElev * contourFreq) - 0.5);
                float contourHalfWidth = clamp(0.007 * contourThickness, 0.005, 0.045);
                float contour = 1.0 - smoothstep(0.5 - contourHalfWidth, 0.5, contourPhase);
                if (contour != contour) {
                    contour = 0.0;
                }

                float d = max(czm_eyeHeight, 0.0);
                float nearW = 1.0 - smoothstep(lodNear, lodMid, d);
                float midW = smoothstep(lodNear, lodMid, d) * (1.0 - smoothstep(lodMid, lodFar, d));
                float farW = smoothstep(lodMid, lodFar, d);
                float nearDetailGain = 1.0 - smoothstep(lodNear * 0.72, lodMid, d);
                base = mix(base, base * (0.82 + 0.34 * strataFine), 0.38 * nearDetailGain);
                float rockyMicro = clamp(0.62 * microNoise + 0.38 * macroNoise, 0.0, 1.0);
                float rockyMicroGain = 0.22 + 0.46 * nearDetailGain + 0.10 * midW;
                base = mix(base * 0.80, base * (0.70 + 0.76 * rockyMicro), rockyMicroGain);
                float ridgeDetail = smoothstep(0.56, 0.96, terrainShape);
                base = mix(base, base * (0.90 + 0.18 * microNoise), 0.28 * ridgeDetail);

                float macroGrid = 0.0;
                if (enableMacroGrid > 0.5) {
                    macroGrid = gridMask(uv, macroGridDensity, macroGridWidth);
                }
                float microGrid = 0.0;
                if (enableMicroGrid > 0.5) {
                    microGrid = gridMask(uv, microGridDensity, microGridWidth);
                }

                vec3 colorNear = base;
                colorNear = mix(colorNear, colorContour.rgb, contour * 0.56 * enableContour);
                colorNear = mix(colorNear, colorMicroGrid.rgb, microGrid * 0.55 * enableMicroGrid);

                vec3 colorMid = base;
                colorMid = mix(colorMid, colorContour.rgb, contour * 0.42 * enableContour);
                colorMid = mix(colorMid, colorMacroGrid.rgb, macroGrid * 0.52 * enableMacroGrid);

                vec3 colorFar = mix(base * 0.92, colorMacroGrid.rgb, macroGrid * 0.30 * enableMacroGrid);

                vec3 finalColor = colorNear * nearW + colorMid * midW + colorFar * farW;
                finalColor = pow(clamp(finalColor, 0.0, 1.0), vec3(0.94));
                float shapeBoost = clamp(0.36 + 0.64 * terrainShape + 0.26 * (lit - 0.45), 0.0, 1.0);
                finalColor = mix(finalColor * 0.76, finalColor * 1.27, shapeBoost);
                float edgeMetric = clamp((length(dFdx(nBase)) + length(dFdy(nBase))) * 8.0, 0.0, 1.0);
                finalColor = mix(finalColor * 0.94, finalColor * 1.10, edgeMetric);
                float ridgeSharp = smoothstep(0.56, 0.96, terrainShape);
                finalColor = mix(finalColor, finalColor * (0.82 + 0.44 * strataFine), 0.24 * ridgeSharp);
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
