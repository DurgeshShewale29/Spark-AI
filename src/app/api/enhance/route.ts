import OpenAI from "openai";
import { NextResponse } from "next/server";
import { getAvailableApiKey } from "@/lib/apiKeyManager";

export const maxDuration = 60;

export async function POST(req: Request) {
  try {
    const { prompt, customApiKey } = await req.json();
    
    const apiKey = getAvailableApiKey(customApiKey);

    if (!apiKey) {
      return NextResponse.json({ error: "API Key pool is empty" }, { status: 500 });
    }

    const openai = new OpenAI({ 
      apiKey: apiKey, 
      baseURL: apiKey.startsWith('gsk_') ? 'https://api.groq.com/openai/v1' : undefined 
    });

    const systemPrompt = `
      You are an expert Frontend Architect and Master UI/UX Designer.
      The user will give you a short, simple app idea (e.g., "WhatsApp clone" or "To-do app").
      Your job is to expand this into a highly detailed, 4-5 sentence prompt that instructs an AI code generator on exactly how to build and style it.
      
      You MUST include specific details about:
      1. Layout structure (e.g., fixed sidebars, CSS grid layouts, sticky headers).
      2. Specific aesthetic styling (e.g., dark mode, glassmorphism, precise hex colors like #111b21 or Tailwind colors like slate-900).
      3. Visual effects (e.g., subtle shadow-md, rounded-xl corners, hover transitions).
      4. Features (e.g., "Populate with realistic mock data, use lucide-react icons, and high-quality Unsplash image URLs for avatars/backgrounds").
      5. ARCHITECTURE: DO NOT specify native databases like PostgreSQL, Prisma, or MongoDB. The app runs in a browser WebContainer. If data storage is needed, specify an in-memory database or generic API routes.
      
      Return ONLY the enhanced prompt text. Do not include quotes, conversational filler, intro, or outro.
    `;

    const res = await openai.chat.completions.create({
      model: "llama-3.3-70b-versatile",
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: "User Request: " + prompt }
      ]
    });
    
    const enhancedPrompt = res.choices[0].message.content?.trim() || prompt;

    return NextResponse.json({ enhancedPrompt });
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } catch (error: any) {
    console.error("Enhance Error:", error);
    return NextResponse.json({ error: error.message || "Failed to enhance prompt" }, { status: 500 });
  }
}