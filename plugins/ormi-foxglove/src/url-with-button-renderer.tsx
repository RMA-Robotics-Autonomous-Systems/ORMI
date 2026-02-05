"use client";

import React, { useMemo } from "react";
import { withJsonFormsControlProps } from "@jsonforms/react";
import {
	ControlProps,
	rankWith,
	and,
	scopeEndsWith,
} from "@jsonforms/core";
import { Label } from "@workspace/ui/components/label";
import { Input } from "@workspace/ui/components/input";
import { Button } from "@workspace/ui/components/button";
import { ExternalLink } from "lucide-react";

const UrlWithButtonRenderer = (props: ControlProps) => {
	const { data, handleChange, path, label, id, enabled } = props;

	const url = (data as string) || "";

	// Check if it's a wss:// URL to convert to https://
	const isWssUrl = useMemo(
		() => url.toLowerCase().startsWith("wss://"),
		[url],
	);

	// Convert wss:// to https:// or use as-is for other protocols
	const httpsUrl = useMemo(() => {
		if (isWssUrl) {
			return url.replace(/^wss:\/\//i, "https://");
		}
		// For ws://, convert to http://
		if (url.toLowerCase().startsWith("ws://")) {
			return url.replace(/^ws:\/\//i, "http://");
		}
		return url;
	}, [url, isWssUrl]);

	const handleOpenUrl = () => {
		if (httpsUrl) {
			window.open(httpsUrl, "_blank");
		}
	};

	const canOpenUrl = url && (url.startsWith("ws://") || url.startsWith("wss://"));

	return (
		<div className="space-y-2">
			<Label htmlFor={id}>{label}</Label>
			<Input
				type="text"
				value={url}
				onChange={(ev) => handleChange(path, ev.target.value)}
				disabled={!enabled}
				id={id}
				placeholder="ws://localhost:8765"
			/>
			{canOpenUrl && (
				<div className="flex items-center gap-2">
					<Button
						onClick={handleOpenUrl}
						variant="outline"
						size="sm"
						className="gap-2"
						type="button"
					>
						<ExternalLink className="h-4 w-4" />
						{isWssUrl ? "Trust CA in Browser" : "Open in Browser"}
					</Button>
					<span className="text-xs text-muted-foreground">
						{isWssUrl
							? "Opens the HTTPS version to trust the certificate"
							: "Opens the HTTP version in browser"}
					</span>
				</div>
			)}
		</div>
	);
};

export default withJsonFormsControlProps(UrlWithButtonRenderer);

// Tester that matches the URL field in Foxglove datasource
export const urlWithButtonTester = rankWith(
	100,
	and(scopeEndsWith("url")),
);
