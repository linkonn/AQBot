import type { AppSettings, TitlebarIconId, TitlebarToggleableIconId } from '@/types';
import { isFeatureEnabled } from '@/lib/edition';
import type { FeatureKey } from '@/lib/edition';

export const TITLEBAR_TOGGLEABLE_ICONS: TitlebarToggleableIconId[] = [
  'pin',
  'theme',
  'language',
  'backup',
  'github',
  'update',
  'reload',
];

export const TITLEBAR_ICON_IDS: TitlebarIconId[] = [
  ...TITLEBAR_TOGGLEABLE_ICONS,
  'settings',
];

export const TITLEBAR_ICON_LABEL_KEYS: Record<TitlebarIconId, string> = {
  pin: 'settings.titlebarIcon.pin',
  theme: 'settings.titlebarIcon.theme',
  language: 'settings.titlebarIcon.language',
  backup: 'settings.titlebarIcon.backup',
  github: 'settings.titlebarIcon.github',
  update: 'settings.titlebarIcon.update',
  reload: 'settings.titlebarIcon.reload',
  settings: 'settings.titlebarIcon.settings',
};

/**
 * 受发行版能力开关约束的标题栏图标。
 * 开关关闭时，图标既不渲染，也不会出现在显示设置的开关列表里。
 */
const FEATURE_GATED_TITLEBAR_ICONS: Partial<Record<TitlebarToggleableIconId, FeatureKey>> = {
  github: 'externalLinks',
  update: 'updateCheck',
};

/** 当前发行版下可用的标题栏图标 */
export function availableTitlebarIcons(): TitlebarToggleableIconId[] {
  return TITLEBAR_TOGGLEABLE_ICONS.filter((id) => {
    const gate = FEATURE_GATED_TITLEBAR_ICONS[id];
    return !gate || isFeatureEnabled(gate);
  });
}

export function isTitlebarIconVisible(
  settings: Pick<AppSettings, 'titlebar_icon_visibility'>,
  id: TitlebarToggleableIconId,
): boolean {
  const gate = FEATURE_GATED_TITLEBAR_ICONS[id];
  if (gate && !isFeatureEnabled(gate)) return false;
  return settings.titlebar_icon_visibility?.[id] !== false;
}
