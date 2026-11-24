import { useLayoutEffect, useRef } from 'react';
import { theme } from 'antd';
import { useUIStore } from '@/stores';
import { isFeatureEnabled } from '@/lib/edition';
import {
  SettingsSidebar,
  ProviderSettings,
  GeneralSettings,
  LocalModelsSettings,
  DisplaySettings,
  ProxySettings,
  ShortcutSettings,
  DataManager,
  AboutPage,
  SearchProviderSettings,
  McpServerSettings,
  BackupCenter,
  StorageSpaceManager,
  SelectionToolbarSettings,
  AcpAgentSettings,
} from '@/components/settings';
import { DefaultModelSettings } from '@/components/settings/DefaultModelSettings';
import { ConversationSettings } from '@/components/settings/ConversationSettings';
import type { SettingsSection } from '@/types';

const SECTION_COMPONENTS: Record<SettingsSection, React.ComponentType> = {
  providers: ProviderSettings,
  conversationSettings: ConversationSettings,
  defaultModel: DefaultModelSettings,
  general: GeneralSettings,
  localModels: LocalModelsSettings,
  display: DisplaySettings,
  proxy: ProxySettings,
  shortcuts: ShortcutSettings,
  data: DataManager,
  storage: StorageSpaceManager,
  about: AboutPage,
  searchProviders: SearchProviderSettings,
  mcpServers: McpServerSettings,
  backup: BackupCenter,
  selectionToolbar: SelectionToolbarSettings,
  acpAgents: AcpAgentSettings,
};

export function SettingsPage() {
  const { token } = theme.useToken();
  const settingsSection = useUIStore((s) => s.settingsSection);
  // ACP 设置页在内网版没有入口，这里兜底回落到通用设置，避免残留状态直接渲染
  const section =
    settingsSection === 'acpAgents' && !isFeatureEnabled('acpAgents') ? 'general' : settingsSection;
  const ContentComponent = SECTION_COMPONENTS[section];
  const contentScrollRef = useRef<HTMLDivElement>(null);

  useLayoutEffect(() => {
    const contentScroller = contentScrollRef.current;
    if (!contentScroller) return;

    contentScroller.scrollTop = 0;
    contentScroller.scrollLeft = 0;
  }, [settingsSection]);

  return (
    <div className="flex h-full">
      <div
        className="w-56 shrink-0 h-full"
        style={{ borderRight: '1px solid var(--border-color)', backgroundColor: token.colorBgContainer }}
      >
        <SettingsSidebar />
      </div>
      <div
        ref={contentScrollRef}
        className="min-w-0 flex-1 overflow-y-auto"
        style={{ backgroundColor: token.colorBgElevated }}
      >
        <ContentComponent />
      </div>
    </div>
  );
}
