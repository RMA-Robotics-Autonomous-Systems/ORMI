"use client";

import React, { useMemo } from "react";
import { Button } from "@workspace/ui/components/button";
import { ExternalLink } from "lucide-react";

/**
 * Props for WssTrustButton component.
 */
export interface WssTrustButtonProps {
	value?: string;
	handleChange?: (newValue: any) => void;
	label?: string;
	[key: string]: any;
}

/**
 * WSS Trust Button Component
 *
 * Displays a button when the URL is a wss:// (secure WebSocket) connection.
 * The button opens the https:// version of the URL in a new tab,
 * allowing users to trust the CA certificate in their browser.
 *
 * Usage:
 * ```
 * import WssTrustButton from "./wss-trust-button";
 *
 * {
 *   type: "Control",
 *   scope: "#/properties/trustCA",
 *   options: {
 *     component: WssTrustButton
 *   }
 * }
 * ```
 */
const WssTrustButton = ({
	value,
	handleChange,
	label,
	...props
}: WssTrustButtonProps) => {
	// Check if the URL is a wss (secure WebSocket) URL
	const isWssUrl = useMemo(
		() =>
			typeof value === "string" &&
			value.toLowerCase().startsWith("wss://"),
		[value],
	);

	// Convert wss:// to https:// for the trust button
	const httpsUrl = useMemo(() => {
		if (isWssUrl && typeof value === "string") {
			return value.replace(/^wss:\/\//i, "https://");
		}
		return null;
	}, [isWssUrl, value]);

	if (!isWssUrl || !httpsUrl) {
		return null;
	}

	const handleOpenTrust = () => {
		window.open(httpsUrl, "_blank");
	};

	return (
		<div className="flex items-center gap-2">
			<Button
				onClick={handleOpenTrust}
				variant="outline"
				size="sm"
				className="gap-2"
			>
				<ExternalLink className="h-4 w-4" />
				Trust CA in Browser
			</Button>
			<span className="text-xs text-muted-foreground">
				Opens the HTTPS version to trust the certificate
			</span>
		</div>
	);
};

export default WssTrustButton;
