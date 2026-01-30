/* eslint-disable @typescript-eslint/no-explicit-any */
import { getServerSession } from "next-auth/next";
import { NextRequest } from "next/server";

import { authOptions } from "@/server/auth";
import { db } from "@/server/db";
import {
	Template,
	WidgetTemplate,
	DatasourceTemplate,
} from "@workspace/ormi-core/templates";

export async function GET() {
	try {
		const session = await getServerSession(authOptions);
		if (!session?.user) {
			return new Response(null, { status: 401 });
		}

		// Get from new Template table
		const templates = await db.template.findMany({
			where: {
				OR: [{ public: true }, { createdById: session.user.id }],
			},
		});

		// convert the templates to the format used in the template provider
		const templatesMap = new Map<string, Template>();

		// Process new templates
		templates.forEach((template: any) => {
			const templateType = template.type.toLowerCase() as
				| "widget"
				| "datasource";

			if (templateType === "widget") {
				templatesMap.set(template.id.toString(), {
					name: template.name,
					type: "widget",
					widget: (template.content! as any).widget,
					public: template.public,
					tags: template.tags,
					yours: template.createdById === session.user.id,
				} as WidgetTemplate);
			} else if (templateType === "datasource") {
				templatesMap.set(template.id.toString(), {
					name: template.name,
					type: "datasource",
					datasource: (template.content! as any).datasource,
					public: template.public,
					tags: template.tags,
					yours: template.createdById === session.user.id,
				} as DatasourceTemplate);
			}
		});

		// convert the map to an array
		const templatesArray = Array.from(templatesMap.entries()).map(
			([key, value]) => ({
				id: key,
				name: value.name,
				type: value.type,
				...(value.type === "widget"
					? { widget: (value as WidgetTemplate).widget }
					: {}),
				...(value.type === "datasource"
					? { datasource: (value as DatasourceTemplate).datasource }
					: {}),
				public: value.public,
				tags: value.tags,
				yours: value.yours,
			}),
		);

		return new Response(JSON.stringify(templatesArray), {
			status: 200,
			headers: {
				"Content-Type": "application/json",
			},
		});
	} catch (error) {
		console.error("Templates reading error:", error);
	}
	return new Response(null, { status: 500 });
}

export async function POST(req: NextRequest) {
	// check if the user is logged in
	const session = await getServerSession(authOptions);
	if (!session?.user) {
		return new Response(null, { status: 401 });
	}

	const body = (await req.json()) as any;
	const template = body.content;

	// Use new Template table
	const newTemplate = await db.template.create({
		data: {
			name: template.name,
			content: template,
			type: template.type.toUpperCase() as "WIDGET" | "DATASOURCE",
			public: template.public,
			tags: template.tags,
			createdById: session.user.id,
			createdAT: new Date(),
			updatedAT: new Date(),
		},
	});

	return new Response(JSON.stringify(newTemplate.id.toString()), {
		status: 200,
		headers: {
			"Content-Type": "application/json",
		},
	});
}
