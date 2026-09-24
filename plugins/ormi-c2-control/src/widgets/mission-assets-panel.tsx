"use client";

import { ControlElement, VerticalLayout } from "@jsonforms/core";
import {
	RemoteCallDefinition,
	useAvailableRemoteCalls,
	useRemoteCall,
} from "@workspace/ormi-core/datasources";
import { WidgetDefinition } from "@workspace/ormi-core/widgets";
import { Badge } from "@workspace/ui/components/badge";
import { Button } from "@workspace/ui/components/button";
import { Input } from "@workspace/ui/components/input";
import { Label } from "@workspace/ui/components/label";
import { ScrollArea } from "@workspace/ui/components/scroll-area";
import {
	TreeView,
	type TreeDataItem,
} from "@workspace/ui/components/tree-view";
import {
	Boxes,
	Crosshair,
	Download,
	Loader2,
	MapPin,
	Radar,
	Save,
	Square,
	Trash2,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";

import { c2DatasourceSelectHook } from "../datasource/datasource-select";
import { C2Call } from "../datasource/remote-calls";
import {
	focusAsset,
	selectAsset,
	useSelectedAsset,
} from "../state/asset-focus-store";
import {
	adoptStoredAssets,
	editMissionAssets,
	hasMissionAssets,
	useMissionAssets,
	useMissionAssetsDirty,
} from "../state/mission-assets-store";
import {
	focusContact,
	selectContact,
	useMissionContacts,
	useSelectedContact,
} from "../state/mission-contacts-store";
import { useMissionGraph } from "../state/mission-graph-store";
import { saveMissionWithGraph } from "../state/mission-save";
import { useActiveMap, useSelectedMission } from "../state/selection-store";
import type { C2Feature } from "../types/c2-types";
import { normalizeMapFeatures } from "./map-registry";
import { assetTree, importableAssets, renameAsset } from "./mission-asset-tree";
import { assetId, findAsset, importAsset, removeAsset } from "./mission-assets";
import { ContactDetails } from "./contact-details";
import { contactName } from "./mission-contacts";
import { MissionContactsWatch } from "./mission-contacts-watch";
import { generateMissionId } from "./mission-list";
import { PanelEmptyState } from "./panel-empty-state";
import { useAsyncAction } from "./use-async-action";

/**
 * The open mission's assets, as a tree.
 *
 * A mission is a map, its assets and a graph. This panel lists the assets —
 * waypoints, zones, cues — with the graph nodes that use each one, and the
 * map's own ones that can be imported (as a copy, under a new id). Picking an
 * asset here selects it on the mission map (which flies to it) and in the
 * graph editor (which selects the nodes that use it); picking one on the map
 * selects it here (`state/asset-focus-store.ts`).
 *
 * It edits the same working copy as the map and the graph editor
 * (`state/mission-assets-store.ts`): a rename, a delete or an import is
 * unsaved until Save mission, from here or from either of them.
 *
 * Under them, the mission's CONTACTS: what its robots' sensors found, as the
 * fog stores them (`state/mission-contacts-store.ts`). Read-only — a contact
 * is a report, not something the operator authors. Picking one shows all it
 * says below the tree and on the map, which flies to it.
 */

/** Props for the mission-assets widget. */
interface MissionAssetsProps extends Record<string, unknown> {
	title: string;
	/** Pin to a specific C2 datasource id; empty → first available. */
	datasource_id?: string;
}

const GROUP_ICON = { waypoint: MapPin, zone: Square, cue: Crosshair };

/** Resolve a C2 call definition by name from the available remote calls. */
function findCall(
	calls: RemoteCallDefinition[],
	name: string,
): RemoteCallDefinition | undefined {
	return calls.find((call) => call.name === name);
}

function MissionAssetsBody(props: {
	listDef: RemoteCallDefinition;
	saveDef?: RemoteCallDefinition;
	featuresListDef?: RemoteCallDefinition;
	contactsDef?: RemoteCallDefinition;
}) {
	const missionId = useSelectedMission();
	const contacts = useMissionContacts(missionId);
	const selectedContactUid = useSelectedContact(missionId);
	const assets = useMissionAssets(missionId);
	const dirty = useMissionAssetsDirty(missionId);
	const graph = useMissionGraph(missionId);
	const selected = useSelectedAsset(missionId);
	const activeMap = useActiveMap();

	const missionsList = useRemoteCall<Record<string, never>, unknown>(
		props.listDef,
	);
	const missionsSave = useRemoteCall<{ mission: unknown }, unknown>(
		props.saveDef ?? props.listDef,
	);
	const featuresList = useRemoteCall<{ name: string }, unknown>(
		props.featuresListDef ?? props.listDef,
	);
	const { execute: executeMissionsList } = missionsList;
	const { execute: executeFeaturesList } = featuresList;
	const { pending, run } = useAsyncAction<string>();
	// Messages belong to the mission they are about: another mission opened
	// here does not show them.
	const [message, setMessage] = useState<{
		missionId: string;
		text: string;
		error: boolean;
	} | null>(null);
	const setError = useCallback(
		(text: string | null) =>
			setMessage(
				text && missionId ? { missionId, text, error: true } : null,
			),
		[missionId],
	);
	const setNotice = useCallback(
		(text: string | null) =>
			setMessage(
				text && missionId ? { missionId, text, error: false } : null,
			),
		[missionId],
	);
	const shown = message && message.missionId === missionId ? message : null;
	const error = shown?.error ? shown.text : null;
	const notice = shown && !shown.error ? shown.text : null;
	const [library, setLibrary] = useState<{
		map: string;
		features: C2Feature[];
	} | null>(null);

	// The mission's assets, when no other panel has loaded them yet.
	useEffect(() => {
		if (!missionId || hasMissionAssets(missionId)) return;
		let cancelled = false;
		void (async () => {
			const result = await executeMissionsList({});
			if (cancelled) return;
			if (!result.success) {
				setError(result.error ?? "Failed to read the mission store");
				return;
			}
			if (!hasMissionAssets(missionId))
				adoptStoredAssets(missionId, result.data, activeMap ?? "");
		})();
		return () => {
			cancelled = true;
		};
	}, [missionId, executeMissionsList, activeMap, setError]);

	// The map's own waypoints, zones and cues: what can be imported.
	const mapName = assets?.map ?? "";
	useEffect(() => {
		if (!mapName || !props.featuresListDef) return;
		let cancelled = false;
		void (async () => {
			const result = await executeFeaturesList({ name: mapName });
			if (cancelled || !result.success) return;
			setLibrary({
				map: mapName,
				features: importableAssets(normalizeMapFeatures(result.data)),
			});
		})();
		return () => {
			cancelled = true;
		};
	}, [mapName, props.featuresListDef, executeFeaturesList]);

	const groups = useMemo(
		() => (assets ? assetTree(assets, graph) : []),
		[assets, graph],
	);

	const show = useCallback(
		(featureId: string) => {
			if (!missionId) return;
			selectContact(null);
			focusAsset({ missionId, featureId });
		},
		[missionId],
	);

	const showContact = useCallback(
		(uid: string) => {
			if (!missionId) return;
			selectAsset(null);
			focusContact({ missionId, uid });
		},
		[missionId],
	);

	const importOne = useCallback(
		(feature: C2Feature) => {
			if (!missionId) return;
			const id = generateMissionId();
			editMissionAssets(
				missionId,
				(current) =>
					importAsset(
						current.map ? current : { ...current, map: mapName },
						feature,
						id,
					).assets,
			);
			selectContact(null);
			selectAsset({ missionId, featureId: id });
			setNotice(null);
		},
		[missionId, mapName, setNotice],
	);

	const data = useMemo<TreeDataItem[]>(() => {
		const tree: TreeDataItem[] = groups.map((group) => ({
			id: `group:${group.type}`,
			name: `${group.label} (${group.leaves.length})`,
			icon: GROUP_ICON[group.type],
			children: group.leaves.map((leaf) => ({
				id: leaf.featureId,
				name:
					leaf.usedBy.length > 0
						? `${leaf.name} · used ${leaf.usedBy.length}×`
						: `${leaf.name} · unused`,
				icon: GROUP_ICON[group.type],
			})),
		}));
		// Only where contacts can be read (or were, by another widget).
		if (props.contactsDef || contacts.loaded)
			tree.push({
				id: "group:contacts",
				name: contacts.loaded
					? `Contacts (${contacts.contacts.length})`
					: "Contacts",
				icon: Radar,
				children: contacts.contacts.map((contact) => ({
					id: `contact:${contact.uid}`,
					name:
						contact.visits.length > 0
							? `${contactName(contact)} · visited`
							: contactName(contact),
					icon: Radar,
				})),
			});
		if (library && library.map === mapName && library.features.length > 0) {
			tree.push({
				id: "group:library",
				name: `On map ${mapName} — import a copy (${library.features.length})`,
				icon: Download,
				children: library.features.map((feature) => ({
					id: `library:${assetId(feature)}`,
					name: `${String(feature.properties?.name ?? assetId(feature))} · ${String(feature.properties?.feature_type)}`,
					icon: Download,
					actions: (
						<Button
							size="icon-sm"
							variant="ghost"
							className="h-6 w-6"
							title="Import a copy into this mission"
							aria-label="Import into mission"
							onClick={(event) => {
								event.stopPropagation();
								importOne(feature);
							}}
						>
							<Download />
						</Button>
					),
				})),
			});
		}
		return tree;
	}, [groups, contacts, props.contactsDef, library, mapName, importOne]);

	const save = useCallback(() => {
		if (!missionId) return;
		if (!props.saveDef) {
			setError("c2.missions.save is unavailable");
			return;
		}
		return run("save", async () => {
			const result = await saveMissionWithGraph(missionId, {
				list: () => executeMissionsList({}),
				save: (doc) => missionsSave.execute({ mission: doc }),
			});
			if (!result.ok) {
				setError(result.error);
				return;
			}
			setError(null);
			setNotice(
				result.keptDirty
					? "Saved — but newer edits were kept and are still unsaved."
					: "Mission saved.",
			);
		});
	}, [
		missionId,
		props.saveDef,
		run,
		executeMissionsList,
		missionsSave,
		setError,
		setNotice,
	]);

	if (!missionId) {
		return (
			<PanelEmptyState>
				Select a mission to see its assets.
			</PanelEmptyState>
		);
	}
	if (!assets) {
		return (
			<PanelEmptyState>
				{error ?? "Loading the mission's assets…"}
			</PanelEmptyState>
		);
	}

	const selectedContact = selectedContactUid
		? contacts.contacts.find(
				(contact) => contact.uid === selectedContactUid,
			)
		: undefined;
	const selectedFeature =
		!selectedContact && selected ? findAsset(assets, selected) : undefined;
	const treeSelection = selectedContact
		? `contact:${selectedContact.uid}`
		: selected;
	const selectedUses =
		groups
			.flatMap((group) => group.leaves)
			.find((leaf) => leaf.featureId === selected)?.usedBy ?? [];

	return (
		<div className="flex h-full min-h-0 flex-col text-xs">
			{props.contactsDef && (
				<MissionContactsWatch
					missionId={missionId}
					def={props.contactsDef}
				/>
			)}
			<div className="flex items-center gap-2 border-b px-2 py-1 shrink-0">
				<Boxes className="size-3.5" />
				<span className="truncate">
					Map <b>{assets.map || "—"}</b> · {assets.features.length}{" "}
					asset
					{assets.features.length === 1 ? "" : "s"}
				</span>
				{dirty && <Badge variant="outline">unsaved</Badge>}
				<Button
					size="sm"
					variant="outline"
					className="ml-auto"
					disabled={pending !== null || !props.saveDef}
					onClick={() => void save()}
					title="Save the mission: its map and assets, its graph, and the mission"
				>
					{pending === "save" ? (
						<Loader2 className="animate-spin" />
					) : (
						<Save />
					)}
					Save mission
				</Button>
			</div>
			{error && (
				<div className="px-2 py-1 text-destructive shrink-0">
					{error}
				</div>
			)}
			{notice && !error && (
				<div className="px-2 py-1 text-muted-foreground shrink-0">
					{notice}
				</div>
			)}
			<ScrollArea className="min-h-0 flex-1">
				{/* Keyed per mission and selection: the tree's selection is its
				    own (uncontrolled), so an asset picked on the map re-seeds
				    it. `expandAll` with a starting id opens every group. */}
				<TreeView
					key={`${missionId}:${treeSelection ?? ""}`}
					data={data}
					expandAll
					initialSelectedItemId={treeSelection ?? "group:waypoint"}
					onSelectChange={(item) => {
						if (!item || item.id.startsWith("group:")) return;
						if (item.id.startsWith("library:")) return;
						if (item.id.startsWith("contact:")) {
							showContact(item.id.slice("contact:".length));
							return;
						}
						show(item.id);
					}}
				/>
				{assets.features.length === 0 && (
					<p className="px-3 pb-2 text-muted-foreground">
						No assets yet: draw a waypoint, a zone or a cue on the
						mission map, or import one of the map&apos;s below.
					</p>
				)}
				{contacts.error && (
					<p className="px-3 pb-2 text-warning">
						Contacts could not be read: {contacts.error}
					</p>
				)}
			</ScrollArea>
			{selectedContact && (
				<ScrollArea className="max-h-[45%] border-t shrink-0">
					<div className="p-2">
						<ContactDetails
							contact={selectedContact}
							onShow={() => showContact(selectedContact.uid)}
							onClose={() => selectContact(null)}
						/>
					</div>
				</ScrollArea>
			)}
			{selectedFeature && (
				<div className="flex flex-col gap-1.5 border-t p-2 shrink-0">
					<div className="flex items-center gap-2">
						<Label className="text-[11px]">
							{String(selectedFeature.properties?.feature_type)}
						</Label>
						{/* Keyed on the stored name too: a rename made elsewhere
						    (the map) re-seeds it, so a blur here cannot put
						    the old name back. */}
						<Input
							key={`${selected}:${String(selectedFeature.properties?.name ?? "")}`}
							className="h-7 flex-1"
							defaultValue={String(
								selectedFeature.properties?.name ?? "",
							)}
							aria-label="Asset name"
							onBlur={(event) => {
								const name = event.target.value.trim();
								if (!name) {
									event.target.value = String(
										selectedFeature.properties?.name ?? "",
									);
									return;
								}
								editMissionAssets(missionId, (current) =>
									renameAsset(
										current,
										selected as string,
										name,
									),
								);
							}}
						/>
						<Button
							size="icon-sm"
							variant="ghost"
							className="text-destructive"
							title={
								selectedUses.length > 0
									? `Remove it from the mission — ${selectedUses.length} graph node(s) use it and will say so`
									: "Remove it from the mission"
							}
							aria-label="Remove asset"
							onClick={() => {
								editMissionAssets(missionId, (current) =>
									removeAsset(current, selected as string),
								);
								selectAsset(null);
							}}
						>
							<Trash2 />
						</Button>
					</div>
					<span className="text-[11px] text-muted-foreground">
						{selectedUses.length > 0
							? `Used by ${selectedUses.length} graph node${selectedUses.length === 1 ? "" : "s"}.`
							: "No graph node uses it yet: wire it in the node editor."}
					</span>
				</div>
			)}
		</div>
	);
}

/** Resolve the call definitions, then render the panel. */
const MissionAssetsWidget: React.FC<MissionAssetsProps> = (props) => {
	const { calls } = useAvailableRemoteCalls(
		props.datasource_id?.trim()
			? { datasource_id: props.datasource_id.trim() }
			: undefined,
	);
	const listDef = useMemo(
		() => findCall(calls, C2Call.MissionsList),
		[calls],
	);
	const saveDef = useMemo(
		() => findCall(calls, C2Call.MissionsSave),
		[calls],
	);
	const featuresListDef = useMemo(
		() => findCall(calls, C2Call.MapFeaturesList),
		[calls],
	);
	const contactsDef = useMemo(
		() => findCall(calls, C2Call.MissionContacts),
		[calls],
	);
	if (!listDef) {
		return (
			<PanelEmptyState>
				No C2 datasource available. Add a C2 Control datasource to see a
				mission&apos;s assets.
			</PanelEmptyState>
		);
	}
	return (
		<MissionAssetsBody
			listDef={listDef}
			saveDef={saveDef}
			featuresListDef={featuresListDef}
			contactsDef={contactsDef}
		/>
	);
};

/**
 * Widget definition for the mission-assets panel.
 * @returns Widget definition.
 */
export function MissionAssetsDefinition(): WidgetDefinition<MissionAssetsProps> {
	return {
		id: "c2-mission-assets-widget",
		name: "C2 Mission Assets",
		description:
			"The open mission's waypoints, zones and cues, what uses them, the map's ones to import, and the contacts its robots found",
		titleProp: "title",
		icon: <Boxes />,

		schema: {
			type: "object",
			properties: {
				title: { type: "string", title: "Title" },
				datasource_id: {
					type: "string",
					title: "C2 datasource id (optional)",
				},
			},
			required: ["title"],
		},

		uischema: {
			type: "VerticalLayout",
			elements: [
				{
					type: "Control",
					scope: "#/properties/title",
				} as ControlElement,
				{
					type: "Control",
					scope: "#/properties/datasource_id",
				} as ControlElement,
			],
		} as VerticalLayout,

		data: {
			title: "Assets",
		},
		Component: MissionAssetsWidget,
		extensibilityHook: c2DatasourceSelectHook,
	} as WidgetDefinition<MissionAssetsProps>;
}
