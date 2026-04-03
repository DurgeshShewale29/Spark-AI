import { NextResponse } from "next/server";
import { connectToDB } from "@/lib/db";
import GlobalRule from "@/models/GlobalRule";
import { GoogleGenerativeAI } from "@google/generative-ai";

export async function POST(req: Request) {
  try {
    const { content, category } = await req.json();
    
    if (!content) {
      return new NextResponse("Rule content is required", { status: 400 });
    }

    // 🚀 FIX: Updated to Google's newest required model name
    const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY!);
    const model = genAI.getGenerativeModel({ model: "gemini-embedding-001" });
    
    // Convert the rule text into 768 mathematical dimensions
    const result = await model.embedContent(content);
    const embedding = result.embedding.values;

    // Save the text AND the vector to MongoDB
    await connectToDB();
    const newRule = await GlobalRule.create({ 
      content, 
      category: category || "general",
      embedding 
    });

    return NextResponse.json({ success: true, rule: newRule });
  } catch (error) {
    console.error("[GLOBAL_RULE_ADD_ERROR]", error);
    return new NextResponse("Internal Server Error", { status: 500 });
  }
}