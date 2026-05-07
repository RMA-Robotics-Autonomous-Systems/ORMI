"use client";

import { ReactNode } from "react";
import { Provider as JotaiProvider } from "jotai";
import { ThemeProvider } from "@/components/theme-provider";
import { AuthProvider } from "@/components/session-provider";
import { PluginsProvider } from "@workspace/ormi-plugins";
import { NavbarProvider } from "@workspace/ui/combined/navbar/navbar-provider";
import registry from "../ormi-plugins";
import { transformStore } from "@workspace/ormi-core/transforms";
import { SyncProvider } from "@/components/sync-provider";

interface ClientProvidersProps {
	children: ReactNode;
	navbarLeft: any;
	navbarRight: any;
}

export function ClientProviders({
	children,
	navbarLeft,
	navbarRight,
}: ClientProvidersProps) {
	return (
		<JotaiProvider store={transformStore}>
			<ThemeProvider>
				<AuthProvider>
					<PluginsProvider PluginsInfo={registry}>
						<SyncProvider>
							<NavbarProvider
								left={navbarLeft}
								right={navbarRight}
							>
								{children}
							</NavbarProvider>
						</SyncProvider>
					</PluginsProvider>
				</AuthProvider>
			</ThemeProvider>
		</JotaiProvider>
	);
}
