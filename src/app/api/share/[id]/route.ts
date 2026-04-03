import { NextResponse } from "next/server";
import { connectToDB } from "@/lib/db";
import ChatHistory from "@/models/ChatHistory";

interface RouteContext {
  params: Promise<{ id: string }>;
}

export async function GET(req: Request, context: RouteContext) {
  try {
    const params = await context.params;
    const { id } = params;
    
    await connectToDB();

    const chat = await ChatHistory.findOne({ id, isShared: true }).lean();

    if (!chat) {
      return NextResponse.json(
        { error: "This project does not exist or the owner has disabled public access." }, 
        { status: 404 }
      );
    }

    return NextResponse.json({
      title: chat.title,
      framework: chat.framework,
      files: chat.files,
      messages: chat.messages,
      timestamp: chat.timestamp
    });

  } catch (error: unknown) {
    console.error("[FETCH_SHARE_ERROR]", error);
    const errorMessage = error instanceof Error ? error.message : "Server Error";
    return NextResponse.json({ error: errorMessage }, { status: 500 });
  }
}