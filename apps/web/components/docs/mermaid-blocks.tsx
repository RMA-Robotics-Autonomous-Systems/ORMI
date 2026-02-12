"use client";

import { useEffect } from "react";
import mermaid from "mermaid";

interface MermaidBlocksProps {
	selector?: string;
}

let mermaidInitialized = false;

export function MermaidBlocks({
	selector = ".docs-content",
}: MermaidBlocksProps) {
	useEffect(() => {
		const root = document.querySelector(selector);
		if (!root) {
			return;
		}

		if (!mermaidInitialized) {
			mermaid.initialize({
				startOnLoad: false,
				theme: "default",
				securityLevel: "loose",
				fontFamily: "var(--font-geist-sans)",
			});
			mermaidInitialized = true;
		}

		const renderBlocks = () => {
			const blocks = Array.from(root.querySelectorAll("div.mermaid"));
			blocks.forEach((block, index) => {
				if (block.classList.contains("mermaid-rendered")) {
					return;
				}

				const chart = block.textContent || "";
				if (!chart.trim()) {
					return;
				}

				const id = `mermaid-${index}-${Math.random().toString(36).slice(2, 8)}`;
				mermaid
					.render(id, chart)
					.then(({ svg }) => {
						block.innerHTML = svg;
						block.classList.add("mermaid-rendered");
					})
					.catch((error) => {
						block.classList.add("mermaid-error");
						block.textContent =
							error instanceof Error
								? error.message
								: "Mermaid render error";
					});
			});
		};

		const raf = requestAnimationFrame(() => {
			requestAnimationFrame(renderBlocks);
		});

		const observer = new MutationObserver(() => {
			renderBlocks();
		});

		observer.observe(root, { childList: true, subtree: true });

		return () => {
			cancelAnimationFrame(raf);
			observer.disconnect();
		};
	}, [selector]);

	return null;
}
