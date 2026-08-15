"use client";

import * as React from "react";
import Link from "next/link";
import { Menu, Search } from "lucide-react";
import { Sidebar } from "./sidebar";
import { CommandPalette, openCommandPalette } from "./command-palette";
import { SettingsPanel } from "./settings-panel";
import { Button } from "@/components/ui/button";
import { Logo } from "./logo";

export function AppShell({ children }: { children: React.ReactNode }) {
  const [mobileSidebarOpen, setMobileSidebarOpen] = React.useState(false);
  const [settingsOpen, setSettingsOpen] = React.useState(false);

  return (
    <div className="flex h-screen w-full overflow-hidden bg-background">
      <Sidebar
        mobileOpen={mobileSidebarOpen}
        onCloseMobile={() => setMobileSidebarOpen(false)}
        onOpenSettings={() => setSettingsOpen(true)}
      />

      <div className="flex-1 flex flex-col min-w-0">
        {/* Mobile top bar */}
        <header className="md:hidden flex items-center justify-between border-b border-border bg-background px-4 py-3 shrink-0">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => setMobileSidebarOpen(true)}
            aria-label="Open sidebar"
            className="h-8 w-8"
          >
            <Menu className="h-4 w-4" />
          </Button>
          <Link
            href="/"
            className="flex items-center"
            aria-label="Go to homepage"
          >
            <Logo height={20} />
          </Link>
          <Button
            variant="ghost"
            size="icon"
            onClick={openCommandPalette}
            aria-label="Open command palette"
            className="h-8 w-8"
          >
            <Search className="h-4 w-4" />
          </Button>
        </header>

        <main className="flex-1 flex flex-col overflow-hidden" role="main">
          {children}
        </main>
      </div>

      {/* Command Palette */}
      <CommandPalette
        onOpenSettings={() => setSettingsOpen(true)}
      />

      {/* Settings Dialog - rendered at AppShell level so both sidebar and command palette can open it */}
      <SettingsPanel open={settingsOpen} onOpenChange={setSettingsOpen} />
    </div>
  );
}
