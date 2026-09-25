"use client";

import { useEffect, useRef, useState } from "react";
import mermaid from "mermaid";

interface MermaidProps {
	chart: string;
	className?: string;
	size?: "small" | "medium" | "large";
}

let mermaidInitialized = false;

export function Mermaid({ chart, className, size = "large" }: MermaidProps) {
	const containerRef = useRef<HTMLDivElement>(null);
	const [svg, setSvg] = useState<string>("");
	const [error, setError] = useState<string>("");

	useEffect(() => {
		// Initialize mermaid once
		if (!mermaidInitialized) {
			mermaid.initialize({
				startOnLoad: false,
				theme: "default",
				securityLevel: "loose",
				fontFamily: "var(--font-geist-sans)",
				fontSize: size === "large" ? 16 : size === "small" ? 12 : 14,
			});
			mermaidInitialized = true;
		}

		// Render the chart
		const renderChart = async () => {
			try {
				const id = `mermaid-${Math.random().toString(36).substr(2, 9)}`;
				const { svg: renderedSvg } = await mermaid.render(id, chart);
				setSvg(renderedSvg);
				setError("");
			} catch (err) {
				console.error("Mermaid render error:", err);
				setError(
					err instanceof Error
						? err.message
						: "Failed to render diagram",
				);
			}
		};

		renderChart();
	}, [chart, size]);

	if (error) {
		return (
			<div className="my-6 rounded-lg border border-destructive/40 bg-destructive/10 p-4">
				<p className="text-sm font-semibold text-destructive">
					Failed to render diagram
				</p>
				<pre className="mt-2 text-xs text-foreground">{error}</pre>
			</div>
		);
	}

	return (
		<div
			ref={containerRef}
			className={`my-6 flex justify-center overflow-x-auto ${
				size === "large"
					? "scale-110"
					: size === "small"
						? "scale-90"
						: ""
			} ${className || ""}`}
			dangerouslySetInnerHTML={{ __html: svg }}
		/>
	);
}
