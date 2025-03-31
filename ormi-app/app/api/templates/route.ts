import { getServerSession } from "next-auth/next"
import { z } from "zod"
import { NextRequest } from "next/server"

import { authOptions } from "@/server/auth"
import { db } from "@/server/db"
import { Template } from "ormi-core/templates"
import { Widget } from "ormi-core/widgets"

export async function GET(req: NextRequest) {
    try {
        const session = await getServerSession(authOptions)
        if (!session?.user) {
            return new Response(null, { status: 401 })
        }
        const templates = await db.templateWidget.findMany({
            where: {
                OR: [
                    { public: true },
                    { createdById: session.user.id }
                ],
            },
        })

        // convert the templates to the format used in the template provider
        const templatesMap = new Map<string, Template>()

        templates.forEach((template) => {
            templatesMap.set(template.id.toString(), {
                name: template.name,
                widget: (template.content! as any).widget, // Extract the widget properly
                public: template.public,
                tags: template.tags,
                yours: template.createdById === session.user.id
            })
        })

        console.log("Templates loaded:", templatesMap)

        // convert the map to an array
        const templatesArray = Array.from(templatesMap.entries()).map(([key, value]) => ({
            id: key,
            name: value.name,
            widget: value.widget,
            public: value.public,
            tags: value.tags,
            yours: value.yours
        }))

        return new Response(JSON.stringify(templatesArray), {
            status: 200,
            headers: {
                "Content-Type": "application/json",
            },
        })

    } catch (error) {
        console.error("Templates reading error:", error)
    }
    return new Response(null, { status: 500 })
}

export async function POST(req: NextRequest) {

    // check if the user is logged in
    const session = await getServerSession(authOptions)
    if (!session?.user) {
        return new Response(null, { status: 401 })
    }

    const body = await req.json()

    
    const templateWidget = await db.templateWidget.create({
        data: {
            name: body.content.name,
            content: body.content,
            public: body.content.public,
            tags: body.content.tags,

            createdById: session.user.id,
            createdAT: new Date(),
            updatedAT: new Date(),
        },
    })

    return new Response(JSON.stringify(templateWidget.id), {
        status: 200,
        headers: {
            "Content-Type": "application/json",
        },
    })

}