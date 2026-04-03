import { NextResponse } from "next/server";
import { connectToDB } from "@/lib/db";
import ChatHistory from "@/models/ChatHistory";
import { currentUser } from "@clerk/nextjs/server";

export async function POST(req: Request) {
  try {
    const user = await currentUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { id } = await req.json();
    if (!id) return NextResponse.json({ error: "Project ID required" }, { status: 400 });

    await connectToDB();
    
    // Only delete the project if it belongs to the logged-in user
    await ChatHistory.findOneAndDelete({ userId: user.id, id });

    return NextResponse.json({ success: true });
  } catch (error: unknown) {
    console.error("[CLOUD DELETE ERROR]:", error);
    return NextResponse.json(
      { error: "Failed to permanently delete project." }, 
      { status: 500 }
    );
  }
}