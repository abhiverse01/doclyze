import { AppShell } from "@/components/doclyze/app-shell";
import { ErrorBoundaryWrapper } from "@/components/doclyze/error-boundary";

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <AppShell>
      <ErrorBoundaryWrapper>{children}</ErrorBoundaryWrapper>
    </AppShell>
  );
}
