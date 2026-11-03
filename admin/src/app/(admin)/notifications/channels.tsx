import { Bell, Mail, Smartphone } from 'lucide-react';

import { Badge } from '@/components/ui/badge';
import type { ReminderChannel } from '@/lib/api/types';

export const CHANNEL_META: Record<ReminderChannel, { label: string; description: string; icon: typeof Bell }> = {
  push: { label: 'Push', description: 'Android push notification (Expo)', icon: Smartphone },
  in_app: { label: 'In-app', description: 'Notification centre on web and mobile', icon: Bell },
  email: { label: 'Email', description: 'Sent over SMTP when email is enabled', icon: Mail },
};

export function ChannelBadges({ channels }: { channels: ReminderChannel[] }) {
  if (!channels.length) return <span className="text-muted-foreground">—</span>;
  return (
    <div className="flex flex-wrap gap-1">
      {channels.map((c) => {
        const meta = CHANNEL_META[c];
        const Icon = meta?.icon ?? Bell;
        return (
          <Badge key={c} variant="outline" className="gap-1 font-normal">
            <Icon className="size-3" aria-hidden /> {meta?.label ?? c}
          </Badge>
        );
      })}
    </div>
  );
}
