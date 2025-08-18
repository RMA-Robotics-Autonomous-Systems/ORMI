import { getServerSession } from "next-auth";
import { NextRequest } from "next/server";
import { authOptions } from "@/server/auth"
import { db } from "@/server/db";


export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ templateId: string }> }
){
  try {
    
    const resolvedParams = await params;
      const strTemplateId = resolvedParams.templateId;
      
      if (!strTemplateId) {
          return new Response(JSON.stringify({ error: "Template ID is required" }), { 
              status: 400 
          })
      }
      
      const session = await getServerSession(authOptions)
      if (!session?.user) {
          return new Response(JSON.stringify({ error: "Unauthorized" }), { 
              status: 401 
          })
      }
      
      // Use the wsId from the URL params
      const templateId = parseInt(strTemplateId)
      
      if (isNaN(templateId)) {
          return new Response(JSON.stringify({ error: "Invalid template ID format" }), { 
              status: 400 
          })
      }
      
      console.log(`Attempting to delete template ${templateId} for user ${session.user.id}`);
      
      // Check if the template belongs to the user
      const template = await db.template.findUnique({
          where: { id: templateId },
          select: { createdById: true },
      })
  
      if (!template) {
          return new Response(JSON.stringify({ error: "Template not found" }), { 
              status: 404 
          })
      }
      
      if (template.createdById !== session.user.id) {
          return new Response(JSON.stringify({ error: "You don't have permission to delete this template" }), { 
              status: 403 
          })
      }
  
      // Delete the template
      await db.template.delete({ where: { id: templateId } })
      console.log(`Successfully deleted template ${templateId}`);
  
      return new Response(null, { status: 204 })
  } catch (error) {
      console.error("Template deletion error:", error)
      return new Response(JSON.stringify({ error: "Internal server error" }), { 
          status: 500 
      })
  }
}

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ templateId: string }> }
) {
  try {
    const resolvedParams = await params;
    const strTemplateId = resolvedParams.templateId;
    
    if (!strTemplateId) {
      return new Response(JSON.stringify({ error: "Template ID is required" }), { 
        status: 400 
      })
    }
    
    const session = await getServerSession(authOptions)
    if (!session?.user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), { 
        status: 401 
      })
    }
    
    const templateId = parseInt(strTemplateId)
    
    if (isNaN(templateId)) {
      return new Response(JSON.stringify({ error: "Invalid template ID format" }), { 
        status: 400 
      })
    }
    
    const body = await req.json();
    const { name, public: isPublic, tags, widget } = body;
    
    // Check if the template belongs to the user
    const existingTemplate = await db.template.findUnique({
      where: { id: templateId },
      select: { createdById: true },
    })

    if (!existingTemplate) {
      return new Response(JSON.stringify({ error: "Template not found" }), { 
        status: 404 
      })
    }
    
    if (existingTemplate.createdById !== session.user.id) {
      return new Response(JSON.stringify({ error: "You don't have permission to update this template" }), { 
        status: 403 
      })
    }

    // Update the template
    const updatedTemplate = await db.template.update({
      where: { id: templateId },
      data: {
        name,
        public: isPublic,
        tags,
        content: {
          name,
          widget,
          public: isPublic,
          tags,
          yours: true
        },
        updatedAT: new Date(),
      },
    })

    console.log(`Successfully updated template ${templateId}`);

    return new Response(JSON.stringify(updatedTemplate), {
      status: 200,
      headers: {
        "Content-Type": "application/json",
      },
    })
  } catch (error) {
    console.error("Template update error:", error)
    return new Response(JSON.stringify({ error: "Internal server error" }), { 
      status: 500 
    })
  }
}