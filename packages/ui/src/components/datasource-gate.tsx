import * as React from "react";

import { DatasourceOffline } from "@workspace/ui/components/datasource-offline";

/**
 * Widget-facing datasource health this gate understands.
 *
 * Declared locally as a narrow union so `@workspace/ui` stays free of an
 * `ormi-core` dependency (presentational layer only). Mirrors the
 * `DatasourceHealth` union exposed by datasource providers.
 */
export type DatasourceHealthLike = "connecting" | "online" | "offline";

/** Props for {@link DatasourceGate}. */
export interface DatasourceGateProps {
	/** Current health of the backing datasource. */
	health: DatasourceHealthLike;
	/** Display title of the backing datasource (shown while not online). */
	title: string;
	/** Widget body to render once the datasource is online. */
	children: React.ReactNode;
}

/**
 * Conditional wrapper that shows a widget's body only while its backing
 * datasource is `online`, and otherwise renders the standard display-only
 * offline/connecting affordance.
 *
 * This centralizes the "render body when online, else show offline state"
 * decision so every single-topic display widget gates identically. It holds no
 * state and renders nothing interactive.
 *
 * @param props - Component props.
 * @returns The children when online; otherwise a {@link DatasourceOffline}
 * affordance describing the `connecting` or `offline` state.
 */
export function DatasourceGate(props: DatasourceGateProps) {
	const { health, title, children } = props;

	if (health !== "online") {
		// health narrows to "connecting" | "offline" here.
		return <DatasourceOffline title={title} health={health} />;
	}

	return <>{children}</>;
}
