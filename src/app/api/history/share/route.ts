import { NextRequest, NextResponse } from "next/server";
import { getAuth } from "@clerk/nextjs/server";
import { connectToDB } from "@/lib/db";
import ChatHistory from "@/models/ChatHistory";

export async function POST(req: NextRequest) {
  try {
    // 🚀 FIXED: Changed req type to NextRequest so we don't need 'as any'
    const { userId } = getAuth(req);
    
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id, isShared } = await req.json();

    await connectToDB();

    // Update the project in the database to be publicly accessible
    const updatedChat = await ChatHistory.findOneAndUpdate(
      { id, userId },
      { $set: { isShared } },
      { new: true }
    );

    if (!updatedChat) {
      return NextResponse.json({ error: "Project not found" }, { status: 404 });
    }

    return NextResponse.json({ success: true, isShared: updatedChat.isShared });
  } catch (error: unknown) {
    // 🚀 FIXED: Replaced 'any' with 'unknown' for proper TypeScript error handling
    console.error("[SHARE_ERROR]", error);
    return NextResponse.json({ error: "Failed to update share status" }, { status: 500 });
  }
}