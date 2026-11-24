/**
 * 发行版能力开关。
 *
 * 「取证之手」内网版运行在没有公网的环境里，凡是硬依赖外部服务的入口都在这里
 * 统一关闭，由各处 UI 消费。后端能力本身不删，日后需要恢复时只把 EDITION 改回去，
 * 前端入口会一起回来。
 */

/** 当前发行版：'intranet' 内网版 / 'public' 公网版 */
export const EDITION: 'intranet' | 'public' = 'intranet';

const INTRANET = EDITION === 'intranet';

export const FEATURES = {
  /**
   * ACP 外部 agent 工作台。
   * 依赖 cdn.agentclientprotocol.com 拉注册表、registry.npmjs.org 安装外部 CLI，
   * 内网两者都不通，点进去只会一直转圈。
   */
  acpAgents: !INTRANET,

  /** 检查更新。更新源是 GitHub releases，内网不可达。 */
  updateCheck: !INTRANET,

  /** 外链入口（官网、GitHub 仓库页），点了只会打开失败页。 */
  externalLinks: !INTRANET,

  /**
   * 在线模型目录同步。
   * 数据源是 raw.githubusercontent.com 上的 litellm 模型表，内网不可达；
   * 关闭后只能用内置快照。
   */
  onlineModelCatalog: !INTRANET,

  /**
   * 上一次会话异常退出时的恢复对话框。
   * 开发期会频繁强杀进程，每次启动都弹一次太吵，先关掉。
   * 关掉只是不打扰：诊断标记、日志、pending 报告仍然照常写入，
   * 需要排查时把这里改回 true 就能重新看到。
   */
  crashRecovery: false,
} as const;

export type FeatureKey = keyof typeof FEATURES;

export function isFeatureEnabled(key: FeatureKey): boolean {
  return FEATURES[key];
}
