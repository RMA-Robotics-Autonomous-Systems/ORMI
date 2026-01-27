import { ReactNode } from "react";
import { buildNavigation, getVersions } from "@/lib/mdx";
import { DocsSidebar } from "@/components/docs/sidebar";
import { DocsVersionSwitcher } from "@/components/docs/version-switcher";
import { DocsHeader } from "@/components/docs/header";
import {
  SidebarProvider,
  Sidebar,
  SidebarContent,
  SidebarHeader,
  SidebarInset,
} from "@workspace/ui/components/sidebar";
import "../docs.css";

interface DocsLayoutProps {
  children: ReactNode;
  params: Promise<{
    version: string;
  }>;
}

export default async function DocsLayout({
  children,
  params,
}: DocsLayoutProps) {
  const { version } = await params;
  const versions = getVersions();
  const navigation = await buildNavigation(version);

  return (
    <SidebarProvider defaultOpen={true}>
      <Sidebar className="sticky h-[calc(100vh-4rem)]">
        <SidebarHeader className="border-b px-4 py-4">
          <h2 className="text-lg font-semibold mb-3">Documentation</h2>
          <DocsVersionSwitcher currentVersion={version} versions={versions} />
        </SidebarHeader>
        <SidebarContent>
          <DocsSidebar navigation={navigation} currentVersion={version} />
        </SidebarContent>
      </Sidebar>
      <SidebarInset className="">
        <DocsHeader />
        <main className="flex-1">
          <div className="max-w-4xl mx-auto px-8 py-12">{children}</div>
        </main>
      </SidebarInset>
    </SidebarProvider>
  );
}
