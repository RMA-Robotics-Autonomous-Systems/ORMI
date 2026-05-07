import { notFound } from "next/navigation";
import { getDocBySlug, getAllDocs } from "@/lib/mdx/docs";
import { MermaidBlocks } from "@/components/docs/mermaid-blocks";
import { escapeHtml, createMarkdownComponents } from "@/lib/mdx/render";

// Docs-specific: resolves relative markdown links to /docs/ routes
function resolveDocHref(href: string | undefined): string {
	const rawHref = href || "#";

	if (
		rawHref.startsWith("http") ||
		rawHref.startsWith("#") ||
		rawHref.startsWith("/docs/")
	) {
		return rawHref;
	}

	const [pathPart, hashPart] = rawHref.split("#");
	if (pathPart!.startsWith("/")) {
		return `/docs${rawHref}`;
	}

	const normalized = pathPart!
		.replace(/\.(md|mdx)$/i, "")
		.replace(/^\/+/, "")
		.toLowerCase();

	const resolved = `/docs/${normalized}`;
	return hashPart ? `${resolved}#${hashPart}` : resolved;
}

function createDocMarkdownComponents() {
	return {
		...createMarkdownComponents(),
		link: (children: string, meta?: { href: string; title?: string }) => {
			const resolvedHref = resolveDocHref(meta?.href);
			const isExternal = resolvedHref.startsWith("http");
			const titleAttr = meta?.title
				? ` title="${escapeHtml(meta.title)}"`
				: "";
			const targetAttr = isExternal
				? ' target="_blank" rel="noopener noreferrer"'
				: "";
			return `<a href="${escapeHtml(resolvedHref)}"${titleAttr}${targetAttr} class="font-medium text-primary hover:text-primary/80 transition-colors">${children}</a>`;
		},
	};
}

interface PageProps {
	params: Promise<{
		slug?: string;
	}>;
}

export function generateStaticParams() {
	const docs = getAllDocs();
	return docs.map((doc) => ({ slug: doc.slug }));
}

export async function generateMetadata({ params }: PageProps) {
	const { slug } = await params;
	const doc = getDocBySlug(slug || "index");

	if (!doc) {
		return {
			title: "Not Found",
		};
	}

	return {
		title: `${doc.metadata.title} - ORMI Documentation`,
		description: doc.metadata.description,
	};
}

export default async function DocPage({ params }: PageProps) {
	const { slug } = await params;
	const doc = getDocBySlug(slug || "index");

	if (!doc) {
		notFound();
	}

	const content = Bun.markdown.render(
		doc.content,
		createDocMarkdownComponents(),
		{
			headings: { ids: true },
			autolinks: true,
			noHtmlBlocks: true,
			noHtmlSpans: true,
		},
	);

	return (
		<>
			<MermaidBlocks selector=".docs-content" />
			<article
				className="docs-content max-w-none prose prose-slate dark:prose-invert"
				dangerouslySetInnerHTML={{ __html: content }}
			/>
		</>
	);
}
