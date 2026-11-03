import { CloudOff, Inbox, type LucideIcon } from 'lucide-react-native';
import type { ReactNode } from 'react';
import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';

import { getErrorMessage, isApiError } from '@/api/errors';
import { useTheme } from '@/theme/ThemeProvider';

import { Button } from './Button';
import { Text } from './Text';

interface BaseStateProps {
  icon?: LucideIcon;
  title: string;
  message?: string | null;
  action?: { label: string; onPress: () => void; loading?: boolean };
  compact?: boolean;
  style?: StyleProp<ViewStyle>;
  children?: ReactNode;
}

function StateView({ icon: Icon = Inbox, title, message, action, compact, style, children, tone }: BaseStateProps & { tone: 'neutral' | 'danger' }) {
  const theme = useTheme();
  const bubble = tone === 'danger' ? theme.colors.dangerSoft : theme.colors.primarySoft;
  const iconColor = tone === 'danger' ? theme.colors.danger : theme.colors.primaryText;
  return (
    <View style={[styles.container, compact ? styles.compact : styles.full, style]}>
      <View
        style={[
          styles.bubble,
          compact ? styles.bubbleSmall : null,
          { backgroundColor: bubble, borderRadius: theme.radii.pill },
        ]}
      >
        <Icon size={compact ? 22 : 28} color={iconColor} strokeWidth={2} />
      </View>
      <Text variant={compact ? 'subheading' : 'heading'} align="center">
        {title}
      </Text>
      {message ? (
        <Text variant="callout" tone="secondary" align="center" style={styles.message}>
          {message}
        </Text>
      ) : null}
      {children}
      {action ? (
        <Button
          label={action.label}
          onPress={action.onPress}
          loading={action.loading}
          variant="secondary"
          size={compact ? 'sm' : 'md'}
          style={styles.action}
        />
      ) : null}
    </View>
  );
}

export function EmptyState(props: BaseStateProps) {
  return <StateView {...props} tone="neutral" />;
}

export interface ErrorStateProps {
  error: unknown;
  onRetry?: () => void;
  retrying?: boolean;
  title?: string;
  compact?: boolean;
  style?: StyleProp<ViewStyle>;
}

export function ErrorState({ error, onRetry, retrying, title, compact, style }: ErrorStateProps) {
  const network = isApiError(error) && error.isNetwork;
  return (
    <StateView
      tone="danger"
      icon={CloudOff}
      title={title ?? (network ? "You're offline" : "Couldn't load this")}
      message={getErrorMessage(error)}
      action={onRetry ? { label: 'Try again', onPress: onRetry, loading: retrying } : undefined}
      compact={compact}
      style={style}
    />
  );
}

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingHorizontal: 24,
  },
  full: {
    flexGrow: 1,
    paddingVertical: 48,
  },
  compact: {
    paddingVertical: 20,
  },
  bubble: {
    width: 64,
    height: 64,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 8,
  },
  bubbleSmall: {
    width: 48,
    height: 48,
    marginBottom: 4,
  },
  message: {
    maxWidth: 320,
  },
  action: {
    marginTop: 12,
  },
});
