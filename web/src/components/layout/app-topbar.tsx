"use client";

import { Menu, Plus, UploadCloud } from "lucide-react";
import { useState } from "react";
import { Logo } from "@/components/brand/logo";
import { AddMeetingDialog } from "@/components/meetings/add-meeting-dialog";
import { UploadRecordingDialog } from "@/components/meetings/upload-recording-dialog";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetDescription, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { useFeature } from "@/providers/config-provider";
import { SidebarContent } from "./app-sidebar";
import { GlobalSearch } from "./global-search";
import { NotificationsBell } from "./notifications-bell";
import { TopbarUserMenu } from "./user-menu";

function MobileSidebar() {
  const [open, setOpen] = useState(false);
  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <Button variant="ghost" size="icon-lg" className="md:hidden" aria-label="Open navigation">
          <Menu />
        </Button>
      </SheetTrigger>
      <SheetContent side="left" className="w-64 border-sidebar-border bg-sidebar p-0 text-sidebar-foreground" showCloseButton={false}>
        <SheetTitle className="sr-only">Navigation</SheetTitle>
        <SheetDescription className="sr-only">App sections</SheetDescription>
        <SidebarContent onNavigate={() => setOpen(false)} />
      </SheetContent>
    </Sheet>
  );
}

export function AppTopbar() {
  const uploads = useFeature("meetingUpload");

  return (
    <header className="sticky top-0 z-20 border-b bg-background/85 backdrop-blur-lg">
      <div className="flex h-16 items-center gap-2 px-3 sm:gap-3 sm:px-6 lg:px-8">
        <MobileSidebar />
        <span className="md:hidden">
          <Logo iconOnly />
        </span>
        <GlobalSearch className="hidden sm:block" />
        <div className="ml-auto flex items-center gap-1.5 sm:gap-2">
          {uploads && (
            <UploadRecordingDialog
              trigger={
                <Button variant="outline" aria-label="Upload recording" className="px-2.5">
                  <UploadCloud /> <span className="hidden lg:inline">Upload recording</span>
                </Button>
              }
            />
          )}
          <AddMeetingDialog
            trigger={
              <Button aria-label="Add meeting" className="px-2.5">
                <Plus /> <span className="hidden sm:inline">Add meeting</span>
              </Button>
            }
          />
          <NotificationsBell />
          <TopbarUserMenu className="ml-1" />
        </div>
      </div>
      <div className="px-3 pb-3 sm:hidden">
        <GlobalSearch className="max-w-none" />
      </div>
    </header>
  );
}
