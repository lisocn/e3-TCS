export interface SonarParams {
    soundSpeed: number;
    hasThermocline: boolean;
    hasConvergenceZone: boolean;
}

/**
 * 根据深度计算简化声呐参数。
 * 说明：
 * - 温跃层判定：depth > 200m
 * - 汇集区判定：depth > 3000m
 * - 声速公式使用简化经验公式，仅深度 z 为动态变量
 */
export function calculateSonarParams(depth: number): SonarParams {
    const z = Math.max(0, depth);
    const t = 10; // 简化常量温度
    const s = 35; // 简化常量盐度

    const soundSpeed =
        1449.2 +
        4.6 * t -
        0.055 * t * t +
        0.00029 * t * t * t +
        (1.34 - 0.01 * t) * (s - 35) +
        0.016 * z;

    return {
        soundSpeed,
        hasThermocline: z > 200,
        hasConvergenceZone: z > 3000
    };
}

