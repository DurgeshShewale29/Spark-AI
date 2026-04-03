import { NextResponse } from "next/server";
import { connectToDB } from "@/lib/db";
import GlobalRule from "@/models/GlobalRule";
import { GoogleGenerativeAI } from "@google/generative-ai";

// GET: Fetch all rules
export async function GET() {
  try {
    await connectToDB();
    const rules = await GlobalRule.find({}).sort({ createdAt: -1 });
    return NextResponse.json(rules);
  } catch (error: unknown) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to fetch rules" }, 
      { status: 500 }
    );
  }
}

// POST: Manually Inject a Master Rule (God Mode)
export async function POST(req: Request) {
  try {
    const { content, category } = await req.json();
    if (!content) return NextResponse.json({ error: "Rule content is required" }, { status: 400 });

    const apiKey = process.env.GEMINI_API_KEY || process.env.GEMINI_UPDATE_API_KEY;
    if (!apiKey) {
      return NextResponse.json({ error: "Server missing Gemini API Key for generating embeddings." }, { status: 500 });
    }

    await connectToDB();

    const embedGenAI = new GoogleGenerativeAI(apiKey);
    const embedModel = embedGenAI.getGenerativeModel({ model: "gemini-embedding-001" });
    const embedResult = await embedModel.embedContent(content);

    const newRule = await GlobalRule.create({
      content: content.trim(),
      category: category || "manual-injection",
      embedding: embedResult.embedding.values,
      isActive: true,
      isDeleted: false
    });

    return NextResponse.json({ success: true, rule: newRule });
  } catch (error: unknown) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to create rule" }, 
      { status: 500 }
    );
  }
}

// PATCH: Toggle rule active/inactive status OR Soft Delete/Restore
export async function PATCH(req: Request) {
  try {
    const { id, isActive, isDeleted } = await req.json();
    if (!id) return NextResponse.json({ error: "Rule ID is required" }, { status: 400 });

    await connectToDB();
    
    // Build update object dynamically
    const updateData: Record<string, boolean> = {};
    if (isActive !== undefined) updateData.isActive = isActive;
    if (isDeleted !== undefined) updateData.isDeleted = isDeleted;

    // strict: false allows us to save 'isDeleted' even if it's not in your original mongoose schema
    const updatedRule = await GlobalRule.findByIdAndUpdate(
      id, 
      updateData, 
      { new: true, strict: false }
    );

    if (!updatedRule) return NextResponse.json({ error: "Rule not found" }, { status: 404 });

    return NextResponse.json({ success: true, rule: updatedRule });
  } catch (error: unknown) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to update rule" }, 
      { status: 500 }
    );
  }
}

// DELETE: Permanently remove a rule (Hard Delete)
export async function DELETE(req: Request) {
  try {
    const { id } = await req.json();
    if (!id) return NextResponse.json({ error: "Rule ID is required" }, { status: 400 });

    await connectToDB();
    const deletedRule = await GlobalRule.findByIdAndDelete(id);

    if (!deletedRule) return NextResponse.json({ error: "Rule not found" }, { status: 404 });

    return NextResponse.json({ success: true });
  } catch (error: unknown) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to delete rule" }, 
      { status: 500 }
    );
  }
}