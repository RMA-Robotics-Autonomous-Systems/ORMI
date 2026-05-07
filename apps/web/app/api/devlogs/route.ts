import { NextRequest } from "next/server";
import { apiResponse } from "@/lib/api-utils";
import { getDevlogsSince } from "@/lib/mdx/devlogs";
import { renderMarkdown } from "@/lib/mdx/render";

export async function GET(req: NextRequest) {
	const since = req.nextUrl.searchParams.get("since") ?? undefined;

	const devlogs = getDevlogsSince(since);

	const rendered = devlogs.map(({ id, content }) => ({
		id,
		html: renderMarkdown(content),
	}));

	return apiResponse(rendered);
}
