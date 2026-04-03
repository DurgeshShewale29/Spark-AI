import { NextResponse } from "next/server";
import { connectToDB } from "@/lib/db";
import ChatHistory from "@/models/ChatHistory";
import { currentUser } from "@clerk/nextjs/server";

export async function GET() {
  try {
    const user = await currentUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    // 🚀 NEW: We need the user's email to find projects shared with them
    const userEmail = user.emailAddresses[0]?.emailAddress?.toLowerCase() || "";

    await connectToDB();
    
    // 🚀 FIXED: Fetch projects where the user is EITHER the creator OR an invited collaborator!
    const query = userEmail 
      ? { $or: [{ userId: user.id }, { "collaborators.email": userEmail }] }
      : { userId: user.id };

    // Fetch all matched history, sorted by newest first
    const history = await ChatHistory.find(query).sort({ timestamp: -1 });

    return NextResponse.json(history);
  } catch (error: unknown) {
    console.error("[CLOUD LOAD ERROR]:", error);
    return NextResponse.json(
      { error: "Failed to load cloud history." }, 
      { status: 500 }
    );
  }
}