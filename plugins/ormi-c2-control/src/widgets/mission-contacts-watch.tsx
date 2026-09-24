"use client";

import {
	type RemoteCallDefinition,
	useRemoteCall,
} from "@workspace/ormi-core/datasources";
import { useEffect } from "react";

import { watchMissionContacts } from "../state/mission-contacts-store";
import { parseMissionContacts } from "./mission-contacts";

/**
 * Keep a mission's contacts current in the contacts store while mounted.
 * Renders nothing, and is its own component on purpose: every call re-renders
 * whoever holds `useRemoteCall`, and that should be this, not the map.
 *
 * The poll is shared (`watchMissionContacts`): the map and the asset tree
 * watching the same mission read the route once per interval.
 *
 * @param props.missionId - The mission to watch.
 * @param props.def - The `c2.missions.contacts` call.
 */
export function MissionContactsWatch(props: {
	missionId: string;
	def: RemoteCallDefinition;
}) {
	const { execute } = useRemoteCall<{ mission_id: string }, unknown>(
		props.def,
	);
	const { missionId } = props;
	useEffect(
		() =>
			watchMissionContacts(missionId, async () => {
				const result = await execute({ mission_id: missionId });
				return result.success
					? {
							ok: true,
							contacts: parseMissionContacts(
								result.data,
								missionId,
							),
						}
					: {
							ok: false,
							error:
								result.error ??
								"the contacts could not be read",
						};
			}),
		[missionId, execute],
	);
	return null;
}
