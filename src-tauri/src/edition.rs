//! 发行版能力开关（后端侧）。
//!
//! 与前端 `src/lib/edition.ts` 一一对应。「取证之手」内网版运行在没有公网的环境里，
//! 凡是硬依赖外部服务的入口在这里关闭，前端隐藏 UI，后端不发起请求。
//!
//! 需要恢复公网发行版时，把 `INTRANET_EDITION` 改成 `false`，并同步改前端的 EDITION。

/// 内网发行版：无法访问公网
pub const INTRANET_EDITION: bool = true;

/// ACP 外部 agent 工作台（依赖 cdn.agentclientprotocol.com 与 npm）
pub const ENABLE_ACP_AGENTS: bool = !INTRANET_EDITION;

/// 检查更新（更新源为 GitHub releases）
pub const ENABLE_UPDATE_CHECK: bool = !INTRANET_EDITION;

/// 外链入口（官网、GitHub 仓库页）
pub const ENABLE_EXTERNAL_LINKS: bool = !INTRANET_EDITION;

/// 在线模型目录同步（数据源为 GitHub 上的 litellm 模型表）
pub const ENABLE_ONLINE_MODEL_CATALOG: bool = !INTRANET_EDITION;
