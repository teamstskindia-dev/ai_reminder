import { format } from 'date-fns';
import { useState } from 'react';
import { Pressable, StyleSheet, View, type LayoutChangeEvent } from 'react-native';
import Svg, { Line, Path } from 'react-native-svg';

import type { AnalyticsOverview } from '@/api/types';
import { Text } from '@/components/ui/Text';
import { useTheme } from '@/theme/ThemeProvider';
import { formatMinutes, pluralize, toDate } from '@/utils/format';

type Day = AnalyticsOverview['byDay'][number];

const CHART_HEIGHT = 140;
const GAP = 2;

/** A bar whose top corners are rounded and whose base sits flat on the baseline. */
function barPath(x: number, y: number, w: number, h: number, r: number): string {
  const rr = Math.min(r, w / 2, h);
  if (h <= 0) return '';
  return [
    `M${x},${y + h}`,
    `L${x},${y + rr}`,
    `Q${x},${y} ${x + rr},${y}`,
    `L${x + w - rr},${y}`,
    `Q${x + w},${y} ${x + w},${y + rr}`,
    `L${x + w},${y + h}`,
    'Z',
  ].join(' ');
}

function dayLabel(date: string, long = false): string {
  return format(toDate(date), long ? 'EEE, MMM d' : 'MMM d');
}

/** Meetings per day. Tap a bar to inspect it (the native equivalent of a hover tooltip). */
export function MeetingsBarChart({ days }: { days: Day[] }) {
  const theme = useTheme();
  const [width, setWidth] = useState(0);
  const [selected, setSelected] = useState<number | null>(null);
  const max = Math.max(1, ...days.map((d) => d.meetings));
  const total = days.reduce((sum, d) => sum + d.meetings, 0);
  const slot = days.length ? width / days.length : 0;
  const barWidth = Math.max(1, slot - GAP);
  const active = selected !== null ? days[selected] : null;
  const busiest = days.reduce<Day | null>((best, d) => (!best || d.meetings > best.meetings ? d : best), null);

  const onLayout = (e: LayoutChangeEvent) => setWidth(e.nativeEvent.layout.width);

  return (
    <View
      accessible
      accessibilityLabel={`Meetings per day: ${pluralize(total, 'meeting')} over ${days.length} days${
        busiest && busiest.meetings ? `, busiest ${dayLabel(busiest.date, true)} with ${busiest.meetings}` : ''
      }.`}
    >
      <View style={styles.readout}>
        {active ? (
          <>
            <Text variant="label">{dayLabel(active.date, true)}</Text>
            <Text variant="caption" tone="secondary">
              {pluralize(active.meetings, 'meeting')} · {formatMinutes(active.minutes)}
              {active.avgScore !== null ? ` · score ${Math.round(active.avgScore)}` : ''}
            </Text>
          </>
        ) : (
          <Text variant="caption" tone="muted">
            Tap a bar for details · peak {max}/day
          </Text>
        )}
      </View>

      <View onLayout={onLayout} style={{ height: CHART_HEIGHT }}>
        {width > 0 ? (
          <>
            <Svg width={width} height={CHART_HEIGHT}>
              <Line x1={0} x2={width} y1={CHART_HEIGHT / 2} y2={CHART_HEIGHT / 2} stroke={theme.colors.border} strokeWidth={1} strokeDasharray="3 4" />
              <Line x1={0} x2={width} y1={CHART_HEIGHT - 0.5} y2={CHART_HEIGHT - 0.5} stroke={theme.colors.borderStrong} strokeWidth={1} />
              {days.map((d, i) => {
                const h = d.meetings ? Math.max(3, (d.meetings / max) * (CHART_HEIGHT - 8)) : 0;
                const dim = selected !== null && selected !== i;
                return (
                  <Path
                    key={d.date}
                    d={barPath(i * slot + GAP / 2, CHART_HEIGHT - 1 - h, barWidth, h, Math.min(4, barWidth / 2))}
                    fill={theme.colors.primary}
                    opacity={dim ? 0.35 : 1}
                  />
                );
              })}
            </Svg>
            {/* Full-height touch columns: hit targets larger than the marks. */}
            <View style={StyleSheet.absoluteFill}>
              <View style={styles.hitRow}>
                {days.map((d, i) => (
                  <Pressable
                    key={d.date}
                    accessibilityRole="button"
                    accessibilityLabel={`${dayLabel(d.date, true)}: ${pluralize(d.meetings, 'meeting')}`}
                    onPress={() => setSelected((prev) => (prev === i ? null : i))}
                    style={styles.hit}
                  />
                ))}
              </View>
            </View>
          </>
        ) : null}
      </View>

      {days.length ? (
        <View style={styles.axis}>
          <Text variant="caption" tone="muted">
            {dayLabel(days[0].date)}
          </Text>
          {days.length > 2 ? (
            <Text variant="caption" tone="muted">
              {dayLabel(days[Math.floor(days.length / 2)].date)}
            </Text>
          ) : null}
          <Text variant="caption" tone="muted">
            {dayLabel(days[days.length - 1].date)}
          </Text>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  readout: {
    minHeight: 38,
    justifyContent: 'center',
    marginBottom: 8,
  },
  hitRow: {
    flex: 1,
    flexDirection: 'row',
  },
  hit: {
    flex: 1,
  },
  axis: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 6,
  },
});
