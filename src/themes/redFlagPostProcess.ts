import { PostProcessStage, Viewer } from 'cesium';

const STAGE_NAME = 'E3_RedFlagLutStage';
const LUT_SIZE = 16;

function clamp01(v: number): number {
    return Math.max(0, Math.min(1, v));
}

function mapRedFlagColor(r: number, g: number, b: number): [number, number, number] {
    // RedFlag palette mapping:
    // 1) collapse noisy source chroma into luminance-driven tactical ramp
    // 2) enforce warm red-ochre dominance
    // 3) keep ridge bright but non-white
    const rr = clamp01(r);
    const gg = clamp01(g);
    const bb = clamp01(b);
    const y = clamp01(rr * 0.299 + gg * 0.587 + bb * 0.114);

    const low = [0.16, 0.11, 0.05] as const;
    const mid = [0.47, 0.27, 0.10] as const;
    const high = [0.68, 0.43, 0.16] as const;
    const ridge = [0.82, 0.62, 0.27] as const;

    const t0 = smoothstep(0.04, 0.52, y);
    const t1 = smoothstep(0.52, 0.86, y);
    let outR = low[0] * (1.0 - t0) + mid[0] * t0;
    let outG = low[1] * (1.0 - t0) + mid[1] * t0;
    let outB = low[2] * (1.0 - t0) + mid[2] * t0;

    outR = outR * (1.0 - t1) + high[0] * t1;
    outG = outG * (1.0 - t1) + high[1] * t1;
    outB = outB * (1.0 - t1) + high[2] * t1;

    const ridgeMix = smoothstep(0.76, 0.98, y) * 0.58;
    outR = outR * (1.0 - ridgeMix) + ridge[0] * ridgeMix;
    outG = outG * (1.0 - ridgeMix) + ridge[1] * ridgeMix;
    outB = outB * (1.0 - ridgeMix) + ridge[2] * ridgeMix;

    // Mid-tone ochre reinforcement to avoid scarlet drift.
    const midBoost = Math.exp(-((y - 0.48) * (y - 0.48)) / 0.024);
    outR += 0.04 * midBoost;
    outG += 0.01 * midBoost;
    outB += 0.01 * midBoost;

    // Clamp to warm-brown channel ratios.
    outG = Math.max(outG, outR * 0.52);
    outR = Math.min(outR, outG * 1.72);
    outB = Math.max(outB, outG * 0.32);

    return [clamp01(outR), clamp01(outG), clamp01(outB)];
}

function smoothstep(edge0: number, edge1: number, x: number): number {
    const t = clamp01((x - edge0) / Math.max(1e-6, edge1 - edge0));
    return t * t * (3 - 2 * t);
}

function buildLutCanvas(size: number): HTMLCanvasElement {
    const canvas = document.createElement('canvas');
    canvas.width = size * size;
    canvas.height = size;
    const ctx = canvas.getContext('2d');
    if (!ctx) {
        return canvas;
    }
    const image = ctx.createImageData(canvas.width, canvas.height);
    const data = image.data;
    for (let bz = 0; bz < size; bz += 1) {
        for (let gy = 0; gy < size; gy += 1) {
            for (let rx = 0; rx < size; rx += 1) {
                const r = rx / (size - 1);
                const g = gy / (size - 1);
                const b = bz / (size - 1);
                const [mr, mg, mb] = mapRedFlagColor(r, g, b);
                const x = bz * size + rx;
                const y = gy;
                const idx = (y * canvas.width + x) * 4;
                data[idx] = Math.round(mr * 255);
                data[idx + 1] = Math.round(mg * 255);
                data[idx + 2] = Math.round(mb * 255);
                data[idx + 3] = 255;
            }
        }
    }
    ctx.putImageData(image, 0, 0);
    return canvas;
}

export class RedFlagPostProcess {
    private readonly viewer: Viewer;
    private stage?: PostProcessStage;
    private lutCanvas?: HTMLCanvasElement;

    constructor(viewer: Viewer) {
        this.viewer = viewer;
    }

    public enable(intensity: number = 0.68): void {
        if (this.stage) {
            const uniforms = this.stage.uniforms as Record<string, unknown>;
            uniforms.lutIntensity = Math.max(0, Math.min(1, intensity));
            this.stage.enabled = true;
            return;
        }
        this.lutCanvas = buildLutCanvas(LUT_SIZE);
        this.stage = new PostProcessStage({
            name: STAGE_NAME,
            fragmentShader: `
                uniform sampler2D colorTexture;
                uniform sampler2D lutTexture;
                uniform float lutSize;
                uniform float lutIntensity;
                in vec2 v_textureCoordinates;

                vec3 sampleLut(vec3 c) {
                    float s = lutSize;
                    float z = clamp(c.b, 0.0, 1.0) * (s - 1.0);
                    float z0 = floor(z);
                    float z1 = min(s - 1.0, z0 + 1.0);
                    float zf = fract(z);

                    float x0 = (clamp(c.r, 0.0, 1.0) * (s - 1.0) + z0 * s + 0.5) / (s * s);
                    float x1 = (clamp(c.r, 0.0, 1.0) * (s - 1.0) + z1 * s + 0.5) / (s * s);
                    float y = (clamp(c.g, 0.0, 1.0) * (s - 1.0) + 0.5) / s;

                    vec3 c0 = texture(lutTexture, vec2(x0, y)).rgb;
                    vec3 c1 = texture(lutTexture, vec2(x1, y)).rgb;
                    return mix(c0, c1, zf);
                }

                void main() {
                    vec4 src = texture(colorTexture, v_textureCoordinates);
                    vec3 lut = sampleLut(src.rgb);
                    vec3 outColor = mix(src.rgb, lut, clamp(lutIntensity, 0.0, 1.0));
                    out_FragColor = vec4(outColor, src.a);
                }
            `,
            uniforms: {
                lutTexture: this.lutCanvas,
                lutSize: LUT_SIZE,
                lutIntensity: Math.max(0, Math.min(1, intensity))
            }
        });
        this.viewer.scene.postProcessStages.add(this.stage);
    }

    public disable(): void {
        if (!this.stage) {
            return;
        }
        this.viewer.scene.postProcessStages.remove(this.stage);
        this.stage = undefined;
        this.lutCanvas = undefined;
    }
}
