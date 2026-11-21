import { ArrowDownRight, ArrowRight, ArrowUpRight, BatteryLow, Sparkles } from 'lucide-react-native';
import { StyleSheet, View } from 'react-native';

import { useMoodInsights } from '@/api/hooks/memory';
import { Card } from '@/components/ui/Card';
import { Chip } from '@/components/ui/Chip';
import { Skeleton } from '@/components/ui/Skeleton';
import { Text } from '@/components/ui/Text';
import { moodEmoji } from '@/features/companion/mood';
import { useTheme } from '@/theme/ThemeProvider';

const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const DAY_NAMES = ['Sundays', 'Mondays', 'Tuesdays', 'Wednesdays', 'Thursdays', 'Fridays', 'Saturdays'];
/** Monday first, the way people think about their week. */
const ORDER = [1, 2, 3, 4, 5, 6, 0];
const BAR_MAX = 64;

/**
 * Mood and energy insights on You (user-flow §10): weekly patterns from evening check-ins, the trend, and what
 * lifts and drains the user (refreshed weekly by night learning).
 */
export function MoodInsightsCard() {
  const theme = useTheme();
  const query = useMoodInsights();
  const m = query.data;

  return (
    <View style={styles.group}>
      <Text variant="micro" tone="muted" style={styles.title}>
        MOOD AND ENERGY
      </Text>
      <Card>
        {query.isPending ? (
          <Skeleton height={120} />
        ) : !m || m.checkins < 3 ? (
          <View style={styles.row}>
            <Sparkles size={18} color={theme.colors.primaryText} />
            <Text variant="callout" tone="secondary" style={styles.flex}>
              After a few evening check-ins I’ll show your weekly patterns here: which days feel good, and what lifts or drains you.
            </Text>
          </View>
        ) : (
          <View style={styles.body}>
            <View style={styles.stats}>
              <Stat label="Mood (4 weeks)" value={m.averageMood !== null ? `${moodEmoji(Math.round(m.averageMood))} ${m.averageMood}` : '–'} />
              <Stat label="Energy" value={m.averageEnergy !== null ? `${m.averageEnergy}/5` : '–'} />
              <Stat
                label="This week"
                value={m.trend === 'up' ? 'Better' : m.trend === 'down' ? 'Lower' : m.trend === 'flat' ? 'Steady' : '–'}
                icon={m.trend === 'up' ? ArrowUpRight : m.trend === 'down' ? ArrowDownRight : m.trend === 'flat' ? ArrowRight : undefined}
              />
            </View>

            <View accessibilityLabel="Average mood by weekday" style={styles.bars}>
              {ORDER.map((d) => {
                const w = m.weekdays.find((x) => x.weekday === d);
                const h = w?.mood ? Math.max(6, (w.mood / 5) * BAR_MAX) : 4;
                const best = m.bestDay === d;
                const hard = m.hardestDay === d;
                return (
                  <View key={d} style={styles.barCol}>
                    <View style={[styles.barTrack, { height: BAR_MAX }]}>
                      <View
                        style={{
                          height: h,
                          borderRadius: 4,
                          backgroundColor: best
                            ? theme.colors.success
                            : hard
                              ? theme.colors.warning
                              : w?.mood
                                ? theme.colors.primary
                                : theme.colors.border,
                        }}
                      />
                    </View>
                    <Text variant="micro" tone={best || hard ? 'default' : 'muted'}>
                      {DAYS[d]}
                    </Text>
                  </View>
                );
              })}
            </View>
            {m.bestDay !== null && m.hardestDay !== null ? (
              <Text variant="caption" tone="secondary">
                {DAY_NAMES[m.bestDay]} usually feel best; {DAY_NAMES[m.hardestDay].toLowerCase()} are harder.
              </Text>
            ) : null}

            {m.note ? (
              <Text variant="callout" style={styles.note}>
                {m.note}
              </Text>
            ) : null}
            {m.lifts.length ? (
              <View style={styles.item}>
                <Text variant="caption" tone="muted">
                  What lifts you
                </Text>
                <View style={styles.chips}>
                  {m.lifts.map((l) => (
                    <Chip key={l} label={l} tone="success" size="sm" icon={Sparkles} />
                  ))}
                </View>
              </View>
            ) : null}
            {m.drains.length ? (
              <View style={styles.item}>
                <Text variant="caption" tone="muted">
                  What drains you
                </Text>
                <View style={styles.chips}>
                  {m.drains.map((d) => (
                    <Chip key={d} label={d} tone="warning" size="sm" icon={BatteryLow} />
                  ))}
                </View>
              </View>
            ) : null}
          </View>
        )}
      </Card>
    </View>
  );
}

function Stat({ label, value, icon: Icon }: { label: string; value: string; icon?: typeof ArrowRight }) {
  const theme = useTheme();
  return (
    <View style={styles.stat}>
      <Text variant="caption" tone="muted">
        {label}
      </Text>
      <View style={styles.statValue}>
        {Icon ? <Icon size={16} color={theme.colors.text} /> : null}
        <Text variant="subheading">{value}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  group: {
    gap: 8,
  },
  title: {
    paddingHorizontal: 4,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  flex: {
    flex: 1,
  },
  body: {
    gap: 14,
  },
  stats: {
    flexDirection: 'row',
    gap: 12,
  },
  stat: {
    flex: 1,
    gap: 2,
  },
  statValue: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  bars: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-end',
  },
  barCol: {
    flex: 1,
    alignItems: 'center',
    gap: 4,
  },
  barTrack: {
    width: 14,
    justifyContent: 'flex-end',
  },
  note: {
    fontStyle: 'italic',
  },
  item: {
    gap: 6,
  },
  chips: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
  },
});
