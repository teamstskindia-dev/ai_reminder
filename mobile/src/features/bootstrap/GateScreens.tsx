import { Download, RefreshCw, Wrench, type LucideIcon } from 'lucide-react-native';
import type { ReactNode } from 'react';
import { Linking, Platform, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Logo } from '@/components/brand/Logo';
import { Button } from '@/components/ui/Button';
import { Text } from '@/components/ui/Text';
import { useConfig } from '@/providers/config/ConfigProvider';
import { useTheme } from '@/theme/ThemeProvider';
import { getAppVersion } from '@/utils/env';
import { toast } from '@/utils/toast';

function GateLayout({ icon: Icon, title, message, children }: { icon: LucideIcon; title: string; message: string; children: ReactNode }) {
  const theme = useTheme();
  return (
    <SafeAreaView style={[styles.screen, { backgroundColor: theme.colors.background }]}>
      <View style={styles.top}>
        <Logo size={34} />
      </View>
      <View style={styles.center}>
        <View style={[styles.bubble, { backgroundColor: theme.colors.primarySoft }]}>
          <Icon size={36} color={theme.colors.primaryText} strokeWidth={1.8} />
        </View>
        <Text variant="title" align="center">
          {title}
        </Text>
        <Text variant="body" tone="secondary" align="center" style={styles.message}>
          {message}
        </Text>
      </View>
      <View style={styles.actions}>{children}</View>
    </SafeAreaView>
  );
}

export function MaintenanceScreen() {
  const { maintenanceMessage, refresh, refreshing, config } = useConfig();
  return (
    <GateLayout
      icon={Wrench}
      title="We'll be right back"
      message={maintenanceMessage || `${config.branding.appName} is getting some upgrades. Please check back in a few minutes.`}
    >
      <Button label="Try again" icon={RefreshCw} onPress={() => void refresh()} loading={refreshing} fullWidth />
    </GateLayout>
  );
}

export function ForceUpdateScreen() {
  const { config, refresh, refreshing } = useConfig();
  const storeUrl = Platform.OS === 'ios' ? config.app.iosStoreUrl : config.app.androidStoreUrl;
  const current = getAppVersion();

  const openStore = async () => {
    try {
      await Linking.openURL(storeUrl);
    } catch {
      toast("Couldn't open the store.");
    }
  };

  return (
    <GateLayout
      icon={Download}
      title="Time to update"
      message={`A newer version of ${config.branding.appName} is required to continue. You have ${current}; version ${config.app.minAppVersion} or later is needed.${
        storeUrl ? '' : ` Update ${config.branding.appName} from the ${Platform.OS === 'ios' ? 'App Store' : 'Play Store'} to keep going.`
      }`}
    >
      {storeUrl ? <Button label="Update now" icon={Download} onPress={() => void openStore()} fullWidth /> : null}
      <Button label="I've updated — check again" variant="ghost" onPress={() => void refresh()} loading={refreshing} fullWidth />
    </GateLayout>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    paddingHorizontal: 24,
  },
  top: {
    paddingTop: 16,
    alignItems: 'center',
  },
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
  },
  bubble: {
    width: 88,
    height: 88,
    borderRadius: 44,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 12,
  },
  message: {
    maxWidth: 340,
  },
  actions: {
    gap: 8,
    paddingBottom: 24,
  },
});
