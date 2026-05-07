"use client";

import { useEffect, useState } from "react";
import { httpClient } from "@/lib/http/client";

const STORAGE_KEY = "ormi:last-devlog";

export interface DevlogRendered {
	id: string;
	html: string;
}

export function useDevlogs() {
	const [devlogs, setDevlogs] = useState<DevlogRendered[]>([]);

	useEffect(() => {
		const lastSeen = localStorage.getItem(STORAGE_KEY) ?? "";
		const url = lastSeen
			? `/api/devlogs?since=${encodeURIComponent(lastSeen)}`
			: "/api/devlogs";

		httpClient.get<DevlogRendered[]>(url).then((result) => {
			if (result.ok && result.data.length > 0) {
				setDevlogs(result.data);
			}
		});
	}, []);

	function markAsSeen() {
		if (devlogs.length === 0) return;
		const latestId = devlogs[0]!.id;
		localStorage.setItem(STORAGE_KEY, latestId);
		setDevlogs([]);
	}

	return { devlogs, markAsSeen };
}
