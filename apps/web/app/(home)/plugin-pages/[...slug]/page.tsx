"use client";

import { usePluginPages } from "@workspace/ormi-plugins";
import { useParams } from "next/navigation";

export default function PluginPage() {
	const pages = usePluginPages();
	const params = useParams<{ slug: string[] }>();

	const slug = params.slug?.join("/") ?? "";
	const page = pages.find((p) => p.slug === slug);

	if (!page) {
		return (
			<div className="container mx-auto mt-8">
				<h1>Page not found</h1>
				<p className="text-muted-foreground">
					No plugin registered a page at{" "}
					<code>/plugin-pages/{slug}</code>.
				</p>
			</div>
		);
	}

	const PageComponent = page.component;
	return <PageComponent />;
}
