import { NextResponse } from "next/server";
import { connectToDB } from "@/lib/db";
import GlobalRule from "@/models/GlobalRule";

export async function POST(req: Request) {
  try {
    const { content, category } = await req.json();
    
    if (!content) {
      return new NextResponse("Rule content is required", { status: 400 });
    }

    // Save the text to MongoDB
    await connectToDB();
    const newRule = await GlobalRule.create({ 
      content, 
      category: category || "general",
      embedding: [] // Disabled embeddings 
    });

    return NextResponse.json({ success: true, rule: newRule });
  } catch (error) {
    console.error("[GLOBAL_RULE_ADD_ERROR]", error);
    return new NextResponse("Internal Server Error", { status: 500 });
  }
}