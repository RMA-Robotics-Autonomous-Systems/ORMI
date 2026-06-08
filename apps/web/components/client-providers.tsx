"use client";

import { ReactNode } from "react";
import { Provider as JotaiProvider } from "jotai";
import { ThemeProvider } from "@/components/theme-provider";
import { AuthProvider } from "@/components/session-provider";
import { PluginsProvider } from "@workspace/ormi-plugins";
import { NavbarProvider } from "@workspace/ui/combined/navbar/navbar-provider";
import registry from "../ormi-plugins";
import { transformStore } from "@workspace/ormi-core/transforms";
import { DevlogDialog } from "@/components/devlogs/devlog-dialog";

interface ClientProvidersProps {
	children: ReactNode;
}

export function ClientProviders({ children }: ClientProvidersProps) {
	return (
		<JotaiProvider store={transformStore}>
			<ThemeProvider>
				<AuthProvider>
					<PluginsProvider PluginsInfo={registry}>
						<NavbarProvider>
							{children}
							<DevlogDialog />
						</NavbarProvider>
					</PluginsProvider>
				</AuthProvider>
			</ThemeProvider>
		</JotaiProvider>
	);
}
