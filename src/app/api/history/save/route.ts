import { NextResponse } from "next/server";
import { connectToDB } from "@/lib/db";
import ChatHistory from "@/models/ChatHistory";
import { currentUser } from "@clerk/nextjs/server";
import { pusherServer } from "@/lib/pusher";

export async function POST(req: Request) {
  try {
    const user = await currentUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const userEmail = user.emailAddresses[0]?.emailAddress?.toLowerCase() || "";

    const chatSession = await req.json();
    if (!chatSession || !chatSession.id) {
      return NextResponse.json({ error: "Invalid payload" }, { status: 400 });
    }

    await connectToDB();

    const updatedSession = await ChatHistory.findOneAndUpdate(
      { userId: user.id, id: chatSession.id },
      { ...chatSession, userId: user.id, userEmail }, 
      { new: true, upsert: true }
    ).lean(); 

    if (updatedSession) {
      // 🚀 FIXED: Bypass the 10KB limit! Send a tiny "Ping" instead of the massive code object.
      await pusherServer.trigger(`project-${chatSession.id}`, 'update', { 
        id: chatSession.id, 
        refresh: true 
      });
    }

    return NextResponse.json({ success: true, session: updatedSession });
  } catch (error: unknown) {
    console.error("[CLOUD SYNC ERROR]:", error);
    return NextResponse.json(
      { error: "Failed to save project to cloud." }, 
      { status: 500 }
    );
  }
}