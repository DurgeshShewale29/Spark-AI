import { NextResponse } from "next/server";
import { pusherServer } from "@/lib/pusher";

export async function POST(req: Request) {
  try {
    const { id, mode } = await req.json();
    
    // 🚀 NEW: Broadcast the specific mode (chat, architect, or refactor)
    await pusherServer.trigger(`project-${id}`, 'typing', { isTyping: true, mode: mode || 'chat' });
    
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Pusher Trigger Error:", error);
    return NextResponse.json({ error: "Failed to broadcast typing status" }, { status: 500 });
  }
}