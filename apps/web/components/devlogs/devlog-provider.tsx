"use client";

import {
	useCallback,
	useEffect,
	useMemo,
	useState,
	type ReactNode,
} from "react";
import { createSafeContext } from "@workspace/utils";
import { httpClient } from "@/lib/http/client";

const STORAGE_KEY = "ormi:last-devlog";

/** A devlog entry with its markdown already rendered to HTML by the API. */
export interface DevlogRendered {
	id: string;
	html: string;
}

/**
 * How the dialog was opened, which decides whether it can be dismissed:
 * - `unseen` — opened by itself because there are entries the user has not
 *   read. Modal, closable only by acknowledging.
 * - `all` — opened deliberately from the version badge. Shows the full
 *   history and closes like any other dialog.
 */
type DevlogMode = "hidden" | "unseen" | "all";

interface DevlogState {
	devlogs: DevlogRendered[];
	mode: DevlogMode;
	/** Opens the full history on demand, whatever has already been seen. */
	showAll: () => void;
	/** Closes without marking anything read; only allowed in `all` mode. */
	close: () => void;
	/** Marks the newest entry as read and closes. */
	markAsSeen: () => void;
}

const [DevlogContextProvider, useDevlogContext] =
	createSafeContext<DevlogState>("Devlog");

export { useDevlogContext };

/**
 * Owns the devlog dialog's state so that both the dialog and the navbar's
 * version badge drive one instance. Without a shared context the badge would
 * need a dialog of its own, and two copies could be open at once.
 */
export function DevlogProvider({ children }: { children: ReactNode }) {
	const [devlogs, setDevlogs] = useState<DevlogRendered[]>([]);
	const [mode, setMode] = useState<DevlogMode>("hidden");

	// On load, show only what the user has not read yet.
	useEffect(() => {
		const lastSeen = localStorage.getItem(STORAGE_KEY) ?? "";
		const url = lastSeen
			? `/api/devlogs?since=${encodeURIComponent(lastSeen)}`
			: "/api/devlogs";

		httpClient.get<DevlogRendered[]>(url).then((result) => {
			if (result.ok && result.data.length > 0) {
				setDevlogs(result.data);
				setMode("unseen");
			}
		});
	}, []);

	const showAll = useCallback(() => {
		httpClient.get<DevlogRendered[]>("/api/devlogs").then((result) => {
			if (result.ok) {
				setDevlogs(result.data);
				setMode("all");
			}
		});
	}, []);

	const close = useCallback(() => setMode("hidden"), []);

	const markAsSeen = useCallback(() => {
		const latestId = devlogs[0]?.id;
		if (latestId) localStorage.setItem(STORAGE_KEY, latestId);
		setDevlogs([]);
		setMode("hidden");
	}, [devlogs]);

	const value = useMemo(
		() => ({ devlogs, mode, showAll, close, markAsSeen }),
		[devlogs, mode, showAll, close, markAsSeen],
	);

	return (
		<DevlogContextProvider value={value}>{children}</DevlogContextProvider>
	);
}
