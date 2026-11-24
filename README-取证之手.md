# 取证之手（Forensic Hand）

基于 [AQBot](https://github.com/AQBot-Desktop/AQBot) 的内网二次开发版本，面向电子数据取证实验项目。

本分支在上游基础上做了三件事：改品牌、改科技蓝外观、把技能来源收敛到内网仓库。

---

## 一、与上游的差异

### 1. 品牌

| 位置 | 值 |
|---|---|
| 产品名 `productName` | 取证之手 |
| 可执行文件 | `ForensicHand.exe`（`mainBinaryName`，避免中文文件名在打包/脚本里出问题） |
| 窗口标题 / 标题栏 | 取证之手 |
| 安装包标识 `identifier` | 保持 `top.aqbot.desktop` 未变 |

> `identifier` 没改，是为了让老用户的数据目录（`%USERPROFILE%\.aqbot\`）和数据库继续可用。若要与上游版本在同一台机器共存，需要改成独立标识，届时数据目录也会分离。

图标由 `src-tauri/icons/brand-1024.png`（1024×1024 透明底）作为母版，经 `npx tauri icon` 生成全套（ico/icns/android/ios）。

### 2. 科技蓝外观

- 默认主色 `primary_color`：`#1A6BFF`（原为 `#17A93D` 绿色）
- Ant Design 令牌增加冷色基底：暗色 `colorBgBase #0A1220`、浅色 `#F5F8FE`，边框同步偏冷
- `src/index.css` 增加品牌层：标题栏蓝色渐变、选中文字品牌色、主按钮内描边、导航选中态左侧蓝条
- 选择工具条、颜色预设列表中的旧品牌绿一并替换

品牌常量集中在 `src/lib/brand.ts`，后续再改只需动这一处。

### 3. 技能来源只剩内网仓库

上游的技能市场会访问 `skills.sh` 和 `api.github.com`。本版本已全部移除：

- `src-tauri/src/commands/skills/registry.rs`：新增内网仓库客户端
- `search_marketplace`：只查内网仓库
- `install_skill`：只接受 `registry:<id>`、纯技能 id 或本地目录；外部 URL 会直接报错
- `install_from_github`（GitHub zipball 下载）已删除
- 前端技能页去掉 skills.sh / GitHub 来源切换，改为显示仓库地址与在线状态

旧的 skills.sh 解析函数被 `#[cfg(test)]` 限定，只服务于单元测试与旧数据兼容，运行时不会发外部请求。

### 4. 内网功能裁剪

Agent 引擎是项目自带的原生实现（`src-tauri/crates/open-agent-sdk/`），不依赖公网，完整保留。
真正硬依赖外网的是 ACP 外部 agent 工作台：它要拉 `cdn.agentclientprotocol.com` 的注册表、
用 `registry.npmjs.org` 安装 Claude Code / Codex 等 CLI，内网两个都不通，点进去只会一直转圈。
所以本版本把这类入口统一关了：

| 开关 | 被隐藏的东西 | 断掉的外部依赖 |
|---|---|---|
| `acpAgents` | 侧边栏 Agent 页、设置里的 ACP 子项 | `cdn.agentclientprotocol.com`、npm registry |
| `updateCheck` | 设置「关于」的检查更新块、标题栏更新图标、托盘「检查更新」 | GitHub releases |
| `externalLinks` | 官网 / GitHub 按钮、角色页市场来源、托盘 GitHub 菜单 | 浏览器外链 |
| `onlineModelCatalog` | 设置里的「在线模型目录」选项 | GitHub raw 上的 litellm 模型表 |

开关只有一处真源：前端 `src/lib/edition.ts`（`EDITION = 'intranet' | 'public'`），
后端对应 `src-tauri/src/edition.rs`（`INTRANET_EDITION`）。改回 `'public'` / `false`，
所有入口一次性恢复；后端能力本身没有删除，只是不发请求、不显示入口。

关闭在线模型目录后，模型列表只能用随包里带的内置快照（`providers.rs` 强制 `load_builtin()`）。

---

## 二、构建与运行

```bash
pnpm install
pnpm dev          # 开发运行
pnpm build        # 前端构建
pnpm tauri build  # 出安装包
```

首次启动前 `predev` / `prebuild` 会自动补齐 `libs/` 下两个本地包的构建产物（详见 `scripts/build-local-deps.mjs`）。

---

## 三、内网技能仓库

服务端在 `registry-server/`，零第三方依赖，Node 18+ 直接跑：

```bash
node registry-server/server.mjs          # 默认 0.0.0.0:7801
PORT=7801 REGISTRY_TOKEN=xxx node registry-server/server.mjs
```

客户端指向仓库（三选一，优先级从高到低）：

1. 环境变量 `AQBOT_SKILL_REGISTRY` + `AQBOT_SKILL_REGISTRY_TOKEN`
2. `%USERPROFILE%\.aqbot\skill-registry.json`
3. 默认 `http://127.0.0.1:7801`

配置文件内容：

```json
{ "base_url": "http://10.10.20.31:7801", "token": "" }
```

批量部署可用 `registry-server/set-client-registry.ps1`。

详细说明（接口、目录约定、防火墙、验证步骤）见 **`registry-server/README.md`**。

---

## 四、已知限制

- **自动更新已默认关闭**（`auto_check_update: false`），因为更新源是 GitHub，内网不可达。老数据库里的旧设置值不会被覆盖，如仍有更新报错日志，到「设置 → 关于」手动关掉即可。
- 技能仓库不提供签名校验，安装包来源完全依赖内网可信。若需要防止仓库被篡改，建议后续加哈希清单。
- 技能不会自动升级，仓库更新版本后需用户在技能页重新安装。
- `identifier` 未改，同一台机器不要同时安装上游 AQBot 与本版本。
- ACP 外部 agent 工作台在内网版不可用；如需接入外部 CLI，只能在能连公网的机器上把 `edition` 改回公网版。
