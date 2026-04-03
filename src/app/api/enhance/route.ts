import { GoogleGenerativeAI } from "@google/generative-ai";
import { NextResponse } from "next/server";
// 🚀 NEW: Import the centralized key manager
import { getAvailableGeminiKey } from "@/lib/apiKeyManager";

export const maxDuration = 60;

export async function POST(req: Request) {
  try {
    // 🚀 FIXED: Added customApiKey extraction from the frontend request
    const { prompt, customApiKey } = await req.json();
    
    // 🚀 FIXED: Automatically fetch a random load-balanced key (or use the user's custom key)
    const apiKey = getAvailableGeminiKey(customApiKey);

    if (!apiKey) {
      return NextResponse.json({ error: "API Key pool is empty" }, { status: 500 });
    }

    const genAI = new GoogleGenerativeAI(apiKey);
    const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash" });

    const systemPrompt = `
      You are an expert Frontend Architect and Master UI/UX Designer.
      The user will give you a short, simple app idea (e.g., "WhatsApp clone" or "To-do app").
      Your job is to expand this into a highly detailed, 4-5 sentence prompt that instructs an AI code generator on exactly how to build and style it.
      
      You MUST include specific details about:
      1. Layout structure (e.g., fixed sidebars, CSS grid layouts, sticky headers).
      2. Specific aesthetic styling (e.g., dark mode, glassmorphism, precise hex colors like #111b21 or Tailwind colors like slate-900).
      3. Visual effects (e.g., subtle shadow-md, rounded-xl corners, hover transitions).
      4. Features (e.g., "Populate with realistic mock data, use lucide-react icons, and high-quality Unsplash image URLs for avatars/backgrounds").
      
      Return ONLY the enhanced prompt text. Do not include quotes, conversational filler, intro, or outro.
    `;

    const result = await model.generateContent(systemPrompt + "\nUser Request: " + prompt);
    const enhancedPrompt = result.response.text().trim();

    return NextResponse.json({ enhancedPrompt });
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } catch (error: any) {
    console.error("Enhance Error:", error);
    return NextResponse.json({ error: "Failed to enhance prompt" }, { status: 500 });
  }
}