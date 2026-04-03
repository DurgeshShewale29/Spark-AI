import { NextResponse } from "next/server";
import { connectToDB } from "@/lib/db";
import ChatHistory from "@/models/ChatHistory";
import { currentUser } from "@clerk/nextjs/server";

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const projectId = searchParams.get('projectId');

    if (!projectId) return NextResponse.json({ error: "Missing project ID" }, { status: 400 });

    await connectToDB();
    const project = await ChatHistory.findOne({ id: projectId });

    if (!project) return NextResponse.json({ error: "Project not found" }, { status: 404 });

    const user = await currentUser();
    const userEmail = user?.emailAddresses[0]?.emailAddress?.toLowerCase();

    // If not logged in, but project is shared publicly, they are a viewer
    if (!user) {
       return NextResponse.json({ role: project.isShared ? "viewer" : "none" });
    }

    // Owner check
    if (project.userId === user.id) {
       return NextResponse.json({ role: "owner" });
    }

    // Invited Collaborator check
    if (userEmail && project.collaborators) {
       const collab = project.collaborators.find((c: { email: string, role: string }) => c.email === userEmail);
       if (collab) {
          return NextResponse.json({ role: collab.role });
       }
    }

    // Fallback for public link
    if (project.isShared) {
       return NextResponse.json({ role: "viewer" });
    }

    // If not public, and not invited, block access
    return NextResponse.json({ role: "none" });
  } catch (error) {
    console.error("[SHARE CHECK ERROR]:", error);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}