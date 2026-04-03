import { NextResponse } from "next/server";
import { connectToDB } from "@/lib/db";
import ChatHistory from "@/models/ChatHistory";
import { currentUser } from "@clerk/nextjs/server";

export async function POST(req: Request) {
  try {
    const user = await currentUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { projectId, email, role, action } = await req.json();

    if (!projectId || !email) {
      return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
    }

    await connectToDB();

    // 1. Find the project and ensure the current user actually owns it
    const project = await ChatHistory.findOne({ id: projectId, userId: user.id });
    if (!project) {
      return NextResponse.json({ error: "Project not found or you do not have permission to share it." }, { status: 404 });
    }

    // 2. Check if user is trying to invite themselves
    const ownerEmail = user.emailAddresses[0]?.emailAddress?.toLowerCase();
    if (email.toLowerCase() === ownerEmail) {
      return NextResponse.json({ error: "You cannot invite yourself." }, { status: 400 });
    }

    // 3. Find if the collaborator already exists in the array
    const existingCollabIndex = project.collaborators.findIndex((c: { email: string, role: string }) => c.email === email.toLowerCase());
    
    if (action === 'remove') {
      if (existingCollabIndex > -1) {
        project.collaborators.splice(existingCollabIndex, 1);
      }
    } else {
      const finalRole = role || 'viewer'; // Default to viewer
      if (existingCollabIndex > -1) {
        // Update their role if they already exist
        project.collaborators[existingCollabIndex].role = finalRole;
      } else {
        // Add new collaborator
        project.collaborators.push({ email: email.toLowerCase(), role: finalRole });
      }
    }

    await project.save();

    return NextResponse.json({ success: true, project });
  } catch (error: unknown) {
    console.error("[INVITE ERROR]:", error);
    return NextResponse.json(
      { error: "Failed to manage invite." }, 
      { status: 500 }
    );
  }
}