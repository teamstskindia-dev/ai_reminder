import { SubNav } from '@/components/common/sub-nav';

export function AiNav() {
  return (
    <SubNav
      items={[
        { href: '/ai', label: 'Settings', exact: true },
        { href: '/ai/prompts', label: 'Prompts' },
        { href: '/ai/playground', label: 'Playground' },
      ]}
    />
  );
}
