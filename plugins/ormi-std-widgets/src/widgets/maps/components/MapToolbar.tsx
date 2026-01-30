"use client";

import { useEffect } from "react";
import { MapRef } from "react-map-gl/maplibre";
import { useButtonHolder } from "@workspace/ui/combined/ButtonHolder";
import { Button } from "@workspace/ui/components/button";
import { MinusIcon, PlusIcon, RefreshCcwIcon } from "lucide-react";

interface MapToolbarProps {
	mapRef: React.RefObject<MapRef | null>;
	showGrid: boolean;
	onToggleGrid: () => void;
	onRefresh: () => void;
}

/**
 * Map toolbar component that manages zoom, refresh, and grid toggle buttons
 */
export function MapToolbar({
	mapRef,
	showGrid,
	onToggleGrid,
	onRefresh,
}: MapToolbarProps) {
	const { setButtonItem, removeButtonItem } = useButtonHolder();

	useEffect(() => {
		// Zoom In button
		setButtonItem(
			"map-box-viewer-widget-zoom-in",
			<Button
				variant={"ghost"}
				onClick={() => {
					if (mapRef.current) {
						const currentZoom = mapRef.current.getZoom();
						mapRef.current.setZoom(currentZoom + 1);
					}
				}}
			>
				<PlusIcon />
			</Button>,
			1,
		);

		// Zoom Out button
		setButtonItem(
			"map-box-viewer-widget-zoom-out",
			<Button
				variant={"ghost"}
				onClick={() => {
					if (mapRef.current) {
						const currentZoom = mapRef.current.getZoom();
						mapRef.current.setZoom(currentZoom - 1);
					}
				}}
			>
				<MinusIcon />
			</Button>,
			1,
		);

		// Refresh button
		setButtonItem(
			"map-box-viewer-widget-refresh",
			<Button variant={"ghost"} onClick={onRefresh}>
				<RefreshCcwIcon />
			</Button>,
			1,
		);

		// Grid toggle button
		setButtonItem(
			"map-box-viewer-widget-grid",
			<Button
				variant={showGrid ? "default" : "ghost"}
				onClick={onToggleGrid}
			>
				<svg
					width="16"
					height="16"
					viewBox="0 0 24 24"
					fill="none"
					stroke="currentColor"
					strokeWidth="2"
					strokeLinecap="round"
					strokeLinejoin="round"
				>
					<rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
					<line x1="9" y1="3" x2="9" y2="21" />
					<line x1="15" y1="3" x2="15" y2="21" />
					<line x1="3" y1="9" x2="21" y2="9" />
					<line x1="3" y1="15" x2="21" y2="15" />
				</svg>
			</Button>,
			1,
		);

		return () => {
			removeButtonItem("map-box-viewer-widget-zoom-in");
			removeButtonItem("map-box-viewer-widget-zoom-out");
			removeButtonItem("map-box-viewer-widget-refresh");
			removeButtonItem("map-box-viewer-widget-grid");
		};
	}, [
		mapRef,
		showGrid,
		onToggleGrid,
		onRefresh,
		setButtonItem,
		removeButtonItem,
	]);

	// This component doesn't render anything visible, it just manages toolbar buttons
	return null;
}
