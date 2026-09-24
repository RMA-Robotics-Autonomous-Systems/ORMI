"use client";

import { useEffect } from "react";
import { Popup, useMap } from "react-map-gl/maplibre";

import {
	getMissionContacts,
	selectContact,
	subscribeContactFocus,
	useMissionContacts,
	useSelectedContact,
} from "../state/mission-contacts-store";
import { ContactDetails } from "./contact-details";

/**
 * The open mission's selected contact on the map: a popup with everything it
 * says, and a flight to it whenever something asks to show it (the asset
 * tree). A child of the map, so a contacts read re-renders this, not the map.
 *
 * @param props.missionId - The open mission.
 */
export function MissionContactPopup(props: { missionId: string | null }) {
	const { current: map } = useMap();
	const { missionId } = props;
	const { contacts } = useMissionContacts(missionId);
	const selectedUid = useSelectedContact(missionId);
	const contact = selectedUid
		? contacts.find((c) => c.uid === selectedUid)
		: undefined;

	useEffect(() => {
		if (!map) return;
		return subscribeContactFocus((request) => {
			const target = getMissionContacts(request.missionId).contacts.find(
				(c) => c.uid === request.uid,
			);
			if (!target) return;
			map.flyTo({
				center: target.lngLat,
				zoom: Math.max(map.getZoom(), 18),
				duration: 600,
			});
		});
	}, [map]);

	if (!contact) return null;
	return (
		<Popup
			longitude={contact.lngLat[0]}
			latitude={contact.lngLat[1]}
			anchor="bottom"
			offset={12}
			maxWidth="340px"
			closeButton={false}
			closeOnClick={false}
			onClose={() => selectContact(null)}
		>
			<div className="max-h-80 overflow-y-auto">
				<ContactDetails
					contact={contact}
					onClose={() => selectContact(null)}
				/>
			</div>
		</Popup>
	);
}
