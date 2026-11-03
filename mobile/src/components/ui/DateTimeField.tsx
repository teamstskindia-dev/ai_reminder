import DateTimePicker, { DateTimePickerAndroid } from '@react-native-community/datetimepicker';
import { CalendarClock, X } from 'lucide-react-native';
import { useState } from 'react';
import { Modal, Platform, Pressable, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useTheme } from '@/theme/ThemeProvider';
import { formatDayLabel, formatTime } from '@/utils/format';
import { reportError } from '@/utils/logger';

import { Button } from './Button';
import { Text } from './Text';
import { Touchable } from './Touchable';

export interface DateTimeFieldProps {
  label: string;
  value: Date | null;
  onChange: (value: Date | null) => void;
  mode?: 'datetime' | 'date';
  minimumDate?: Date;
  placeholder?: string;
  clearable?: boolean;
  error?: string | null;
}

function merge(datePart: Date, timePart: Date): Date {
  const d = new Date(datePart);
  d.setHours(timePart.getHours(), timePart.getMinutes(), 0, 0);
  return d;
}

/** iOS: an inline picker in a bottom sheet with Cancel / Done (value only commits on Done). */
function IosPickerSheet({
  visible,
  initial,
  mode,
  minimumDate,
  title,
  onCancel,
  onDone,
}: {
  visible: boolean;
  initial: Date;
  mode: 'datetime' | 'date';
  minimumDate?: Date;
  title: string;
  onCancel: () => void;
  onDone: (value: Date) => void;
}) {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const [draft, setDraft] = useState(initial);

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onCancel}>
      <Pressable accessibilityLabel="Close picker" style={[styles.backdrop, { backgroundColor: theme.colors.overlay }]} onPress={onCancel}>
        <Pressable
          onPress={() => undefined}
          style={[
            styles.sheet,
            { backgroundColor: theme.colors.surface, borderTopLeftRadius: theme.radii.xl, borderTopRightRadius: theme.radii.xl, paddingBottom: insets.bottom + 12 },
          ]}
        >
          <View style={[styles.sheetHeader, { borderBottomColor: theme.colors.border }]}>
            <Button label="Cancel" variant="ghost" size="sm" onPress={onCancel} />
            <Text variant="subheading">{title}</Text>
            <Button label="Done" variant="ghost" size="sm" onPress={() => onDone(draft)} />
          </View>
          <DateTimePicker
            value={draft}
            mode={mode}
            display={mode === 'date' ? 'inline' : 'spinner'}
            minimumDate={minimumDate}
            accentColor={theme.colors.primary}
            themeVariant={theme.isDark ? 'dark' : 'light'}
            onValueChange={(_event, date) => setDraft(date)}
            style={styles.iosPicker}
          />
        </Pressable>
      </Pressable>
    </Modal>
  );
}

/**
 * One date/time field for both platforms: Android opens the native dialogs (date, then time);
 * iOS shows an inline/spinner picker in a sheet with Done/Cancel.
 */
export function DateTimeField({
  label,
  value,
  onChange,
  mode = 'datetime',
  minimumDate,
  placeholder = 'Choose a date',
  clearable = false,
  error,
}: DateTimeFieldProps) {
  const theme = useTheme();
  const [iosOpen, setIosOpen] = useState(false);
  const display = value ? (mode === 'date' ? formatDayLabel(value) : `${formatDayLabel(value)} · ${formatTime(value)}`) : placeholder;

  const open = () => {
    if (Platform.OS === 'ios') {
      setIosOpen(true);
      return;
    }
    const initial = value ?? minimumDate ?? new Date();
    try {
      DateTimePickerAndroid.open({
        value: initial,
        mode: 'date',
        minimumDate,
        onValueChange: (_event, pickedDate) => {
          if (mode === 'date') {
            onChange(merge(pickedDate, initial));
            return;
          }
          DateTimePickerAndroid.open({
            value: merge(pickedDate, initial),
            mode: 'time',
            is24Hour: false,
            onValueChange: (_e, pickedTime) => onChange(merge(pickedDate, pickedTime)),
          });
        },
      });
    } catch (e) {
      reportError(e, { source: 'date-picker' });
    }
  };

  return (
    <View style={styles.container}>
      <Text variant="label" tone="secondary">
        {label}
      </Text>
      <Touchable
        accessibilityRole="button"
        accessibilityLabel={`${label}: ${display}`}
        onPress={open}
        style={[
          styles.field,
          { borderColor: error ? theme.colors.danger : theme.colors.border, backgroundColor: theme.colors.surface, borderRadius: theme.radii.md },
        ]}
      >
        <CalendarClock size={18} color={theme.colors.textMuted} />
        <Text variant="body" tone={value ? 'default' : 'muted'} style={styles.value}>
          {display}
        </Text>
        {clearable && value ? (
          <Pressable accessibilityRole="button" accessibilityLabel={`Clear ${label}`} onPress={() => onChange(null)} hitSlop={12}>
            <X size={18} color={theme.colors.textMuted} />
          </Pressable>
        ) : null}
      </Touchable>
      {Platform.OS === 'ios' && iosOpen ? (
        <IosPickerSheet
          visible
          title={label}
          mode={mode}
          initial={value ?? minimumDate ?? new Date()}
          minimumDate={minimumDate}
          onCancel={() => setIosOpen(false)}
          onDone={(next) => {
            setIosOpen(false);
            onChange(next);
          }}
        />
      ) : null}
      {error ? (
        <Text variant="caption" tone="danger">
          {error}
        </Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    gap: 6,
  },
  field: {
    minHeight: 48,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 14,
    borderWidth: 1,
  },
  value: {
    flex: 1,
  },
  backdrop: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  sheet: {
    width: '100%',
    maxWidth: 640,
    alignSelf: 'center',
  },
  sheetHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 8,
    paddingVertical: 6,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  iosPicker: {
    alignSelf: 'center',
  },
});
