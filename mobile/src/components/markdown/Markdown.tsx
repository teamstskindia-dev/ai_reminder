import { Fragment, useMemo, type ReactNode } from 'react';
import { Platform, StyleSheet, Text as RNText, View, type StyleProp, type TextStyle, type ViewStyle } from 'react-native';

import { useTheme, type AppTheme } from '@/theme/ThemeProvider';
import { openLink } from '@/utils/links';

import { parseMarkdown, type Block, type Inline } from './parse';

export interface MarkdownProps {
  children: string;
  /** Base text size. */
  size?: 'body' | 'callout';
  /** Base text colour (e.g. on a primary-coloured chat bubble). */
  color?: string;
  linkColor?: string;
  onLinkPress?: (href: string) => void;
  onCitationPress?: (index: number) => void;
  style?: StyleProp<ViewStyle>;
}

const MONO = Platform.select({ ios: 'Menlo', default: 'monospace' });

interface RenderContext {
  theme: AppTheme;
  base: TextStyle;
  textColor: string;
  linkColor: string;
  onLinkPress: (href: string) => void;
  onCitationPress?: (index: number) => void;
}

function renderInlines(nodes: Inline[], ctx: RenderContext, keyPrefix = 'i'): ReactNode[] {
  return nodes.map((node, index) => {
    const key = `${keyPrefix}-${index}`;
    switch (node.type) {
      case 'text':
        return <Fragment key={key}>{node.text}</Fragment>;
      case 'break':
        return <Fragment key={key}>{'\n'}</Fragment>;
      case 'strong':
        return (
          <RNText key={key} style={styles.strong}>
            {renderInlines(node.children, ctx, key)}
          </RNText>
        );
      case 'em':
        return (
          <RNText key={key} style={styles.em}>
            {renderInlines(node.children, ctx, key)}
          </RNText>
        );
      case 'del':
        return (
          <RNText key={key} style={styles.del}>
            {renderInlines(node.children, ctx, key)}
          </RNText>
        );
      case 'code':
        return (
          <RNText
            key={key}
            style={{ fontFamily: MONO, fontSize: (ctx.base.fontSize ?? 15) - 1, backgroundColor: ctx.theme.colors.surfaceMuted }}
          >
            {` ${node.text} `}
          </RNText>
        );
      case 'link':
        return (
          <RNText
            key={key}
            accessibilityRole="link"
            onPress={() => ctx.onLinkPress(node.href)}
            style={[styles.link, { color: ctx.linkColor }]}
          >
            {renderInlines(node.children, ctx, key)}
          </RNText>
        );
      case 'cite': {
        const n = Number(node.label);
        const press = ctx.onCitationPress;
        return (
          <RNText
            key={key}
            accessibilityRole={press ? 'button' : undefined}
            accessibilityLabel={`Source ${node.label}`}
            onPress={press ? () => press(n) : undefined}
            style={[styles.cite, { color: ctx.linkColor }]}
          >
            {`[${node.label}]`}
          </RNText>
        );
      }
    }
  });
}

const HEADING_SIZE: Record<number, number> = { 1: 22, 2: 19, 3: 17, 4: 16, 5: 15, 6: 15 };

function renderBlock(block: Block, index: number, ctx: RenderContext): ReactNode {
  const { theme, base } = ctx;
  const key = `b-${index}`;
  switch (block.type) {
    case 'heading': {
      const fontSize = HEADING_SIZE[block.level] ?? 16;
      return (
        <RNText
          key={key}
          accessibilityRole="header"
          style={[base, { fontSize, lineHeight: Math.round(fontSize * 1.3), fontWeight: '700', marginTop: index === 0 ? 0 : 6 }]}
        >
          {renderInlines(block.children, ctx, key)}
        </RNText>
      );
    }
    case 'paragraph':
      return (
        <RNText key={key} style={base}>
          {renderInlines(block.children, ctx, key)}
        </RNText>
      );
    case 'quote':
      return (
        <View key={key} style={[styles.quote, { borderLeftColor: theme.colors.primarySoft }]}>
          <RNText style={[base, { color: theme.colors.textSecondary, fontStyle: 'italic' }]}>
            {renderInlines(block.children, ctx, key)}
          </RNText>
        </View>
      );
    case 'code':
      return (
        <View key={key} style={[styles.codeBlock, { backgroundColor: theme.colors.surfaceMuted, borderRadius: theme.radii.sm }]}>
          <RNText style={{ fontFamily: MONO, fontSize: 13, lineHeight: 19, color: ctx.textColor }}>{block.text}</RNText>
        </View>
      );
    case 'rule':
      return <View key={key} style={[styles.rule, { backgroundColor: theme.colors.border }]} />;
    case 'list':
      return (
        <View key={key} style={styles.list}>
          {block.items.map((item, i) => {
            const marker = block.ordered ? `${block.start + i}.` : item.level % 2 === 0 ? '•' : '◦';
            return (
              <View key={`${key}-${i}`} style={[styles.listItem, { paddingLeft: item.level * 16 }]}>
                <RNText style={[base, styles.marker, { color: block.ordered ? ctx.textColor : theme.colors.primaryText }]}>
                  {marker}
                </RNText>
                <RNText style={[base, styles.listText]}>{renderInlines(item.children, ctx, `${key}-${i}`)}</RNText>
              </View>
            );
          })}
        </View>
      );
  }
}

/** Themed markdown renderer for AI summaries, Ask-AI answers and CMS pages. */
export function Markdown({ children, size = 'body', color, linkColor, onLinkPress, onCitationPress, style }: MarkdownProps) {
  const theme = useTheme();
  const blocks = useMemo(() => parseMarkdown(children ?? ''), [children]);
  const textColor = color ?? theme.colors.text;
  const ctx: RenderContext = {
    theme,
    base: { ...theme.typography[size], color: textColor },
    textColor,
    linkColor: linkColor ?? theme.colors.primaryText,
    onLinkPress: onLinkPress ?? ((href) => void openLink(href)),
    onCitationPress,
  };
  return <View style={[styles.container, style]}>{blocks.map((block, i) => renderBlock(block, i, ctx))}</View>;
}

const styles = StyleSheet.create({
  container: {
    gap: 10,
  },
  strong: {
    fontWeight: '700',
  },
  em: {
    fontStyle: 'italic',
  },
  del: {
    textDecorationLine: 'line-through',
  },
  link: {
    textDecorationLine: 'underline',
  },
  cite: {
    fontSize: 12,
    fontWeight: '700',
  },
  quote: {
    borderLeftWidth: 3,
    paddingLeft: 12,
  },
  codeBlock: {
    padding: 12,
  },
  rule: {
    height: StyleSheet.hairlineWidth,
    marginVertical: 4,
  },
  list: {
    gap: 6,
  },
  listItem: {
    flexDirection: 'row',
    gap: 8,
  },
  marker: {
    minWidth: 14,
    fontWeight: '700',
  },
  listText: {
    flex: 1,
  },
});
