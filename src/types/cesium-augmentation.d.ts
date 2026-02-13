import 'cesium';

declare module 'cesium' {
    interface Globe {
        /**
         * 官方类型定义中缺失的属性，实际存在于 Cesium 源码中。
         * 用于控制地表大气的显示。
         */
        showGroundAtmosphere: boolean;

        /**
         * 材质属性，虽然官方文档提及，但在部分类型定义版本中缺失。
         */
        material?: Material;
    }

    interface Material {
        /**
         * 访问材质的 uniforms 属性。
         * 注意：Uniforms 是动态结构，具体字段取决于材质类型。
         */
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        uniforms: Record<string, any>;
    }
}
