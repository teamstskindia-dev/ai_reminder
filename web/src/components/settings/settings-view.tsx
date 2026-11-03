"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { GoogleCalendarCard } from "@/components/integrations/google-calendar-card";
import { PageHeader } from "@/components/common/page-header";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { AccountSection, BotSection, DevicesSection, NotificationsSection, ProfileSection } from "./settings-sections";

const TABS = [
  { value: "profile", label: "Profile" },
  { value: "bot", label: "Meeting bot" },
  { value: "notifications", label: "Notifications" },
  { value: "integrations", label: "Integrations" },
  { value: "devices", label: "Devices" },
  { value: "account", label: "Account" },
] as const;

type TabValue = (typeof TABS)[number]["value"];

export function SettingsView() {
  const params = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const requested = params.get("tab");
  const tab: TabValue = TABS.some((t) => t.value === requested) ? (requested as TabValue) : "profile";

  return (
    <div className="space-y-6">
      <PageHeader title="Settings" description="Manage your profile, the notetaker and how we notify you." />
      <Tabs
        value={tab}
        onValueChange={(v) => router.replace(v === "profile" ? pathname : `${pathname}?tab=${v}`, { scroll: false })}
        className="gap-6"
      >
        <div className="-mx-4 overflow-x-auto px-4 sm:mx-0 sm:px-0">
          <TabsList variant="line" className="h-10 w-max justify-start border-b">
            {TABS.map((t) => (
              <TabsTrigger key={t.value} value={t.value} className="px-3">
                {t.label}
              </TabsTrigger>
            ))}
          </TabsList>
        </div>
        <div className="max-w-3xl">
          <TabsContent value="profile">
            <ProfileSection />
          </TabsContent>
          <TabsContent value="bot">
            <BotSection />
          </TabsContent>
          <TabsContent value="notifications">
            <NotificationsSection />
          </TabsContent>
          <TabsContent value="integrations">
            <GoogleCalendarCard />
          </TabsContent>
          <TabsContent value="devices">
            <DevicesSection />
          </TabsContent>
          <TabsContent value="account">
            <AccountSection />
          </TabsContent>
        </div>
      </Tabs>
    </div>
  );
}
