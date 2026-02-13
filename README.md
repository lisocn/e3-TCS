E3 (Electromagnetic Environment Engine) 是一个**开放 (Open)**、**跨粒度 (Cross-Granularity)**、**超大规模 (Massive-Scale)** 的下一代仿真平台，旨在为大规模兵棋推演提供高性能底座。

e3-TCS是E3平台的一个子项目，主要负责为战术推演的场景编辑、推演、态势标图等功能提供可视化GIS服务(基于最新版cesium)。
---

## 🤖 给 AI Agent 的关键指令 (Critical Instructions for AI Agents)

所有参与本项目的 AI Agent 必须严格遵守以下规则，以确保协作的一致性和专业性：

1.  **交流语言 (Conversation Language)**:
    *   **必须使用中文 (Chinese)** 进行所有回复、解释和文档编写。
    *   **Must use Chinese** for all responses, explanations, and documentation.

2.  **代码注释 (Code Comments)**:
    *   所有**新编写或修改**的代码注释（包括头文件说明、函数文档、行内注释）必须使用 **中文 (Chinese)**。
    *   Code comments for new or modified code must be in **Chinese**.

3.  **日志输出 (Log Output)**:
    *   运行时日志 (Runtime Logs)、调试信息 (Debug Info) 和错误消息 (Error Messages) 必须保持 **英文 (English)**。
    *   这是为了防止在不同终端环境下的编码乱码，并保持日志分析工具的兼容性。
    *   Runtime logs and debug output must remain in **English**.
4.  **代码提交 (Commit)**:
    *   代码提交信息必须使用 **中文 (Chinese)**。
    *   Code commit messages must be in **Chinese**.
5. **代码检查 (Lint)**:
```bash
npm run lint
```
---

## 📡 离线化与本地化规范 (Offline & Localization)

> [!IMPORTANT]
> **本项目的最终运行环境为“无互联网/无物联网”的内网物理隔离环境。** 
> 所有后续开发必须严格遵守以下“零依赖外部网络”原则：

1.  **禁止外部 CDN**: 严禁在 `index.html` 或组件中引入任何外部 JS/CSS 链接（如 Google Fonts, Cloudflare CDN 等）。
2.  **资源本地化**: 所有字体文件 (`.woff2`)、图标、以及第三方库必须打包在 `assets/` 或 `public/` 目录下，并使用相对路径引用。
3.  **地图数据本地化**: 地图底图、高程数据和样式文件必须由 `e3_tiles_server` 本地拉取 MBTiles 数据库交付，禁止调用 Mapbox 或 OSM 的在线 API。
4.  **通信隔离**: 前后端通信仅限于本地环回地址 (`127.0.0.1`) 或指定的内网物理 IP。

---
## 🎨 视觉风格与开发规范 (Style & Standards)

本项目采用**配置驱动 (Configuration-Driven)** 和 **集中式主题 (Centralized Theming)** 的设计理念，所有后续开发代理 (Agents) 和开发者必须遵守以下规范。

### 1. 样式系统 (Theming System)

严禁在组件内部硬编码颜色值。必须使用 CSS 变量或语义化类名。

*   **样式定义位置**: `src/themes/`
*   **配置位置**: `src/config.ts` -> `ui.theme`

#### 示例: 语义变量 (Semantic Variables)
| 变量名             | 含义                | 默认 (Tactical)                   |
| :----------------- | :------------------ | :-------------------------------- |
| `--color-primary`  | 主色调 (数据/高亮)  | Electric Cyan `#00f0ff`           |
| `--color-warning`  | 警告/异常           | Orange `#ff9900`                  |
| `--color-bg-main`  | 全局背景            | Deep Slate `#0b0f19`              |
| `--color-bg-panel` | 面板背景 (带透明度) | Slate Glass `rgba(16,24,39,0.75)` |
| `--font-mono`      | 战术数据/HUD字体    | `JetBrains Mono`                  |

#### 标准 UI 组件类 (Utility Classes)
*   **`.tactical-panel`**: 标准容器样式。自带磨砂玻璃 (Blur)、细边框、圆角和悬停发光效果。
*   **`.data-value`**: 用于展示关键数字。使用 Mono 字体，带荧光阴影。
*   **`.data-label`**: 用于展示标签。使用 Sans 字体，小字号大写。

**❌ 错误写法**:
```tsx
<div style={{ backgroundColor: '#000', border: '1px solid cyan' }}>...</div>
```

**✅ 正确写法**:
```tsx
<div className="tactical-panel p-4">...</div>
```

### 2. 多语言规范 (Internationalization)

所有用户界面可见的文字必须通过 `i18next` 进行国际化。

*   **禁止**: 禁止在 TSX 中直接写死中英文。

### 3. 配置管理 (Configuration)
所有“甚至只有1%可能需要修改”的参数，都必须提取到 `AppConfig`。
*   **位置**: `src/config.ts`
*   **原则**: 代码本身应当是无状态的逻辑容器，业务规则由 Config 注入。

### 4. 扩展新皮肤 (How to Add Themes)
1.  在 `theme.css` 中添加新的类名选择器。
2.  在该类名下重写 CSS 变量（只需重写颜色，布局变量通常继承 `:root`）。
3.  在 `AppConfig.ui.theme` 中允许使用该新名称。

### 5. 代码质量与构建约束 (Code Quality)

本项目启用了**零容忍**的类型检查策略。

*   **Strict Mode**: `tsconfig.app.json` 已开启 `"strict": true`。
*   **Build Gate**: 生产构建命令 `npm run build` 会先执行 `tsc -b`。
    *   ⚠️ **这意味着**: 任何 TS 类型错误（哪怕是 `any` 推断）都会导致构建直接失败。
    *   🤖 **Agent 须知**: 在修改代码后，**必须**确保没有引入新的 TS 类型错误。不要提交 "ts-ignore" 除非万不得已。
*   **Linting**: 提交代码前建议运行 `npm run lint` 检查 React Hooks 规范。

---