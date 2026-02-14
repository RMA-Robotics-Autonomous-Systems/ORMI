import { NextRequest } from "next/server";
import type { Prisma } from "@prisma/client";

import { db } from "@/server/db";
import { apiResponse } from "@/lib/api-utils";
import { withAuth } from "@/lib/with-auth";
import { templateCreateSchema } from "@/lib/validations/template";
import {
	Template,
	WidgetTemplate,
	DatasourceTemplate,
} from "@workspace/ormi-core/templates";

export const GET = withAuth(async (_req, session) => {
	try {
		const templates = await db.template.findMany({
			where: {
				OR: [{ public: true }, { createdById: session.user.id }],
			},
		});

		const templatesMap = new Map<string, Template>();

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

		return apiResponse(templatesArray);
	} catch (error) {
		console.error("Templates reading error:", error);
		return apiResponse({ error: "Internal server error" }, 500);
	}
});

export const POST = withAuth(async (req: NextRequest, session) => {
	try {
		const body = await req.json();
		const parsedBody = templateCreateSchema.safeParse(body);
		if (!parsedBody.success) {
			return apiResponse({ error: parsedBody.error.flatten() }, 400);
		}

		const template = parsedBody.data.content;
		const templateType = template.type.toString().toUpperCase() as
			| "WIDGET"
			| "DATASOURCE";

		const newTemplate = await db.template.create({
			data: {
				name: template.name,
				content: template as Prisma.InputJsonValue,
				type: templateType,
				public: template.public,
				tags: template.tags,
				createdById: session.user.id,
				createdAT: new Date(),
				updatedAT: new Date(),
			},
		});

		return apiResponse(newTemplate.id.toString());
	} catch (error) {
		console.error("Template creation error:", error);
		return apiResponse({ error: "Internal server error" }, 500);
	}
});
