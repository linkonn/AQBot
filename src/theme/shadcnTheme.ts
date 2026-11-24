import { useMemo } from 'react';
import { theme } from 'antd';
import type { ThemeConfig } from 'antd';

/**
 * shadcn/ui-inspired Ant Design theme.
 * Clean borders, consistent radius, subtle shadows.
 * Adapts to dark/light via Ant Design's algorithm.
 */
export function useShadcnTheme(
  isDark: boolean,
  primaryColor: string,
  fontSize: number,
  borderRadius: number,
  fontFamily?: string,
  codeFontFamily?: string,
): ThemeConfig {
  return useMemo<ThemeConfig>(
    () => {
      // Derive proportional radii from the base value
      const radiusSM = Math.max(0, Math.round(borderRadius * 0.6));
      const radiusXS = Math.max(0, Math.round(borderRadius * 0.2));
      const radiusLG = Math.max(0, Math.round(borderRadius * 1.4));

      return {
        algorithm: isDark ? theme.darkAlgorithm : theme.defaultAlgorithm,
        token: {
          colorPrimary: primaryColor,
          colorLink: primaryColor,
          fontSize,
          fontWeightStrong: 500,

          // 科技蓝底：暗色用深海军蓝，浅色用带一点蓝的冷白，
          // 让所有容器/弹层自动继承同一冷色基调，而不是纯黑纯白。
          colorBgBase: isDark ? '#0A1220' : '#F5F8FE',
          colorBgLayout: isDark ? '#070E18' : '#EEF4FD',
          colorBorder: isDark ? '#1D2B40' : '#DCE6F5',
          colorBorderSecondary: isDark ? '#16233A' : '#E8EFFA',

          ...(fontFamily ? { fontFamily } : {}),
          ...(codeFontFamily ? { fontFamilyCode: codeFontFamily } : {}),

          // Border radius — configurable base with proportional variants
          borderRadius,
          borderRadiusXS: radiusXS,
          borderRadiusSM: radiusSM,
          borderRadiusLG: radiusLG,

          // Spacing
          padding: 16,
          paddingSM: 12,
          paddingLG: 24,
          margin: 16,
          marginSM: 12,
          marginLG: 24,

          // Shadows — subtle, layered
          boxShadow:
            '0 1px 3px 0 rgba(0, 0, 0, 0.1), 0 1px 2px -1px rgba(0, 0, 0, 0.1)',
          boxShadowSecondary:
            '0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -2px rgba(0, 0, 0, 0.1)',
        },
        components: {
          Button: {
            primaryShadow: 'none',
            defaultShadow: 'none',
            dangerShadow: 'none',
          },
          Input: {
            activeShadow: 'none',
          },
          Select: {
            optionSelectedFontWeight: 500,
          },
          Modal: {
            borderRadiusLG: Math.max(radiusLG, 8),
          },
          Slider: {
            handleSize: 8,
            handleSizeHover: 10,
            railSize: 4,
          },
        },
      };
    },
    [isDark, primaryColor, fontSize, borderRadius, fontFamily, codeFontFamily],
  );
}
