import hljs from "highlight.js";

export function escapeHtml(value: string): string {
	return value
		.replace(/&/g, "&amp;")
		.replace(/</g, "&lt;")
		.replace(/>/g, "&gt;")
		.replace(/\"/g, "&quot;")
		.replace(/'/g, "&#39;");
}

export function highlightCode(code: string, language?: string) {
	const trimmed = code.replace(/\n$/, "");
	const normalizedLanguage = (language || "").toLowerCase().trim();

	if (normalizedLanguage && hljs.getLanguage(normalizedLanguage)) {
		return {
			value: hljs.highlight(trimmed, { language: normalizedLanguage })
				.value,
			language: normalizedLanguage,
		};
	}

	if (trimmed) {
		const auto = hljs.highlightAuto(trimmed);
		return { value: auto.value, language: auto.language || "" };
	}

	return { value: escapeHtml(trimmed), language: "" };
}

export function createMarkdownComponents() {
	return {
		heading: (children: string, meta?: { level: number; id?: string }) => {
			const level = meta?.level ?? 1;
			const idAttr = meta?.id ? ` id="${escapeHtml(meta.id)}"` : "";
			const sizeClass =
				level === 1
					? "text-4xl"
					: level === 2
						? "text-3xl"
						: level === 3
							? "text-2xl"
							: level === 4
								? "text-xl"
								: level === 5
									? "text-lg"
									: "text-base";
			const marginTop =
				level === 1
					? "mt-8"
					: level === 2
						? "mt-10"
						: level === 3
							? "mt-8"
							: "mt-6";
			const border = level <= 2 ? "border-b pb-2" : "";
			const weight = level === 1 ? "font-bold" : "font-semibold";
			return `<h${level}${idAttr} class="font-heading scroll-m-20 ${sizeClass} ${weight} tracking-tight ${marginTop} mb-4 ${border}">${children}</h${level}>`;
		},
		paragraph: (children: string) =>
			`<p class="leading-7 [&:not(:first-child)]:mt-6">${children}</p>`,
		strong: (children: string) =>
			`<strong class="font-semibold">${children}</strong>`,
		emphasis: (children: string) => `<em class="italic">${children}</em>`,
		strikethrough: (children: string) =>
			`<del class="line-through">${children}</del>`,
		link: (children: string, meta?: { href: string; title?: string }) => {
			const href = meta?.href ?? "#";
			const isExternal = href.startsWith("http");
			const titleAttr = meta?.title
				? ` title="${escapeHtml(meta.title)}"`
				: "";
			const targetAttr = isExternal
				? ' target="_blank" rel="noopener noreferrer"'
				: "";
			return `<a href="${escapeHtml(href)}"${titleAttr}${targetAttr} class="font-medium text-primary hover:text-primary/80 transition-colors">${children}</a>`;
		},
		blockquote: (children: string) =>
			`<div class="border-l-4 border-border/60 pl-4 italic my-6">${children}</div>`,
		list: (
			children: string,
			meta?: { ordered: boolean; start?: number },
		) => {
			if (meta?.ordered) {
				const startAttr = meta.start ? ` start="${meta.start}"` : "";
				return `<ol class="my-6 ml-6 list-decimal [&>li]:mt-2"${startAttr}>${children}</ol>`;
			}
			return `<ul class="my-6 ml-6 list-disc [&>li]:mt-2">${children}</ul>`;
		},
		listItem: (children: string, meta?: { checked?: boolean }) => {
			if (typeof meta?.checked === "boolean") {
				const checkedAttr = meta.checked ? " checked" : "";
				return `<li class="mt-2"><label class="inline-flex items-center gap-2"><input type="checkbox"${checkedAttr} disabled class="h-4 w-4" />${children}</label></li>`;
			}
			return `<li class="mt-2">${children}</li>`;
		},
		hr: () => '<hr class="my-8" />',
		table: (children: string) =>
			`<div class="my-6 w-full overflow-y-auto"><table class="w-full border-collapse">${children}</table></div>`,
		th: (
			children: string,
			meta?: { align?: "left" | "center" | "right" },
		) =>
			`<th class="h-12 px-4 text-left align-middle font-bold [&:has([role=checkbox])]:pr-0"${meta?.align ? ` style="text-align: ${meta.align}"` : ""}>${children}</th>`,
		td: (
			children: string,
			meta?: { align?: "left" | "center" | "right" },
		) =>
			`<td class="p-4 align-middle [&:has([role=checkbox])]:pr-0"${meta?.align ? ` style="text-align: ${meta.align}"` : ""}>${children}</td>`,
		code: (children: string, meta?: { language?: string }) => {
			const normalizedLanguage = (meta?.language || "")
				.toLowerCase()
				.trim();
			if (normalizedLanguage.startsWith("mermaid")) {
				return `<div class="mermaid">${escapeHtml(children)}</div>`;
			}
			const highlighted = highlightCode(children, normalizedLanguage);
			const languageClass = highlighted.language
				? `language-${highlighted.language}`
				: "";
			return `<pre><code class="hljs ${languageClass}">${highlighted.value}</code></pre>`;
		},
		codespan: (children: string) =>
			`<code class="font-mono text-sm font-semibold">${children}</code>`,
	};
}

/**
 * Renders a markdown string to styled HTML using Tailwind utility classes.
 */
export function renderMarkdown(content: string): string {
	return Bun.markdown.render(content, createMarkdownComponents(), {
		autolinks: true,
		noHtmlBlocks: true,
		noHtmlSpans: true,
	});
}
