import { NextResponse } from 'next/server';
import OpenAI from "openai";
import { getAvailableApiKey } from "@/lib/apiKeyManager";

export async function POST(req: Request) {
  try {
    const { prefix, suffix } = await req.json();

    if (typeof prefix !== 'string' || typeof suffix !== 'string') {
      return NextResponse.json({ error: 'Prefix and suffix are required' }, { status: 400 });
    }

    const apiKey = getAvailableApiKey();
    if (!apiKey) {
      return NextResponse.json({ error: 'Groq API key is not configured' }, { status: 500 });
    }

    const openai = new OpenAI({ 
      apiKey: apiKey, 
      baseURL: apiKey.startsWith('gsk_') ? 'https://api.groq.com/openai/v1' : undefined 
    });

    const prompt = `You are an expert AI coding assistant. I will provide you with the exact code BEFORE the cursor (PREFIX) and the exact code AFTER the cursor (SUFFIX).
Your task is to provide the exact code that should be inserted AT THE CURSOR.
CRITICAL: 
- DO NOT output the PREFIX or SUFFIX. 
- DO NOT output markdown code blocks (e.g. \`\`\`javascript). 
- ONLY output the raw code to be inserted.
- Keep it concise. Usually it's just the completion of the current line or a few new lines.

PREFIX:
${prefix}

SUFFIX:
${suffix}`;

    const res = await openai.chat.completions.create({
      model: "llama-3.3-70b-versatile",
      messages: [{ role: "user", content: prompt }],
      max_tokens: 256,
      temperature: 0.1
    });

    const completion = res.choices[0].message.content || "";
    // Aggressively strip markdown if the model hallucinated it
    let cleanCompletion = completion.replace(/^```[a-z]*\n?/i, '').replace(/\n?```$/i, '').trim();

    return NextResponse.json({ completion: cleanCompletion });
  } catch (error: any) {
    console.error('Autocomplete error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
