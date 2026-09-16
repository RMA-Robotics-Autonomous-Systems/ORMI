"use client";

import { ReactNode } from "react";
import { Provider as JotaiProvider } from "jotai";
import { ThemeProvider } from "@/components/theme-provider";
import { AuthProvider } from "@/components/session-provider";
import { PluginsProvider } from "@workspace/ormi-plugins";
import { NavbarProvider } from "@workspace/ui/combined/navbar/navbar-provider";
import registry from "../ormi-plugins";
import { appStore } from "@workspace/ormi-core";
import { DevlogDialog } from "@/components/devlogs/devlog-dialog";
import { DevlogProvider } from "@/components/devlogs/devlog-provider";
import { DiagnosticsHost } from "@/components/diagnostics/diagnostics-host";

interface ClientProvidersProps {
	children: ReactNode;
}

export function ClientProviders({ children }: ClientProvidersProps) {
	return (
		<JotaiProvider store={appStore}>
			<ThemeProvider>
				<AuthProvider>
					<PluginsProvider PluginsInfo={registry}>
						<NavbarProvider>
							{/* Inside NavbarProvider: the navbar's version
							    badge opens the dialog, so both must share one
							    devlog state. */}
							<DevlogProvider>
								{children}
								<DevlogDialog />
								<DiagnosticsHost />
							</DevlogProvider>
						</NavbarProvider>
					</PluginsProvider>
				</AuthProvider>
			</ThemeProvider>
		</JotaiProvider>
	);
}
