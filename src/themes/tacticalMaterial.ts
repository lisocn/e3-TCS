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
    valleyContourMix?: number;
    ridgeAccentMix?: number;
    toneGamma?: number;
    toneShadowFloor?: number;
    toneHighlightCeiling?: number;
    atmosphereHazeColor?: string;
    atmosphereFarStart?: number;
    atmosphereFarEnd?: number;
    atmosphereStrength?: number;
    atmosphereDesaturate?: number;
    horizonWarmColor?: string;
    horizonCoolColor?: string;
    horizonStrength?: number;
    horizonFarStart?: number;
    horizonFarEnd?: number;
    colorSunWarm?: string;
    colorShadowCool?: string;
    warmCoolStrength?: number;
    minLighting?: number;
    diffuseWrap?: number;
    ridgeRimGain?: number;
    shadowBrownGain?: number;
    enableRelief?: boolean;
    enableContour?: boolean;
    enableMacroGrid?: boolean;
    enableMicroGrid?: boolean;
    seamSuppressStrength?: number;
    normalDetailGain?: number;
    edgeEnhanceGain?: number;
    skirtSuppressStrength?: number;
    seamFlattenStrength?: number;
    seamLightingSuppress?: number;
    plainBlendGain?: number;
    rockDetailGain?: number;
    plainCrispGain?: number;
    plainGrainGain?: number;
    oliveBias?: number;
    colorMatchDesat?: number;
    colorMatchBalance?: number;
    hueShiftDeg?: number;
    saturationScale?: number;
    seamBandStrength?: number;
    seamMatteStrength?: number;
    plainMudBreakGain?: number;
    plainTintSplitGain?: number;
    plainMicroReliefGain?: number;
    plainStructureGain?: number;
    plainChromaticDiversityGain?: number;
    plainFrequencyMixGain?: number;
    plainLayerExpansionGain?: number;
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
            valleyContourMix: options.valleyContourMix ?? 0.34,
            ridgeAccentMix: options.ridgeAccentMix ?? 0.66,
            toneGamma: options.toneGamma ?? 0.94,
            toneShadowFloor: options.toneShadowFloor ?? 0.76,
            toneHighlightCeiling: options.toneHighlightCeiling ?? 1.27,
            atmosphereHazeColor: Color.fromCssColorString(options.atmosphereHazeColor ?? '#c7b08a'),
            atmosphereFarStart: options.atmosphereFarStart ?? 260000.0,
            atmosphereFarEnd: options.atmosphereFarEnd ?? 1350000.0,
            atmosphereStrength: options.atmosphereStrength ?? 0.34,
            atmosphereDesaturate: options.atmosphereDesaturate ?? 0.26,
            horizonWarmColor: Color.fromCssColorString(options.horizonWarmColor ?? '#d8b784'),
            horizonCoolColor: Color.fromCssColorString(options.horizonCoolColor ?? '#8d8fa4'),
            horizonStrength: options.horizonStrength ?? 0.18,
            horizonFarStart: options.horizonFarStart ?? 220000.0,
            horizonFarEnd: options.horizonFarEnd ?? 1200000.0,
            colorSunWarm: Color.fromCssColorString(options.colorSunWarm ?? '#f3c87f'),
            colorShadowCool: Color.fromCssColorString(options.colorShadowCool ?? '#8f90a0'),
            warmCoolStrength: options.warmCoolStrength ?? 0.24,
            minLighting: options.minLighting ?? 0.22,
            diffuseWrap: options.diffuseWrap ?? 0.0,
            ridgeRimGain: options.ridgeRimGain ?? 0.0,
            shadowBrownGain: options.shadowBrownGain ?? 0.0,
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
            seamSuppressStrength: options.seamSuppressStrength ?? 0.0,
            normalDetailGain: options.normalDetailGain ?? 1.0,
            edgeEnhanceGain: options.edgeEnhanceGain ?? 1.0,
            skirtSuppressStrength: options.skirtSuppressStrength ?? 0.0,
            seamFlattenStrength: options.seamFlattenStrength ?? 0.0,
            seamLightingSuppress: options.seamLightingSuppress ?? 0.0,
            plainBlendGain: options.plainBlendGain ?? 1.0,
            rockDetailGain: options.rockDetailGain ?? 1.0,
            plainCrispGain: options.plainCrispGain ?? 1.0,
            plainGrainGain: options.plainGrainGain ?? 1.0,
            oliveBias: options.oliveBias ?? 0.0,
            colorMatchDesat: options.colorMatchDesat ?? 0.0,
            colorMatchBalance: options.colorMatchBalance ?? 0.0,
            hueShiftDeg: options.hueShiftDeg ?? 0.0,
            saturationScale: options.saturationScale ?? 1.0,
            seamBandStrength: options.seamBandStrength ?? 0.0,
            seamMatteStrength: options.seamMatteStrength ?? 0.0,
            plainMudBreakGain: options.plainMudBreakGain ?? 0.0,
            plainTintSplitGain: options.plainTintSplitGain ?? 0.0,
            plainMicroReliefGain: options.plainMicroReliefGain ?? 0.0,
            plainStructureGain: options.plainStructureGain ?? 1.0,
            plainChromaticDiversityGain: options.plainChromaticDiversityGain ?? 0.0,
            plainFrequencyMixGain: options.plainFrequencyMixGain ?? 0.0,
            plainLayerExpansionGain: options.plainLayerExpansionGain ?? 0.0,
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
            uniform float valleyContourMix;
            uniform float ridgeAccentMix;
            uniform float toneGamma;
            uniform float toneShadowFloor;
            uniform float toneHighlightCeiling;
            uniform vec4 atmosphereHazeColor;
            uniform float atmosphereFarStart;
            uniform float atmosphereFarEnd;
            uniform float atmosphereStrength;
            uniform float atmosphereDesaturate;
            uniform vec4 horizonWarmColor;
            uniform vec4 horizonCoolColor;
            uniform float horizonStrength;
            uniform float horizonFarStart;
            uniform float horizonFarEnd;
            uniform vec4 colorSunWarm;
            uniform vec4 colorShadowCool;
            uniform float warmCoolStrength;
            uniform float minLighting;
            uniform float diffuseWrap;
            uniform float ridgeRimGain;
            uniform float shadowBrownGain;
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
            uniform float seamSuppressStrength;
            uniform float normalDetailGain;
            uniform float edgeEnhanceGain;
            uniform float skirtSuppressStrength;
            uniform float seamFlattenStrength;
            uniform float seamLightingSuppress;
            uniform float plainBlendGain;
            uniform float rockDetailGain;
            uniform float plainCrispGain;
            uniform float plainGrainGain;
            uniform float oliveBias;
            uniform float colorMatchDesat;
            uniform float colorMatchBalance;
            uniform float hueShiftDeg;
            uniform float saturationScale;
            uniform float seamBandStrength;
            uniform float seamMatteStrength;
            uniform float plainMudBreakGain;
            uniform float plainTintSplitGain;
            uniform float plainMicroReliefGain;
            uniform float plainStructureGain;
            uniform float plainChromaticDiversityGain;
            uniform float plainFrequencyMixGain;
            uniform float plainLayerExpansionGain;
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

            float hash12(vec2 p) {
                vec3 p3 = fract(vec3(p.xyx) * 0.1031);
                p3 += dot(p3, p3.yzx + 33.33);
                return fract((p3.x + p3.y) * p3.z);
            }

            float valueNoise(vec2 p) {
                vec2 i = floor(p);
                vec2 f = fract(p);
                float a = hash12(i);
                float b = hash12(i + vec2(1.0, 0.0));
                float c = hash12(i + vec2(0.0, 1.0));
                float d = hash12(i + vec2(1.0, 1.0));
                vec2 u = f * f * (3.0 - 2.0 * f);
                return mix(mix(a, b, u.x), mix(c, d, u.x), u.y);
            }

            float fbm(vec2 p) {
                float v = 0.0;
                float amp = 0.5;
                for (int i = 0; i < 4; i++) {
                    v += amp * valueNoise(p);
                    p = p * 2.03 + vec2(19.0, 37.0);
                    amp *= 0.5;
                }
                return clamp(v, 0.0, 1.0);
            }

            vec3 hueRotateYiq(vec3 color, float hueShiftRad, float satScale) {
                mat3 rgb2yiq = mat3(
                    0.299,  0.587,  0.114,
                    0.596, -0.274, -0.322,
                    0.211, -0.523,  0.312
                );
                mat3 yiq2rgb = mat3(
                    1.0,  0.956,  0.621,
                    1.0, -0.272, -0.647,
                    1.0, -1.106,  1.703
                );
                vec3 yiq = rgb2yiq * color;
                float hue = atan(yiq.z, yiq.y) + hueShiftRad;
                float chroma = length(yiq.yz) * max(0.0, satScale);
                yiq.y = chroma * cos(hue);
                yiq.z = chroma * sin(hue);
                return clamp(yiq2rgb * yiq, 0.0, 1.0);
            }

            czm_material czm_getMaterial(czm_materialInput materialInput)
            {
                czm_material material = czm_getDefaultMaterial(materialInput);
                // 使用全局连续球面坐标，避免按 tile 的局部 st 在边界处发生纹理断裂。
                vec2 uv = sphericalUV(materialInput.normalEC);

                float nLenBase = length(materialInput.normalEC);
                vec3 nBase = nLenBase > 0.0001 ? materialInput.normalEC / nLenBase : vec3(0.0, 0.0, 1.0);
                float slopeMetric = 1.0 - abs(clamp(nBase.z, -1.0, 1.0));
                float nDotL = clamp(dot(nBase, normalize(czm_lightDirectionEC)), -1.0, 1.0);
                float lambert = max(nDotL, 0.0);
                float halfLambert = clamp(0.5 * nDotL + 0.5, 0.0, 1.0);
                float wrap = clamp(diffuseWrap, 0.0, 0.65);
                float wrapLambert = clamp((nDotL + wrap) / (1.0 + wrap), 0.0, 1.0);
                float litResponse = mix(
                    pow(lambert, 1.15),
                    pow(halfLambert, 1.05),
                    0.55
                );
                litResponse = mix(litResponse, pow(wrapLambert, 1.0), 0.55 * wrap);
                float lightFloor = clamp(minLighting, 0.05, 0.75);
                float lit = clamp(lightFloor + (1.0 - lightFloor) * litResponse, 0.0, 1.0);
                float d = max(czm_eyeHeight, 0.0);
                float normalDeriv = length(dFdx(nBase)) + length(dFdy(nBase));
                float seamGuard = clamp(seamSuppressStrength, 0.0, 1.0);
                float seamLikelyNormal = smoothstep(0.25, 0.90, max(0.0, normalDeriv - (0.10 + 0.28 * slopeMetric)));
                float slopeDeriv = length(dFdx(slopeMetric)) + length(dFdy(slopeMetric));
                float seamLikelySlope = smoothstep(0.08, 0.32, slopeDeriv) * smoothstep(0.34, 0.94, slopeMetric);
                float seamLikely = max(seamLikelyNormal, 0.78 * seamLikelySlope);
                float seamDistanceGain = 0.55 + 0.45 * smoothstep(lodNear * 0.70, lodFar, d);
                float seamMask = clamp(seamLikely * seamDistanceGain, 0.0, 1.0);
                float normalDerivStable = mix(normalDeriv, normalDeriv * (1.0 - 0.52 * seamLikely), seamGuard);
                float normalVar = clamp(normalDerivStable * (10.0 * clamp(normalDetailGain, 0.2, 1.2)), 0.0, 1.0);
                float skirtLikely = smoothstep(0.90, 0.995, slopeMetric) * (1.0 - smoothstep(0.06, 0.22, normalDerivStable));
                float flatSuppress = smoothstep(0.16, 0.52, slopeMetric);
                normalVar *= flatSuppress;
                float macroNoise = fbm(uv * 22.0 + vec2(slopeMetric * 1.8, normalVar * 1.2));
                float microNoiseNear = fbm(uv * 88.0 + vec2(normalVar * 2.6, slopeMetric * 2.2));
                float microNoiseFar = fbm(uv * 26.0 + vec2(normalVar * 1.1, slopeMetric * 0.9));
                float microNoise = mix(microNoiseNear, microNoiseFar, smoothstep(lodNear * 0.92, lodFar * 0.88, d));
                float macroShape = fbm(uv * 6.2 + vec2(1.7, 4.1));
                float macroRelief = fbm(uv * 3.4 + vec2(7.9, 2.6));
                float slopeForShapeRaw = mix(slopeMetric * 0.30, slopeMetric, smoothstep(0.22, 0.62, slopeMetric));
                float skirtSuppress = clamp(skirtSuppressStrength, 0.0, 1.0) * skirtLikely;
                float slopeForShape = mix(slopeForShapeRaw, min(slopeForShapeRaw, 0.72), skirtSuppress);
                float terrainShape = clamp(0.60 * slopeForShape + 0.24 * normalVar + 0.16 * macroNoise, 0.0, 1.0);
                float uvAliasMetric = length(dFdx(uv * 160.0)) + length(dFdy(uv * 160.0));
                float detailAliasingSuppress = 1.0 - smoothstep(0.32, 1.35, uvAliasMetric);

                float curvatureMetric = clamp(
                    0.75 * normalDerivStable + 1.35 * slopeDeriv,
                    0.0,
                    1.0
                );
                float plainLayerW = 1.0 - smoothstep(0.12, 0.34, slopeMetric);
                float slopeLayerW = smoothstep(0.16, 0.66, slopeMetric) * (1.0 - smoothstep(0.68, 0.95, slopeMetric));
                float ridgeLayerW = smoothstep(0.50, 0.90, slopeMetric)
                    * smoothstep(0.30, 0.84, curvatureMetric)
                    * smoothstep(0.46, 0.96, terrainShape)
                    * (1.0 - 0.68 * skirtSuppress);
                float plainExpand = clamp(plainLayerExpansionGain, 0.0, 1.0);
                plainLayerW += 0.16 * plainExpand * smoothstep(0.02, 0.30, 1.0 - slopeMetric);
                plainLayerW = pow(clamp(plainLayerW, 0.0, 1.0), mix(1.28, 0.92, plainExpand));
                slopeLayerW = pow(clamp(slopeLayerW, 0.0, 1.0), 1.14);
                ridgeLayerW = pow(clamp(ridgeLayerW, 0.0, 1.0), 1.52);
                float layerNorm = max(0.001, plainLayerW + slopeLayerW + ridgeLayerW);
                plainLayerW /= layerNorm;
                slopeLayerW /= layerNorm;
                ridgeLayerW /= layerNorm;

                float strata = fbm(uv * 36.0 + vec2(terrainShape * 2.2, slopeMetric * 1.6));
                float strataFine = fbm(uv * 92.0 + vec2(normalVar * 3.2, terrainShape * 2.6));
                float plainNoise = fbm(uv * 8.0 + vec2(2.1, 5.7));
                float plainGravelCoarse = fbm(uv * 24.0 + vec2(3.2, 1.7));
                float plainGravelFine = fbm(uv * 118.0 + vec2(plainGravelCoarse * 2.1, terrainShape * 3.1));
                float plainFreqMix = clamp(plainFrequencyMixGain, 0.0, 1.0);
                float plainGravelMid = fbm(uv * 56.0 + vec2(plainNoise * 1.8, slopeMetric * 2.3));
                float plainStrataField = fbm(uv * 14.0 + vec2(macroRelief * 2.1, plainGravelCoarse * 1.7));
                float plainGravelBase = clamp(
                    0.48 * plainGravelCoarse + 0.26 * plainGravelMid + 0.26 * plainGravelFine,
                    0.0,
                    1.0
                );
                float plainGravel = mix(
                    plainGravelBase,
                    clamp(0.62 * plainGravelBase + 0.38 * plainStrataField, 0.0, 1.0),
                    0.45 * plainFreqMix
                );
                vec3 plainColor = mix(colorLow.rgb * 0.92, colorHigh.rgb * 0.88, plainNoise * 0.12);
                float plainChromatic = clamp(plainChromaticDiversityGain, 0.0, 1.0);
                float plainToneField = fbm(uv * 11.0 + vec2(plainGravelCoarse * 2.2, macroRelief * 1.7));
                vec3 plainWarmTone = mix(colorHigh.rgb * 1.08, colorSunWarm.rgb * 1.00, 0.62);
                vec3 plainCoolTone = mix(colorLow.rgb * 0.86, colorShadowCool.rgb * 1.04, 0.58);
                vec3 plainSplitTone = mix(plainCoolTone, plainWarmTone, plainToneField);
                plainColor = mix(plainColor, plainSplitTone, 0.42 * plainChromatic);
                float plainToneBi = plainToneField * 2.0 - 1.0;
                plainColor = clamp(
                    plainColor + vec3(plainToneBi * 0.050, -plainToneBi * 0.020, -plainToneBi * 0.030) * plainChromatic,
                    0.0,
                    1.0
                );
                vec3 plainGravelColor = mix(colorLow.rgb * 0.76, colorHigh.rgb * 1.04, plainGravel);
                plainColor = mix(plainColor, plainGravelColor, 0.84 * clamp(rockDetailGain, 0.4, 1.8));

                vec3 slopeColor = mix(
                    mix(colorLow.rgb * 0.84, colorContour.rgb * 0.45, clamp(valleyContourMix, 0.0, 1.0)),
                    mix(colorHigh.rgb * 1.12, colorRidge.rgb, clamp(ridgeAccentMix, 0.0, 1.0)),
                    pow(terrainShape, 0.94)
                );
                float macroOcclusion = smoothstep(0.34, 0.78, macroShape) * (1.0 - smoothstep(0.18, 0.86, lit));
                slopeColor *= (1.0 - 0.12 * macroOcclusion);
                float macroLift = smoothstep(0.52, 0.94, macroRelief) * smoothstep(0.24, 0.96, lit);
                slopeColor = mix(slopeColor, slopeColor * 1.10, 0.13 * macroLift);
                vec3 rockTone = mix(colorLow.rgb * 1.06, colorRidge.rgb, 0.10 + 0.90 * strata);
                float rockMask = smoothstep(0.10, 0.88, slopeMetric);
                slopeColor = mix(slopeColor, rockTone, 0.54 * clamp(rockDetailGain, 0.4, 1.6) * rockMask);

                vec3 ridgeColorLayer = mix(colorHigh.rgb * 1.12, colorRidge.rgb, 0.84);
                ridgeColorLayer = mix(ridgeColorLayer, ridgeColorLayer * (0.90 + 0.24 * strataFine), 0.44);
                ridgeColorLayer = mix(ridgeColorLayer, colorSunWarm.rgb, 0.14 * smoothstep(0.36, 0.96, lambert));
                ridgeColorLayer = mix(ridgeColorLayer, colorShadowCool.rgb, 0.20 * smoothstep(0.20, 0.86, 1.0 - lambert));

                vec3 base = plainColor * plainLayerW + slopeColor * slopeLayerW + ridgeColorLayer * ridgeLayerW;
                float slopeBand = 0.5 + 0.5 * sin(
                    uv.x * 9.0 +
                    uv.y * 7.0 +
                    slopeMetric * 6.0 +
                    macroShape * 5.0
                );
                vec3 bandWarm = mix(colorHigh.rgb, colorRidge.rgb, 0.58);
                vec3 bandCool = mix(colorLow.rgb, colorShadowCool.rgb, 0.38);
                float bandMask = smoothstep(0.22, 0.88, slopeMetric) * (0.35 + 0.65 * macroRelief);
                base = mix(base, bandWarm, 0.12 * bandMask * smoothstep(0.46, 1.0, slopeBand));
                base = mix(base, bandCool, 0.10 * bandMask * smoothstep(0.46, 1.0, 1.0 - slopeBand));
                vec3 sunTone = mix(colorHigh.rgb, colorRidge.rgb, 0.72);
                float sunAccent = pow(lambert, 1.35) * smoothstep(0.42, 0.98, terrainShape) * (1.0 - 0.70 * skirtSuppress);
                base = mix(base, sunTone * 1.08, 0.26 * sunAccent);
                float shadowMask = (1.0 - lit) * smoothstep(0.12, 0.86, slopeMetric);
                float cavityMask = smoothstep(0.10, 0.80, slopeMetric) * (1.0 - lit);
                base = mix(base, base * 0.84, 0.20 * shadowMask);
                float shadowBrownMix = clamp(shadowBrownGain, 0.0, 1.0) * shadowMask;
                vec3 shadowBrownTone = mix(colorLow.rgb * 0.60, colorShadowCool.rgb * 0.70, 0.34);
                float shadowBrownLayer = mix(0.72, 1.18, smoothstep(0.14, 0.88, cavityMask));
                vec3 shadowBrownBlended = mix(base, shadowBrownTone, 0.30 * shadowBrownMix * shadowBrownLayer);
                float baseLuma = dot(base, vec3(0.299, 0.587, 0.114));
                float brownLuma = dot(shadowBrownBlended, vec3(0.299, 0.587, 0.114));
                float lumaGuard = clamp(baseLuma / max(0.001, brownLuma), 0.92, 1.10);
                base = clamp(shadowBrownBlended * lumaGuard, 0.0, 1.0);
                float warmMask = smoothstep(0.22, 0.94, lambert) * smoothstep(0.36, 0.98, terrainShape);
                float coolMask = smoothstep(0.08, 0.84, 1.0 - lambert) * smoothstep(0.22, 0.92, slopeMetric);
                float warmCoolGain = clamp(warmCoolStrength, 0.0, 1.0);
                base = mix(base, base * colorSunWarm.rgb, warmMask * (0.22 + 0.38 * warmCoolGain));
                base = mix(base, base * colorShadowCool.rgb, coolMask * (0.16 + 0.44 * warmCoolGain));
                vec3 eyeDir = normalize(materialInput.positionToEyeEC);
                float ndotv = clamp(dot(nBase, eyeDir), 0.0, 1.0);
                float ridgeRim = pow(1.0 - ndotv, 2.2) * smoothstep(0.42, 0.96, ridgeLayerW);
                base = mix(base, base * colorSunWarm.rgb, ridgeRim * clamp(ridgeRimGain, 0.0, 1.0) * 0.24);

                float reliefGain = mix(0.58, 1.76, lit);
                base *= mix(1.0, reliefGain, enableRelief);
                base *= (1.0 - 0.30 * cavityMask);
                float plainMask = plainLayerW;
                float plainBlend = 0.34 * clamp(plainBlendGain, 0.0, 1.3) * plainMask;
                float plainGrainGainClamped = clamp(plainGrainGain, 0.6, 1.8);
                float plainStructure = clamp(plainStructureGain, 0.7, 1.6);
                base = mix(base, plainColor, plainBlend);
                base = mix(
                    base,
                    base * (0.84 + 0.36 * plainGravel),
                    0.60 * plainMask * clamp(rockDetailGain, 0.4, 1.8) * plainStructure
                );
                float plainGrain = fbm(uv * 182.0 + vec2(plainGravel * 2.6, terrainShape * 3.4));
                float plainGrain2 = fbm(uv * 264.0 + vec2(plainToneField * 3.1, plainNoise * 2.7));
                float plainHiFreq = clamp(0.58 * plainGrain + 0.42 * plainGrain2, 0.0, 1.0);
                base = mix(
                    base,
                    base * (0.84 + 0.34 * plainHiFreq),
                    0.68 * plainLayerW * detailAliasingSuppress * plainGrainGainClamped * plainStructure
                );

                float contourShape = clamp(0.92 * terrainShape + 0.08 * slopeForShape, 0.0, 1.0);
                float pseudoElev = contourShape;
                float contourFreq = max(5.0, contourInterval * 0.082);
                float contourCoord = pseudoElev * contourFreq;
                float contourPhase = abs(fract(contourCoord) - 0.5);
                float contourHalfWidth = clamp(0.0022 * contourThickness, 0.0014, 0.008);
                float contourAA = clamp(fwidth(contourCoord) * 0.65, 0.0010, 0.012);
                float contour = 1.0 - smoothstep(contourHalfWidth, contourHalfWidth + contourAA, contourPhase);
                float contourSlopeMask = smoothstep(0.22, 0.58, slopeMetric);
                float contourDistanceMask = 1.0 - smoothstep(lodNear * 0.95, lodMid * 0.95, d);
                contour *= contourSlopeMask * contourDistanceMask;
                if (contour != contour) {
                    contour = 0.0;
                }

                float nearW = 1.0 - smoothstep(lodNear, lodMid, d);
                float midW = smoothstep(lodNear, lodMid, d) * (1.0 - smoothstep(lodMid, lodFar, d));
                float farW = smoothstep(lodMid, lodFar, d);
                float nearDetailGain = (1.0 - smoothstep(lodNear * 0.72, lodMid, d)) * detailAliasingSuppress;
                base = mix(base, base * (0.90 + 0.18 * strataFine), 0.20 * nearDetailGain * (0.45 + 0.55 * slopeLayerW));
                float rockyMicro = clamp(0.62 * microNoise + 0.38 * macroNoise, 0.0, 1.0);
                float rockyMicroGain = (0.10 + 0.30 * nearDetailGain + 0.07 * midW) * detailAliasingSuppress * (0.52 + 0.48 * slopeLayerW);
                rockyMicroGain *= (1.0 - 0.58 * farW);
                base = mix(base * 0.90, base * (0.84 + 0.36 * rockyMicro), rockyMicroGain);
                float ridgeDetail = smoothstep(0.46, 0.92, ridgeLayerW) * smoothstep(0.30, 0.86, curvatureMetric);
                base = mix(
                    base,
                    base * (0.92 + 0.16 * microNoise),
                    0.34 * ridgeDetail * detailAliasingSuppress * (1.0 - 0.50 * farW)
                );
                float ridgeEdge = clamp(
                    (length(dFdx(terrainShape)) + length(dFdy(terrainShape))) * 3.2,
                    0.0,
                    1.0
                );
                base = mix(
                    base,
                    base * (0.86 + 0.26 * ridgeEdge),
                    0.52 * ridgeDetail * detailAliasingSuppress
                );

                float macroGrid = 0.0;
                if (enableMacroGrid > 0.5) {
                    macroGrid = gridMask(uv, macroGridDensity, macroGridWidth);
                }
                float microGrid = 0.0;
                if (enableMicroGrid > 0.5) {
                    microGrid = gridMask(uv, microGridDensity, microGridWidth);
                }

                vec3 contourLineColor = mix(colorContour.rgb, colorRidge.rgb, 0.72);
                vec3 ridgeSunColor = mix(colorHigh.rgb, colorRidge.rgb, 0.84);
                float distanceRidgeBoost = smoothstep(lodNear * 0.82, lodMid * 0.92, d);
                float ridgeCrestMask = smoothstep(0.46, 0.92, terrainShape) * smoothstep(0.20, 0.90, slopeMetric);
                float ridgeSunMask = ridgeCrestMask * pow(smoothstep(0.18, 0.92, lambert), 0.92);
                float ridgeShadowMask = smoothstep(0.52, 0.96, terrainShape) * (1.0 - smoothstep(0.28, 0.72, lambert));
                float seamLightSuppress = clamp(seamLightingSuppress, 0.0, 1.0) * seamMask;
                ridgeSunMask *= (1.0 - 0.78 * seamLightSuppress);
                ridgeShadowMask *= (1.0 - 0.74 * seamLightSuppress);

                vec3 colorNear = base;
                colorNear = mix(colorNear, contourLineColor, contour * 0.16 * enableContour);
                colorNear = mix(colorNear, colorMicroGrid.rgb, microGrid * 0.55 * enableMicroGrid);

                vec3 colorMid = base;
                colorMid = mix(colorMid, contourLineColor, contour * 0.08 * enableContour);
                colorMid = mix(colorMid, colorMacroGrid.rgb, macroGrid * 0.52 * enableMacroGrid);

                vec3 colorFar = mix(base * 0.98, colorMacroGrid.rgb, macroGrid * 0.26 * enableMacroGrid);
                float ridgeSunSoft = 1.0 - 0.30 * smoothstep(0.74, 0.98, terrainShape);
                float midRidgeGain = (0.13 * midW + 0.19 * distanceRidgeBoost) * ridgeSunMask * ridgeSunSoft;
                float farRidgeGain = (0.30 * farW + 0.13 * distanceRidgeBoost) * ridgeSunMask * ridgeSunSoft;
                float ridgeSunFlow = 0.86 + 0.14 * microNoiseFar;
                colorMid = mix(colorMid, ridgeSunColor * ridgeSunFlow, clamp(midRidgeGain, 0.0, 0.48));
                colorFar = mix(colorFar, ridgeSunColor * ridgeSunFlow, clamp(farRidgeGain, 0.0, 0.56));
                float ridgeShadowGain = ridgeShadowMask * (0.10 * midW + 0.22 * farW + 0.06 * distanceRidgeBoost);
                colorMid *= (1.0 - 0.34 * ridgeShadowGain);
                colorFar *= (1.0 - 0.42 * ridgeShadowGain);

                vec3 finalColor = colorNear * nearW + colorMid * midW + colorFar * farW;
                finalColor = pow(clamp(finalColor, 0.0, 1.0), vec3(max(0.01, toneGamma)));
                float shapeBoost = clamp(0.28 + 0.72 * terrainShape + 0.34 * (lit - 0.40), 0.0, 1.0);
                float shadowFloor = clamp(toneShadowFloor, 0.5, 1.2);
                float highlightCeiling = max(shadowFloor, toneHighlightCeiling);
                finalColor = mix(finalColor * shadowFloor, finalColor * highlightCeiling, shapeBoost);
                float edgeMetricRaw = clamp(normalDerivStable * 8.0, 0.0, 1.0);
                float edgeMetric = edgeMetricRaw
                    * smoothstep(0.26, 0.88, slopeMetric)
                    * (0.22 + 0.78 * ridgeLayerW);
                finalColor = mix(
                    finalColor * 0.99,
                    finalColor * 1.05,
                    edgeMetric * 0.18 * clamp(edgeEnhanceGain, 0.0, 1.5)
                );
                float ridgeSharp = smoothstep(0.56, 0.96, terrainShape);
                finalColor = mix(
                    finalColor,
                    finalColor * (0.90 + 0.20 * strataFine),
                    0.16 * ridgeSharp * detailAliasingSuppress
                );
                float ridgeCrispMask = smoothstep(0.18, 0.88, ridgeLayerW)
                    * detailAliasingSuppress
                    * (1.0 - 0.45 * farW);
                float ridgeCrisp = (microNoise * 2.0 - 1.0) * 0.30 + ridgeEdge * 0.24;
                finalColor = mix(
                    finalColor,
                    clamp(finalColor * (1.0 + ridgeCrisp), 0.0, 1.0),
                    ridgeCrispMask
                );
                float plainCrispMask = smoothstep(0.24, 0.92, plainLayerW)
                    * (1.0 - 0.35 * farW);
                float plainCrispCoupling = clamp((plainGrainGainClamped - 0.6) / 1.2, 0.0, 1.0);
                float plainCrispGainClamped = clamp(plainCrispGain, 0.6, 2.6) * mix(0.92, 1.12, plainCrispCoupling);
                float plainCrispBoost = smoothstep(1.05, 2.6, plainCrispGainClamped);
                float plainDetailMask = mix(
                    detailAliasingSuppress,
                    max(detailAliasingSuppress, 0.55),
                    plainCrispBoost
                );
                plainCrispMask *= max(0.62, plainDetailMask);
                float plainCrisp = (plainGrain * 2.0 - 1.0) * (0.33 * plainCrispGainClamped);
                finalColor = mix(
                    finalColor,
                    clamp(finalColor * (1.0 + plainCrisp), 0.0, 1.0),
                    plainCrispMask
                );
                // Plain 区域采用双向微对比，避免“只提亮不提暗”导致软泥观感。
                float plainHi = fbm(uv * 236.0 + vec2(plainGrain * 2.3, macroRelief * 2.1));
                float plainBi = plainHi * 2.0 - 1.0;
                finalColor = clamp(
                    finalColor + vec3(plainBi * 0.086 * plainCrispMask * plainCrispGainClamped * (1.0 + 0.25 * plainCrispBoost)),
                    0.0,
                    1.0
                );
                float plainPuddleMask = smoothstep(0.34, 0.98, plainLayerW)
                    * (1.0 - smoothstep(0.12, 0.44, normalDerivStable))
                    * (1.0 - smoothstep(0.34, 0.78, plainGravel))
                    * (1.0 - 0.35 * farW);
                float plainMacroBreak = fbm(uv * 5.8 + vec2(macroRelief * 2.1, slopeDeriv * 7.2));
                float plainMacroBi = plainMacroBreak * 2.0 - 1.0;
                float plainFracture = fbm(uv * 46.0 + vec2(plainMacroBreak * 2.9, plainGravel * 3.1));
                float plainFractureBi = plainFracture * 2.0 - 1.0;
                vec3 plainDryTone = mix(colorLow.rgb * 0.92, colorShadowCool.rgb * 1.00, 0.48);
                vec3 plainDustTone = mix(colorHigh.rgb * 1.04, colorSunWarm.rgb * 0.96, 0.54);
                vec3 plainBreakTone = mix(plainDryTone, plainDustTone, plainMacroBreak);
                float plainMudBreak = clamp(plainMudBreakGain, 0.0, 1.0);
                float plainTintSplit = clamp(plainTintSplitGain, 0.0, 1.0);
                float plainMicroRelief = clamp(plainMicroReliefGain, 0.0, 1.0);
                float plainMudMask = clamp(
                    plainPuddleMask + 0.22 * smoothstep(0.30, 0.98, plainLayerW) * plainMudBreak,
                    0.0,
                    1.0
                );
                finalColor = mix(finalColor, plainBreakTone, 0.16 * plainMudMask * plainMudBreak);
                vec3 plainTintA = vec3(finalColor.r * 1.04, finalColor.g * 0.98, finalColor.b * 0.92);
                vec3 plainTintB = vec3(finalColor.r * 0.92, finalColor.g * 1.02, finalColor.b * 1.06);
                finalColor = mix(finalColor, mix(plainTintA, plainTintB, plainMacroBreak), 0.18 * plainMudMask * plainTintSplit);
                // 在 plain 区域引入轻量双色分叉，提升色彩离散并压低棕色单域占比。
                float plainToneSplitMask = plainMudMask * plainTintSplit * (0.62 + 0.38 * plainMacroBreak);
                vec3 plainSatWarm = vec3(finalColor.r * 1.05, finalColor.g * 1.00, finalColor.b * 0.95);
                vec3 plainSatCool = vec3(finalColor.r * 0.94, finalColor.g * 1.01, finalColor.b * 1.06);
                finalColor = mix(
                    finalColor,
                    mix(plainSatCool, plainSatWarm, plainFracture),
                    0.14 * plainToneSplitMask
                );
                float plainDebrownMask = plainToneSplitMask * smoothstep(0.58, 0.96, plainFracture);
                vec3 plainDebrownTone = vec3(finalColor.r * 0.94, finalColor.g * 1.00, finalColor.b * 1.08);
                finalColor = mix(finalColor, plainDebrownTone, 0.08 * plainDebrownMask);
                float plainRipple = sin(uv.x * 146.0 + uv.y * 81.0 + plainMacroBreak * 8.0);
                float plainRipple2 = sin(uv.x * 92.0 - uv.y * 126.0 + plainFracture * 6.0);
                float plainRippleBi = 0.5 * plainRipple + 0.5 * plainRipple2;
                finalColor = clamp(
                        finalColor
                        + vec3(plainMacroBi * 0.040 * plainMudMask * plainMicroRelief)
                        + vec3(plainFractureBi * 0.040 * plainMudMask * plainMicroRelief)
                        + vec3(plainRippleBi * 0.028 * plainMudMask * plainMicroRelief),
                    0.0,
                    1.0
                );
                float farAtmos = smoothstep(atmosphereFarStart, atmosphereFarEnd, d);
                float hazeStrength = clamp(atmosphereStrength, 0.0, 1.0);
                float hazeMask = farAtmos * hazeStrength;
                float hazeTerrainMask = mix(1.0, 0.72, smoothstep(0.52, 0.96, terrainShape));
                float farWarmCool = farAtmos * clamp(warmCoolStrength, 0.0, 1.0);
                float farSunMask = smoothstep(0.18, 0.92, lambert) * smoothstep(0.44, 0.98, terrainShape);
                float farShadowMask = smoothstep(0.12, 0.88, 1.0 - lambert) * smoothstep(0.28, 0.94, slopeMetric);
                finalColor = mix(finalColor, finalColor * colorSunWarm.rgb, farSunMask * 0.16 * farWarmCool);
                finalColor = mix(finalColor, finalColor * colorShadowCool.rgb, farShadowMask * 0.24 * farWarmCool);
                // 远景空气透视：降低饱和度并叠加暖灰雾色，增强空间层次分离。
                float gray = dot(finalColor, vec3(0.299, 0.587, 0.114));
                float desat = clamp(atmosphereDesaturate, 0.0, 1.0) * farAtmos;
                finalColor = mix(finalColor, vec3(gray), desat);
                float hazeSlopeBias = 0.82 + 0.18 * (1.0 - smoothstep(0.62, 0.98, slopeMetric));
                float farHazeBand = mix(0.76, 1.18, fbm(uv * 2.2 + vec2(0.0, 3.3)));
                float farDepthGradient = smoothstep(lodMid * 0.72, lodFar * 1.06, d);
                float farHeightFade = 1.0 - smoothstep(0.52, 0.98, terrainShape);
                float atmosphereLayer = hazeMask * hazeSlopeBias * (0.70 + 0.30 * farDepthGradient);
                atmosphereLayer *= hazeTerrainMask;
                atmosphereLayer *= mix(0.86, 1.12, farHeightFade) * farHazeBand;
                finalColor = mix(finalColor, atmosphereHazeColor.rgb, atmosphereLayer);
                vec3 viewDir = normalize(materialInput.positionToEyeEC);
                float horizonView = clamp(1.0 - abs(dot(viewDir, nBase)), 0.0, 1.0);
                float horizonDist = smoothstep(horizonFarStart, horizonFarEnd, d);
                float horizonMask = pow(horizonView, 1.25) * horizonDist * clamp(horizonStrength, 0.0, 1.0);
                vec3 horizonTint = mix(
                    horizonCoolColor.rgb,
                    horizonWarmColor.rgb,
                    smoothstep(0.12, 0.92, lambert)
                );
                finalColor = mix(finalColor, horizonTint, horizonMask);
                finalColor = mix(finalColor, finalColor * 1.06, horizonMask * 0.22);
                float farReliefMask = farAtmos * smoothstep(0.22, 0.90, slopeMetric);
                float farRidgeRelief = smoothstep(0.44, 0.96, terrainShape);
                finalColor = mix(
                    finalColor * (1.0 - 0.07 * farReliefMask * (1.0 - lambert)),
                    finalColor * (1.0 + 0.08 * farReliefMask * farRidgeRelief),
                    0.5 + 0.5 * farRidgeRelief
                );
                float skirtGuard = clamp(skirtSuppressStrength, 0.0, 1.0) * skirtLikely;
                finalColor = mix(finalColor, mix(colorLow.rgb * 0.90, base * 0.90, 0.35), 0.88 * skirtGuard);
                float seamFlatten = clamp(seamFlattenStrength, 0.0, 1.0) * seamLikely;
                vec3 seamColor = mix(colorLow.rgb * 0.92, base * 0.88, 0.42);
                finalColor = mix(finalColor, seamColor, seamFlatten);
                float seamBand = smoothstep(0.10, 0.78, seamMask) * clamp(seamBandStrength, 0.0, 1.0);
                float seamBandNoise = fbm(uv * 42.0 + vec2(11.2, 7.4));
                float seamBandBreak = mix(0.76, 1.18, seamBandNoise);
                float seamBandMask = clamp(seamBand * seamBandBreak, 0.0, 1.0);
                vec3 seamBandColor = mix(
                    colorLow.rgb * 0.94,
                    colorHigh.rgb * 0.86,
                    fbm(uv * 7.8 + vec2(2.6, 9.1)) * 0.40
                );
                finalColor = mix(finalColor, seamBandColor, 0.58 * seamBandMask);
                finalColor = mix(finalColor, base * 0.92, 0.36 * seamBandMask);
                float seamMatte = clamp(seamMatteStrength, 0.0, 1.0) * smoothstep(0.18, 0.90, seamMask);
                vec3 seamMatteColor = mix(colorLow.rgb * 0.92, colorHigh.rgb * 0.82, 0.28 + 0.24 * fbm(uv * 5.4 + vec2(4.7, 1.3)));
                finalColor = mix(finalColor, seamMatteColor, 0.72 * seamMatte);
                float seamLuma = dot(finalColor, vec3(0.299, 0.587, 0.114));
                finalColor = mix(finalColor, vec3(seamLuma), 0.18 * seamMatte);
                finalColor = mix(finalColor, clamp(finalColor * 0.96, 0.0, 1.0), 0.28 * seamMatte);
                float olive = clamp(oliveBias, 0.0, 0.6);
                vec3 oliveGrade = vec3(
                    finalColor.r * 0.84 + finalColor.g * 0.09,
                    finalColor.g * 1.05,
                    finalColor.b * 0.90 + finalColor.g * 0.03
                );
                finalColor = mix(finalColor, oliveGrade, olive);
                float matchDesat = clamp(colorMatchDesat, 0.0, 0.8);
                float matchBalance = clamp(colorMatchBalance, 0.0, 0.8);
                float matchGray = dot(finalColor, vec3(0.299, 0.587, 0.114));
                finalColor = mix(finalColor, vec3(matchGray), matchDesat);
                vec3 matchBalanced = vec3(
                    finalColor.r * (1.0 - 0.14 * matchBalance) + finalColor.g * (0.03 * matchBalance),
                    finalColor.g * (1.0 + 0.09 * matchBalance),
                    finalColor.b * (1.0 - 0.08 * matchBalance)
                );
                finalColor = mix(finalColor, matchBalanced, matchBalance);
                float hueShiftRad = radians(clamp(hueShiftDeg, -45.0, 45.0));
                float satScale = clamp(saturationScale, 0.50, 1.20);
                finalColor = hueRotateYiq(finalColor, hueShiftRad, satScale);
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
