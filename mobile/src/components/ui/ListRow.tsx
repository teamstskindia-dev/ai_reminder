import { ChevronRight, type LucideIcon } from 'lucide-react-native';
import { Children, type ReactNode } from 'react';
import { StyleSheet, Switch, View } from 'react-native';

import { useTheme } from '@/theme/ThemeProvider';

import { Touchable } from './Touchable';
import { Text } from './Text';

export interface ListRowProps {
  title: string;
  subtitle?: string | null;
  icon?: LucideIcon;
  iconColor?: string;
  value?: string | null;
  right?: ReactNode;
  onPress?: () => void;
  chevron?: boolean;
  destructive?: boolean;
  disabled?: boolean;
}

export function ListRow({
  title,
  subtitle,
  icon: Icon,
  iconColor,
  value,
  right,
  onPress,
  chevron = Boolean(onPress),
  destructive,
  disabled,
}: ListRowProps) {
  const theme = useTheme();
  const tint = destructive ? theme.colors.danger : (iconColor ?? theme.colors.primaryText);

  const body = (
    <>
      {Icon ? (
        <View
          style={[
            styles.iconWrap,
            { backgroundColor: destructive ? theme.colors.dangerSoft : theme.colors.primarySoft, borderRadius: theme.radii.sm + 2 },
          ]}
        >
          <Icon size={18} color={tint} strokeWidth={2.2} />
        </View>
      ) : null}
      <View style={styles.texts}>
        <Text variant="body" tone={destructive ? 'danger' : 'default'} numberOfLines={1}>
          {title}
        </Text>
        {subtitle ? (
          <Text variant="caption" tone="secondary" numberOfLines={2}>
            {subtitle}
          </Text>
        ) : null}
      </View>
      {value ? (
        <Text variant="callout" tone="secondary" numberOfLines={1} style={styles.value}>
          {value}
        </Text>
      ) : null}
      {right}
      {chevron ? <ChevronRight size={18} color={theme.colors.textMuted} /> : null}
    </>
  );

  if (!onPress) return <View style={[styles.row, { paddingHorizontal: theme.spacing.lg }]}>{body}</View>;
  return (
    <Touchable
      accessibilityRole="button"
      accessibilityLabel={title}
      accessibilityHint={subtitle ?? undefined}
      onPress={onPress}
      disabled={disabled}
      style={({ pressed }) => [
        styles.row,
        { paddingHorizontal: theme.spacing.lg, opacity: disabled ? 0.5 : 1 },
        pressed ? { backgroundColor: theme.colors.surfacePressed } : null,
      ]}
    >
      {body}
    </Touchable>
  );
}

export interface SwitchRowProps {
  title: string;
  subtitle?: string | null;
  icon?: LucideIcon;
  value: boolean;
  onValueChange: (value: boolean) => void;
  disabled?: boolean;
}

export function SwitchRow({ title, subtitle, icon, value, onValueChange, disabled }: SwitchRowProps) {
  const theme = useTheme();
  return (
    <ListRow
      title={title}
      subtitle={subtitle}
      icon={icon}
      chevron={false}
      onPress={disabled ? undefined : () => onValueChange(!value)}
      right={
        <Switch
          accessibilityLabel={title}
          value={value}
          onValueChange={onValueChange}
          disabled={disabled}
          trackColor={{ false: theme.colors.borderStrong, true: theme.colors.primary }}
          thumbColor={value ? theme.colors.primaryForeground : theme.colors.surface}
        />
      }
    />
  );
}

/** A grouped card of rows with hairline separators. */
export function ListGroup({ children, title }: { children: ReactNode; title?: string }) {
  const theme = useTheme();
  const items = Children.toArray(children);
  return (
    <View style={styles.group}>
      {title ? (
        <Text variant="micro" tone="muted" style={[styles.groupTitle, { paddingHorizontal: theme.spacing.xs }]}>
          {title.toUpperCase()}
        </Text>
      ) : null}
      <View style={[{ backgroundColor: theme.colors.surface, borderRadius: theme.radii.lg }, theme.elevation.card, styles.groupCard]}>
        {items.map((child, index) => (
          <View key={index}>
            {index > 0 ? (
              <View style={[styles.separator, { backgroundColor: theme.colors.border, marginLeft: theme.spacing.lg }]} />
            ) : null}
            {child}
          </View>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    minHeight: 56,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 10,
  },
  iconWrap: {
    width: 34,
    height: 34,
    alignItems: 'center',
    justifyContent: 'center',
  },
  texts: {
    flex: 1,
    gap: 2,
  },
  value: {
    maxWidth: '45%',
  },
  group: {
    gap: 8,
  },
  groupTitle: {
    marginTop: 4,
  },
  groupCard: {
    overflow: 'hidden',
  },
  separator: {
    height: StyleSheet.hairlineWidth,
  },
});
