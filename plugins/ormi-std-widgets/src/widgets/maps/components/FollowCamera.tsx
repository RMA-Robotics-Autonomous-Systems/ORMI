"use client";

import { useEffect, useRef } from "react";
import { useMap } from "react-map-gl/maplibre";
import type { MapLibreEvent } from "maplibre-gl";
import { LocateFixedIcon, XIcon } from "lucide-react";
import {
	SelectedTopic,
	useLocalDataSource,
} from "@workspace/ormi-core/datasources";
import { Button } from "@workspace/ui/components/button";

import {
	followDeadbandPx,
	followStep,
	FOLLOW_GLIDE_TAU_MS,
	isOperatorPan,
	latestFix,
} from "../follow-camera";

/** Zoom the first flight to a followed entry lands at, at least. */
const FOLLOW_MIN_ZOOM = 16;

/**
 * Keeps the map centred on one entry's newest position until the operator
 * pans, and says so on the map.
 *
 * Mount it keyed on the followed entry: switching to another entry has to
 * start over with a flight, not a glide from wherever the last one was.
 *
 * The first fix flies to the entry. After that the camera holds still while
 * the entry stays inside a dead zone around the centre, so GPS jitter does not
 * shake the view, and glides back once it leaves ({@link followStep}). Only
 * the camera is smoothed: the marker still draws every fix where it was
 * reported. The glide runs on animation frames only while it has somewhere to
 * go, and pauses while the camera is moving for another reason (that first
 * flight, a scroll zoom, a rotation), so following never cancels a move in
 * progress. Under reduced motion it snaps instead of gliding.
 *
 * Zoom and rotation keep the follow, and while it holds they turn around the
 * map's centre, where the entry is, rather than around the pointer. Only a pan
 * ends it ({@link isOperatorPan}).
 *
 * Follow state is screen state only and is never written into the widget's
 * settings, so it is not autosaved.
 *
 * @param props.name - The entry's name, shown in the status chip.
 * @param props.topic - The entry's bound topic.
 * @param props.onStop - Ends the follow (operator pan or the chip's button).
 * @returns The status chip.
 */
export function FollowCamera({
	name,
	topic,
	onStop,
}: {
	name: string;
	topic: SelectedTopic;
	onStop: () => void;
}) {
	const { current: mapRef } = useMap();
	const { getSource } = useLocalDataSource();

	/** The newest fix seen: where the camera is heading. */
	const targetRef = useRef<[number, number] | null>(null);
	/** Whether the first flight to the entry has been started. */
	const arrivedRef = useRef(false);
	/** Starts the frame loop if it is idle; set by the map effect. */
	const wakeRef = useRef<() => void>(() => {});

	const onStopRef = useRef(onStop);
	useEffect(() => {
		onStopRef.current = onStop;
	}, [onStop]);

	// Operator gestures, the glide loop, and zoom/rotate around the centre.
	useEffect(() => {
		const map = mapRef?.getMap();
		if (!map) return;

		const onStart = (event: MapLibreEvent<unknown>) => {
			if (isOperatorPan(event.type, event.originalEvent)) {
				onStopRef.current();
			}
		};
		map.on("dragstart", onStart);
		map.on("movestart", onStart);

		const reducedMotion = window.matchMedia(
			"(prefers-reduced-motion: reduce)",
		);
		let frame: number | null = null;
		let lastTs: number | null = null;
		let gliding = false;

		const tick = (ts: number) => {
			frame = null;
			const dt = lastTs === null ? 16 : ts - lastTs;
			lastTs = ts;
			const target = targetRef.current;
			if (!target) return;
			// Another move owns the camera: wait for it, keep the glide state.
			if (map.isMoving()) {
				frame = requestAnimationFrame(tick);
				return;
			}
			const centre = map.project(map.getCenter());
			const at = map.project(target);
			const container = map.getContainer();
			const step = followStep(
				[at.x - centre.x, at.y - centre.y],
				dt,
				gliding,
				followDeadbandPx(container.clientWidth, container.clientHeight),
				reducedMotion.matches ? 0 : FOLLOW_GLIDE_TAU_MS,
			);
			gliding = step.gliding;
			if (step.move) {
				map.jumpTo({
					center: map.unproject([
						centre.x + step.move[0],
						centre.y + step.move[1],
					]),
				});
			}
			if (gliding) frame = requestAnimationFrame(tick);
		};
		wakeRef.current = () => {
			if (frame !== null) return;
			lastTs = null;
			frame = requestAnimationFrame(tick);
		};

		const scrollZoomEnabled = map.scrollZoom.isEnabled();
		const touchZoomEnabled = map.touchZoomRotate.isEnabled();
		if (scrollZoomEnabled) map.scrollZoom.enable({ around: "center" });
		if (touchZoomEnabled) map.touchZoomRotate.enable({ around: "center" });

		return () => {
			map.off("dragstart", onStart);
			map.off("movestart", onStart);
			if (frame !== null) cancelAnimationFrame(frame);
			wakeRef.current = () => {};
			if (scrollZoomEnabled) map.scrollZoom.enable();
			if (touchZoomEnabled) map.touchZoomRotate.enable();
		};
	}, [mapRef]);

	// Every new fix: fly there the first time, then let the glide loop decide.
	useEffect(() => {
		const map = mapRef?.getMap();
		const source = getSource(topic);
		const fix = source ? latestFix(source.data) : null;
		if (!map || !fix) return;

		targetRef.current = fix;

		if (!arrivedRef.current) {
			arrivedRef.current = true;
			map.flyTo({
				center: fix,
				zoom: Math.max(map.getZoom(), FOLLOW_MIN_ZOOM),
				duration: 1000,
			});
		}
		wakeRef.current();
	}, [getSource, topic, mapRef]);

	return (
		<div className="absolute top-2 left-2 z-10 max-w-[calc(50%-1rem)]">
			<div
				role="status"
				className="bg-popover text-popover-foreground flex items-center gap-2 rounded-md border py-1 pr-1 pl-2 text-sm shadow-md"
			>
				<LocateFixedIcon
					className="text-primary size-4 shrink-0"
					aria-hidden
				/>
				<span className="min-w-0 truncate">Following {name}</span>
				<Button
					variant="ghost"
					size="icon"
					className="size-6 shrink-0"
					aria-label="Stop following"
					onClick={onStop}
				>
					<XIcon className="size-3" />
				</Button>
			</div>
		</div>
	);
}
