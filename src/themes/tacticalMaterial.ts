import { Color } from 'cesium';

export interface TacticalMaterialOptions {
    lodNear: number;
    lodMid: number;
    lodFar: number;
    colorLow: string;
    colorHigh: string;
    colorRidge: string;
    toneGamma?: number;
    toneShadowFloor?: number;
    minLighting?: number;
    atmosphereHazeColor?: string;
    atmosphereFarStart?: number;
    atmosphereFarEnd?: number;
    atmosphereStrength?: number;
    enableRelief?: boolean;
    redFlagSlopeStart?: number;
    redFlagSlopeEnd?: number;
    redFlagHardBand?: number;
    redFlagWarmBias?: number;
    redFlagLutIntensity?: number;
    redFlagLayerStage?: number;
}

export function getTacticalMaterialFabric(options: TacticalMaterialOptions) {
    return {
        type: 'TacticalTerrain',
        uniforms: {
            colorLow: Color.fromCssColorString(options.colorLow),
            colorHigh: Color.fromCssColorString(options.colorHigh),
            colorRidge: Color.fromCssColorString(options.colorRidge),
            toneGamma: options.toneGamma ?? 1.0,
            toneShadowFloor: options.toneShadowFloor ?? 0.22,
            minLighting: options.minLighting ?? 0.08,
            atmosphereHazeColor: Color.fromCssColorString(options.atmosphereHazeColor ?? '#000000'),
            atmosphereFarStart: options.atmosphereFarStart ?? 22000.0,
            atmosphereFarEnd: options.atmosphereFarEnd ?? 100000.0,
            atmosphereStrength: options.atmosphereStrength ?? 0.28,
            enableRelief: options.enableRelief === false ? 0.0 : 1.0,
            redFlagSlopeStart: options.redFlagSlopeStart ?? 0.10,
            redFlagSlopeEnd: options.redFlagSlopeEnd ?? 0.84,
            redFlagHardBand: options.redFlagHardBand ?? 0.88,
            redFlagWarmBias: options.redFlagWarmBias ?? 0.36,
            redFlagLayerStage: options.redFlagLayerStage ?? 4.0,
            lodNear: options.lodNear,
            lodMid: options.lodMid,
            lodFar: options.lodFar
        },
        source: `
            uniform vec4 colorLow;
            uniform vec4 colorHigh;
            uniform vec4 colorRidge;
            uniform float toneGamma;
            uniform float toneShadowFloor;
            uniform float minLighting;
            uniform vec4 atmosphereHazeColor;
            uniform float atmosphereFarStart;
            uniform float atmosphereFarEnd;
            uniform float atmosphereStrength;
            uniform float enableRelief;
            uniform float redFlagSlopeStart;
            uniform float redFlagSlopeEnd;
            uniform float redFlagHardBand;
            uniform float redFlagWarmBias;
            uniform float redFlagLayerStage;

            czm_material czm_getMaterial(czm_materialInput materialInput)
            {
                czm_material material = czm_getDefaultMaterial(materialInput);

                float nLen = length(materialInput.normalEC);
                vec3 nBase = nLen > 0.0001 ? materialInput.normalEC / nLen : vec3(0.0, 0.0, 1.0);
                vec3 dxPos = dFdx(materialInput.positionToEyeEC);
                vec3 dyPos = dFdy(materialInput.positionToEyeEC);
                vec3 nGeomRaw = cross(dxPos, dyPos);
                float nGeomLen = length(nGeomRaw);
                vec3 nGeom = nGeomLen > 0.0001 ? normalize(nGeomRaw) : nBase;
                // 固定战术主光（相机坐标系），彻底去掉太阳方向导致的逆光问题。
                vec3 lightDir = normalize(vec3(0.28, 0.22, 0.93));
                float nDotLRaw = dot(nBase, lightDir);
                float nDotL = max(nDotLRaw, 0.0);
                float layerStage = clamp(redFlagLayerStage, 0.0, 4.0);
                float layerMacroRelief = step(0.5, layerStage);
                float layerCrestValley = step(1.5, layerStage);
                float layerNearMidFar = step(2.5, layerStage);
                float layerLightingSplit = step(3.5, layerStage);
                // Layer-1 仅在 stage ∈ [1,2) 生效；stage=0 时必须彻底隔离。
                float layer1Mode = step(0.5, layerStage) * (1.0 - step(1.5, layerStage));
                // 重构策略：先计算稳定的大形体，再叠加脊线/谷线特征。
                float slopeGeomBlend = mix(0.04, 0.72, layerMacroRelief);
                vec3 nSlope = normalize(mix(nBase, nGeom, slopeGeomBlend));
                float slopeMetric = clamp(1.0 - abs(nSlope.z), 0.0, 1.0);
                float slopeAA = clamp(fwidth(slopeMetric) * 3.0, 0.0, 0.20);
                slopeMetric = clamp(slopeMetric - slopeAA * 0.25, 0.0, 1.0);
                float slopeStart = clamp(redFlagSlopeStart, 0.02, 0.88);
                float slopeEnd = clamp(redFlagSlopeEnd, slopeStart + 0.04, 0.98);
                float slopeBand = smoothstep(slopeStart, slopeEnd, slopeMetric);
                float flatMask = 1.0 - smoothstep(slopeStart * 0.75, slopeStart + 0.06, slopeMetric);
                // 山体主遮罩：用于把“平地去光照”和“山体方向光”解耦。
                float mountainMask = smoothstep(slopeStart + 0.03, slopeStart + 0.24, slopeMetric);

                float hardBand = clamp(redFlagHardBand, 0.0, 1.0);
                float slopeCurve = pow(clamp(slopeBand, 0.0, 1.0), mix(0.92, 0.74, hardBand));
                slopeBand = mix(slopeBand, slopeCurve, 0.55);
                slopeBand = smoothstep(0.06, 0.94, slopeBand);
                // Layer-1 专用：提高峰谷分离，避免整体灰闷。
                float layer1Curve = smoothstep(0.03, 0.97, pow(clamp(slopeBand, 0.0, 1.0), 0.62));
                slopeBand = mix(slopeBand, layer1Curve, 0.62 * layer1Mode);
                float macroColorFactor = mix(0.04, 1.0, layerMacroRelief);
                slopeBand = mix(0.50, slopeBand, macroColorFactor);
                float flatHardMask = 1.0 - smoothstep(0.24, 0.40, slopeMetric);

                vec3 layer1Low = mix(colorLow.rgb, vec3(0.30, 0.20, 0.10), 0.35);
                vec3 layer1High = mix(colorHigh.rgb, vec3(0.92, 0.74, 0.46), 0.45);
                vec3 lowColor = mix(colorLow.rgb, layer1Low, layer1Mode);
                vec3 highColor = mix(colorHigh.rgb, layer1High, layer1Mode);
                vec3 base = mix(lowColor, highColor, slopeBand);
                // Layer-1：整体亮度抬升，优先拉中间调，避免只提高光导致白膜。
                base = mix(base, highColor, (0.10 + 0.08 * slopeBand) * layer1Mode);
                float ridgeMask = smoothstep(0.46, 0.98, slopeBand);
                ridgeMask = pow(ridgeMask, 0.66);
                base = mix(base, colorRidge.rgb, ridgeMask * 0.46 * layerCrestValley);

                float slopeGrad = length(vec2(dFdx(slopeMetric), dFdy(slopeMetric)));
                float flatRippleMask = flatMask * smoothstep(0.006, 0.040, slopeGrad) * layerMacroRelief;
                float seamSignalRaw = max(length(dFdx(nGeom)), length(dFdy(nGeom)));
                float seamSignal = mix(seamSignalRaw * 1.20, seamSignalRaw, layerMacroRelief);
                // 接缝信号抑制：降低中高层对 dFdx/dFdy seam 信号的直接响应，避免“伪网格线”。
                float seamMask = smoothstep(0.016, 0.10, seamSignal) * (0.42 + 0.52 * flatMask);
                slopeBand = mix(slopeBand, 0.50, flatRippleMask * 0.82);
                // Layer-1 起启用基础脊线/谷线，Layer-2+ 再增强，保证“山体先立起来”。
                float ridgeCrestCore = smoothstep(0.004, 0.032, slopeGrad) * smoothstep(0.44, 0.95, slopeBand) * (1.0 - flatMask);
                float valleyCore = smoothstep(0.004, 0.030, slopeGrad) * smoothstep(0.08, 0.70, 1.0 - slopeBand);
                float ridgeCrest = ridgeCrestCore * (0.52 * layer1Mode + layerCrestValley);
                float valleyMask = valleyCore * (0.46 * layer1Mode + layerCrestValley);

                // 暖色平衡：0 偏赭黄，1 偏红棕。
                float warmBias = clamp(redFlagWarmBias, 0.0, 1.0);
                vec3 ochreBase = vec3(base.r * 0.92 + base.g * 0.08, base.g, max(base.b, base.g * 0.34));
                vec3 redBase = vec3(base.r, base.r * 0.56, base.r * 0.26);
                base = mix(ochreBase, redBase, warmBias * (0.35 + slopeBand * 0.45));

                // Layer-0 稳定化：平坦区优先使用几何法线，降低法线纹波和瓦片接缝闪烁。
                float flatNormalBlend = clamp(flatMask * 0.92 + flatHardMask * 0.80 + seamMask * 0.72 + flatRippleMask * 0.92 * layer1Mode, 0.0, 0.995);
                vec3 nStabilized = normalize(mix(nBase, nGeom, flatNormalBlend));
                vec3 nShade = normalize(mix(nStabilized, vec3(0.0, 0.0, 1.0), clamp(flatMask * 0.50 + flatRippleMask * 0.65 * layer1Mode, 0.0, 0.90)));
                float nDotLShade = max(dot(nShade, lightDir), 0.0);
                float litTier = smoothstep(0.02, 0.95, nDotLShade);
                litTier = pow(litTier, 0.92);
                // 战术模式固定亮度：去除太阳方向主导，改为坡度主导，避免逆光/夜景不可读。
                float terrainLight = mix(0.56, 0.98, smoothstep(0.06, 0.90, slopeBand));
                litTier = terrainLight;
                // 平坦区稳定化：抑制波纹，同时保留山地响应。
                litTier = mix(
                    litTier,
                    mix(0.80, 0.87, layer1Mode),
                    clamp(flatMask * 0.96 + flatHardMask * 0.70 + seamMask * 0.58 + flatRippleMask * 0.74, 0.0, 1.0)
                );
                float shadowFloor = clamp(toneShadowFloor, 0.08, 0.85);
                float shadeFloor = max(shadowFloor, clamp(minLighting, 0.0, 0.85));
                float shade = mix(shadeFloor, 1.0, litTier);
                shade = mix(shade, pow(clamp(shade, 0.0, 1.0), 0.84), 0.50 * layer1Mode);
                // 光影只作用于“高峰区域”：平地和中坡保持稳定底色，不参与光照明暗。
                float peakLightMask = smoothstep(0.62, 0.92, slopeBand) * (1.0 - flatMask);
                shade = mix(1.0, shade, peakLightMask);
                float reliefAmount = enableRelief * 0.92 * layerMacroRelief;
                vec3 finalColor = mix(base, base * shade, reliefAmount);
                finalColor *= mix(0.94, mix(0.86, 1.28, slopeBand), layerMacroRelief);
                finalColor *= mix(1.0, mix(1.16, 1.09, flatMask), layer1Mode);
                finalColor += colorRidge.rgb * (ridgeMask * 0.10 + ridgeCrest * 0.48) * mountainMask;
                finalColor *= mix(1.0, 0.76, valleyMask * 0.40);
                // Layer-1 对比增强：拉开坡面明暗跨度，提升山脊边缘和层次。
                float layer1ContrastBoost = (0.12 + 0.10 * smoothstep(0.40, 0.95, slopeBand)) * layer1Mode;
                finalColor = mix(finalColor * (1.0 - layer1ContrastBoost), finalColor * (1.0 + layer1ContrastBoost), slopeBand);
                // Layer-2 山体提边：只增强非平地区域，恢复 ridge/plain edge，不影响地面平稳。
                float layer2ReliefBoost = layerCrestValley * (1.0 - flatMask) * smoothstep(0.28, 0.96, slopeBand);
                finalColor = mix(finalColor, finalColor * 1.24 + colorRidge.rgb * 0.08, layer2ReliefBoost * 0.44);
                // Layer-2 边缘分离：脊线提亮 + 谷线压暗，直接提升 edge 类指标。
                float edgeRelief = smoothstep(0.010, 0.070, slopeGrad) * (1.0 - flatMask) * layerCrestValley;
                float ridgeEdge = edgeRelief * smoothstep(0.42, 0.96, slopeBand);
                float valleyEdge = edgeRelief * smoothstep(0.10, 0.62, 1.0 - slopeBand);
                finalColor += colorRidge.rgb * ridgeEdge * 0.42 * mountainMask;
                finalColor *= 1.0 - valleyEdge * 0.46;
                float slopeBandGrad = abs(dFdx(slopeBand)) + abs(dFdy(slopeBand));
                float ridgeTransition = smoothstep(0.03, 0.16, slopeBandGrad) * smoothstep(0.44, 0.96, slopeBand) * (1.0 - flatMask) * layerCrestValley;
                float valleyTransition = smoothstep(0.03, 0.18, slopeBandGrad) * smoothstep(0.12, 0.70, 1.0 - slopeBand) * (1.0 - flatMask) * layerCrestValley;
                finalColor += colorRidge.rgb * ridgeTransition * 0.32 * mountainMask;
                finalColor *= 1.0 - valleyTransition * 0.30;
                // Layer-2 整体提亮，避免通过边缘增强后整体过暗。
                finalColor = mix(finalColor, finalColor * 1.10 + vec3(0.015, 0.012, 0.008), 0.75 * layerCrestValley);
                finalColor *= mix(1.0, 1.04, layerCrestValley);

                // 平坦区回退底色：保持干净、稳定、不抖动。
                vec3 flatReferenceTone = vec3(0.54, 0.34, 0.19);
                vec3 flatDynamicTone = mix(colorLow.rgb, colorHigh.rgb, 0.52);
                vec3 flatTone = mix(flatDynamicTone, flatReferenceTone, 0.88) * mix(1.04, 1.01, layer1Mode);
                // 超低频双色分布：补充红棕区，不引入由地形细节触发的高频波纹。
                vec3 flatRedTone = vec3(0.56, 0.30, 0.20);
                vec3 flatOchreTone = vec3(0.50, 0.34, 0.22);
                // 禁止使用相机空间坐标生成颜色场（会导致转动相机时“逆光/明暗跳变”）。
                // 这里改为常量低频场，确保角度变化不引入伪光照。
                float flatField = 0.5;
                float flatHueMix = smoothstep(0.28, 0.78, flatField) * (0.22 + 0.20 * flatHardMask);
                flatTone = mix(flatTone, mix(flatOchreTone, flatRedTone, flatHueMix), 0.30);
                // Layer-3 平地低频场：引入大尺度明度变化，提升 lowfreq_ratio 且不引入高频噪声。
                vec3 flatWideToneA = vec3(0.50, 0.40, 0.31);
                vec3 flatWideToneB = vec3(0.62, 0.49, 0.36);
                float layer3PlainField = layerNearMidFar * (0.32 + 0.24 * flatHardMask);
                flatTone = mix(flatTone, mix(flatWideToneA, flatWideToneB, flatField), layer3PlainField * 0.42);
                flatTone = mix(flatTone, flatReferenceTone, 0.16);
                flatTone = vec3(flatTone.r * 1.06, flatTone.g * 0.90, flatTone.b * 0.82 + 0.002);
                float flatStabilize = clamp(
                    flatMask * mix(0.95, 0.98, layer1Mode) + flatHardMask * 0.56 + seamMask * 0.72 + flatRippleMask * 0.64,
                    0.0,
                    1.0
                );
                float stabilityGate = mix(1.0, mix(0.18, 0.30, layerNearMidFar), layerCrestValley);
                flatStabilize *= stabilityGate;
                // 高层(stage3/4)减少平地回退对山脚的外溢，避免整体发灰不通透。
                float flatStageAttenuation = mix(1.0, 0.52, layerNearMidFar);
                flatStabilize *= flatStageAttenuation;
                finalColor = mix(finalColor, flatTone, flatStabilize);
                // 地面去光照：平坦区直接回退到稳定底色，避免“水波纹式”明暗闪烁。
                float flatNoLightMask = clamp(flatMask * 1.08 + flatHardMask * 0.92 + seamMask * 0.86 + flatRippleMask * 0.82, 0.0, 1.0);
                flatNoLightMask *= stabilityGate;
                flatNoLightMask *= flatStageAttenuation;
                finalColor = mix(finalColor, flatTone, flatNoLightMask);
                float layer0Only = 1.0 - layerMacroRelief;
                // 瓦片/LOD 接缝抑制：在 seam 周边直接压到稳定底色。
                float seamDamp = smoothstep(0.28, 0.82, seamMask);
                float seamDampStrength = mix(0.72, 0.96, layer0Only);
                finalColor = mix(finalColor, flatTone, seamDamp * seamDampStrength);
                // 平地量化稳定：抑制细微高频抖动，保持复古战术风格的干净平面。
                // 量化仅在 Layer0/1 明显生效，Layer2+ 逐步退出，减少等值线网格感。
                // Layer-0 禁用量化，避免引入轴向条纹/伪网格线。
                float quantGate = clamp(layerMacroRelief * (1.0 - layerCrestValley), 0.0, 1.0);
                float flatQuantLevels = mix(48.0, mix(26.0, 18.0, layer0Only), quantGate);
                vec3 flatQuantized = floor(clamp(finalColor, 0.0, 1.0) * flatQuantLevels) / flatQuantLevels;
                finalColor = mix(finalColor, flatQuantized, clamp((flatNoLightMask * 0.90 + seamDamp * 0.72) * quantGate, 0.0, 1.0));
                // 仅 Layer-0 生效：进一步压制平地残余亮度波纹，确保基础层可稳定通过。
                float broadFlatMask = 1.0 - smoothstep(slopeStart * 0.95, slopeStart + 0.14, slopeMetric);
                float layer0FlatClamp = clamp(
                    flatMask * 0.88 + flatHardMask * 0.72 + broadFlatMask * 0.55 + seamDamp * 0.42,
                    0.0,
                    1.0
                ) * layer0Only;
                finalColor = mix(finalColor, flatTone, layer0FlatClamp);
                // Layer-0 ROI 定向稳定：对“低坡度 + 低梯度”的平地区域再做一次轻钳制，
                // 仅用于压低 wide 视角下 flat ROI 的高频残留。
                float flatRoiMask = (1.0 - smoothstep(0.16, 0.26, slopeMetric)) * (1.0 - smoothstep(0.010, 0.026, slopeGrad));
                float layer0RoiClamp = flatRoiMask * (0.22 + 0.26 * flatMask) * layer0Only;
                finalColor = mix(finalColor, flatTone, clamp(layer0RoiClamp, 0.0, 1.0));
                // Layer-0 硬规则：地面不受光照影响，直接回退稳定底色。
                float layer0GroundMask = clamp(broadFlatMask * 0.96 + flatMask * 0.92 + flatHardMask * 0.72, 0.0, 1.0) * layer0Only;
                finalColor = mix(finalColor, flatTone, layer0GroundMask);
                // Layer-0 地面目标色锚定（RedFlag_4k_style.jpg 平地区均值色）。
                vec3 layer0TargetGround = vec3(0.613, 0.400, 0.233);
                float layer0TargetMask = clamp(layer0GroundMask * 1.08 + broadFlatMask * 0.36 * layer0Only, 0.0, 1.0);
                finalColor = mix(finalColor, layer0TargetGround, layer0TargetMask * 0.92);
                // Layer-0 亮度跨度约束：专门压缩平地反光导致的 p10-p90 跨度。
                vec3 layer0SpanTone = mix(flatTone, vec3(0.63, 0.40, 0.24), 0.52);
                float layer0SpanMask = clamp(broadFlatMask * 0.82 + flatMask * 0.55 + seamMask * 0.35, 0.0, 1.0) * layer0Only;
                finalColor = mix(finalColor, layer0SpanTone, layer0SpanMask * 0.36);
                // Layer-0 去轴向伪网格：引入极低幅、非轴向扰动，打散 FFT 轴向能量峰。
                float axisBreak = 0.0;
                float axisBreakMask = clamp((broadFlatMask * 0.62 + seamMask * 0.40) * layer0Only, 0.0, 1.0);
                finalColor += vec3(axisBreak * 0.010) * axisBreakMask;
                // Layer-1 平地稳态：避免山体增强时平地区再出现波纹回潮。
                float layer1FlatClamp = flatRoiMask * (0.22 + 0.20 * flatMask) * layer1Mode;
                finalColor = mix(finalColor, flatTone, clamp(layer1FlatClamp, 0.0, 1.0));
                // Layer2+ 轻度平地回退：只压 seam 轮廓，不抹掉山体细节。
                float layer2FlatClamp = flatRoiMask * seamDamp * 0.005 * layerCrestValley;
                finalColor = mix(finalColor, flatTone, clamp(layer2FlatClamp, 0.0, 1.0));
                // Layer-3 远近层次：平地进一步低频化，抑制残余细碎纹路。
                float layer3FlatBlend = flatRoiMask * layerNearMidFar * 0.54;
                finalColor = mix(finalColor, mix(finalColor, flatTone, 0.88), clamp(layer3FlatBlend, 0.0, 1.0));
                float layer3PlainStabilize = clamp(flatMask * 0.56 + flatRoiMask * 0.44 + seamDamp * 0.18, 0.0, 1.0) * layerNearMidFar;
                finalColor = mix(finalColor, flatTone, layer3PlainStabilize * 0.18);
                // Layer-3 广义平地降高频：覆盖低坡度区域，专门提升 mudpit 低频占比。
                float layer3BroadPlain = broadFlatMask * layerNearMidFar;
                finalColor = mix(finalColor, flatTone, layer3BroadPlain * 0.52);
                // Layer-3 对比拉伸：主攻非平地，避免画面发闷。
                float layer3Contrast = layerNearMidFar * (0.30 + 0.62 * (1.0 - flatMask));
                finalColor = clamp((finalColor - 0.5) * (1.0 + layer3Contrast) + 0.5, 0.0, 1.0);
                float layer3MountainContrast = (1.0 - broadFlatMask) * layerNearMidFar;
                finalColor = mix(finalColor * 0.86, finalColor * 1.24, layer3MountainContrast * 0.62);
                float layer3Lift = layerNearMidFar * 0.10;
                finalColor = clamp(finalColor + vec3(layer3Lift), 0.0, 1.0);
                float layer3RidgeBoost = layerNearMidFar * smoothstep(0.34, 0.96, slopeBand) * (1.0 - flatMask) * mountainMask;
                float layer3ValleyBoost = layerNearMidFar * smoothstep(0.10, 0.62, 1.0 - slopeBand) * (1.0 - flatMask) * mountainMask;
                finalColor += colorRidge.rgb * layer3RidgeBoost * 0.12;
                finalColor *= 1.0 - layer3ValleyBoost * 0.11;

                // 山体方向光独立控制：平地不参与，防止旋转机位后地面反光/发灰。
                float mountainLightMask = mountainMask * clamp(layerMacroRelief * 0.68 + layerCrestValley * 0.32, 0.0, 1.0);
                finalColor *= mix(1.0, 1.0, mountainLightMask);

                // 山峰光照分离（RedFlag 风格）：正光/背光/轮廓光分开控制。
                float peakMask = clamp(ridgeMask * (1.0 - flatMask), 0.0, 1.0);
                float frontPeak = 0.0;
                float backPeak = 0.0;
                float rim = 0.0;
                finalColor += colorRidge.rgb * frontPeak * 0.07 * layerLightingSplit;
                finalColor = mix(finalColor, finalColor * 0.72 + colorLow.rgb * 0.22, backPeak * 0.42 * layerLightingSplit);
                finalColor += colorRidge.rgb * rim * 0.04 * layerLightingSplit;

                finalColor = pow(clamp(finalColor, 0.0, 1.0), vec3(max(0.01, toneGamma)));
                // 软压高光，避免白天刺眼。
                vec3 softKnee = finalColor / (finalColor + vec3(0.82));
                finalColor = mix(finalColor, softKnee, 0.22);
                // 高光上限保护：避免白化，限制在赭黄带内。
                vec3 maxCapStage = mix(vec3(0.66, 0.48, 0.29), vec3(0.74, 0.56, 0.35), layerNearMidFar);
                vec3 maxCap = mix(maxCapStage, vec3(0.76, 0.58, 0.37), layer1Mode);
                // 阴影下限抬升，保证夜间地形可辨识，不会整片发黑。
                vec3 minCapStage = mix(vec3(0.10, 0.06, 0.03), vec3(0.09, 0.05, 0.03), layerNearMidFar);
                vec3 minCap = mix(minCapStage, vec3(0.09, 0.05, 0.03), layer1Mode);
                finalColor = min(finalColor, maxCap);
                finalColor = max(finalColor, minCap);

                // 角度无关曝光约束：防止旋转相机时局部亮度突然冲高。
                float lumaNow = dot(finalColor, vec3(0.2126, 0.7152, 0.0722));
                float exposureScale = clamp(0.38 / max(lumaNow, 0.10), 0.66, 0.96);
                finalColor *= exposureScale;
                // 提升“通透感”：增加中段对比，避免整片发灰发雾。
                finalColor = clamp((finalColor - 0.5) * 1.22 + 0.5, 0.0, 1.0);
                finalColor = min(finalColor, vec3(0.70, 0.54, 0.35));

                // 防猩红保护：约束暖棕通道比例关系。
                finalColor.g = max(finalColor.g, finalColor.r * 0.40);
                finalColor.b = max(finalColor.b, finalColor.g * 0.32);
                finalColor.r = min(finalColor.r, finalColor.g * 1.82);

                // Stage3/4 简化分支：覆盖复杂联动，直接构建“通透 + 峰谷分离”。
                float simplifiedGate = layerNearMidFar;
                vec3 simpleLow = vec3(0.46, 0.30, 0.17);
                vec3 simpleHigh = vec3(0.72, 0.53, 0.33);
                vec3 simpleBase = mix(simpleLow, simpleHigh, smoothstep(0.04, 0.92, slopeBand));
                float simplePeakMask = smoothstep(0.62, 0.92, slopeBand) * (1.0 - flatMask);
                vec3 simpleColor = simpleBase;
                simpleColor *= mix(1.0, 1.10, simplePeakMask);
                float simpleRidge = smoothstep(0.46, 0.95, slopeBand) * (1.0 - flatMask);
                float simpleValley = smoothstep(0.10, 0.66, 1.0 - slopeBand) * (1.0 - flatMask);
                simpleColor += colorRidge.rgb * simpleRidge * 0.12;
                simpleColor *= 1.0 - simpleValley * 0.34;
                // 俯视可读性保底：平地给稳定中亮底板，避免出现“整块发黑看不清”。
                float plainReadableMask = broadFlatMask * simplifiedGate;
                vec3 plainReadable = vec3(0.44, 0.30, 0.18);
                simpleColor = mix(simpleColor, plainReadable, plainReadableMask * 0.78);
                simpleColor = clamp((simpleColor - 0.5) * 1.14 + 0.5, 0.0, 1.0);
                simpleColor = min(simpleColor, vec3(0.70, 0.54, 0.35));
                simpleColor = max(simpleColor, vec3(0.09, 0.05, 0.03));
                finalColor = mix(finalColor, simpleColor, simplifiedGate);

                float d = max(czm_eyeHeight, 0.0);
                float farAtmos = smoothstep(atmosphereFarStart, atmosphereFarEnd, d);
                float hazeStageWeight = mix(0.25, 1.0, layerLightingSplit);
                float haze = farAtmos * clamp(atmosphereStrength, 0.0, 1.0) * layerNearMidFar * hazeStageWeight;
                finalColor = mix(finalColor, atmosphereHazeColor.rgb, haze);

                vec3 finalClamped = clamp(finalColor, 0.0, 1.0);
                // 夜景可读性：给地形一个稳定的自发光底座，避免夜间完全看不清地貌。
                float emissiveBase = mix(0.11, 0.07, mountainMask);
                material.diffuse = finalClamped * (1.0 - emissiveBase);
                material.emission = finalClamped * emissiveBase;
                material.specular = 0.0;
                material.shininess = 0.0;
                material.alpha = 1.0;
                return material;
            }
        `
    };
}
