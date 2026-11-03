import { SubNav } from '@/components/common/sub-nav';

export function NotificationsNav() {
  return (
    <SubNav
      items={[
        { href: '/notifications', label: 'Settings', exact: true },
        { href: '/notifications/templates', label: 'Templates' },
        { href: '/notifications/broadcasts', label: 'Broadcasts' },
      ]}
    />
  );
}
