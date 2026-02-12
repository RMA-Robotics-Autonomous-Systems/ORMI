import { ReactNode } from "react";
import { buildNavigation } from "@/lib/mdx";
import { DocsSidebar } from "@/components/docs/sidebar";
import { DocsHeader } from "@/components/docs/header";
import {
	SidebarProvider,
	Sidebar,
	SidebarContent,
	SidebarHeader,
	SidebarInset,
} from "@workspace/ui/components/sidebar";
import "./docs.css";

interface DocsLayoutProps {
	children: ReactNode;
}

export default function DocsLayout({ children }: DocsLayoutProps) {
	const navigation = buildNavigation();

	return (
		<SidebarProvider defaultOpen={true}>
			<Sidebar className="sticky h-[calc(100vh-4rem)]">
				<SidebarHeader className="border-b px-4 py-4">
					<h2 className="text-lg font-semibold">Documentation</h2>
				</SidebarHeader>
				<SidebarContent>
					<DocsSidebar navigation={navigation} />
				</SidebarContent>
			</Sidebar>
			<SidebarInset className="">
				<DocsHeader />
				<main className="flex-1">
					<div className="max-w-4xl mx-auto px-8 py-12">
						{children}
					</div>
				</main>
			</SidebarInset>
		</SidebarProvider>
	);
}
