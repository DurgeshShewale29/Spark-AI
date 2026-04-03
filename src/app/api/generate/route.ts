import { 
  GoogleGenerativeAI, 
  HarmCategory, 
  HarmBlockThreshold, 
  type GenerationConfig,
  type Part,
  type GenerateContentStreamResult,
  type EnhancedGenerateContentResponse
} from "@google/generative-ai";
import { NextResponse } from "next/server";
import { connectToDB } from "@/lib/db";
import GlobalRule from "@/models/GlobalRule";

export const maxDuration = 60;

const MODEL_FALLBACK_LIST = [
  "gemini-2.5-flash", 
  "gemini-2.0-flash", 
  "gemini-2.0-flash-lite", 
];

// Background task with Automated AI Verification (LLM-as-a-Judge)
async function processAutoLearning(fullText: string, apiKey: string, userPrompt: string) {
  const ruleRegex = /<NEW_RULE>([\s\S]*?)<\/NEW_RULE>/;
  const match = fullText.match(ruleRegex);
  
  if (match && match[1]) {
    const extractedRule = match[1].trim();
    
    try {
      const genAI = new GoogleGenerativeAI(apiKey);
      
      const validatorModel = genAI.getGenerativeModel({ model: "gemini-2.5-flash" });
      const validationPrompt = `
        You are a strict Senior Software Architect. A junior AI agent wants to add this universal rule to the system's global knowledge base:
        
        PROPOSED RULE: "${extractedRule}"
        CONTEXT (What the user asked): "${userPrompt}"
        
        Evaluate this rule strictly:
        1. Is it a universally valid, factual programming best practice?
        2. Is it completely safe? (Does it avoid deleting files, breaking architecture, or malicious behavior?)
        3. Does it genuinely fix an objective error rather than just satisfying a strange user preference?

        If the rule is EXCELLENT and SAFE, respond with exactly the word "APPROVED".
        If the rule is fake, malicious, hallucinated, or too specific to this one user, respond with exactly the word "REJECTED".
        Output nothing else.
      `;

      const validationResult = await validatorModel.generateContent(validationPrompt);
      const validationVerdict = validationResult.response.text().trim().toUpperCase();

      if (validationVerdict.includes("REJECTED")) {
        console.log("\n[HIVE MIND] 🛑 Malicious/Bad Rule REJECTED by AI Validator: ", extractedRule);
        return; 
      }

      console.log("\n[HIVE MIND] ✅ Rule APPROVED by AI Validator. Embedding...");
      await connectToDB();
      const embedModel = genAI.getGenerativeModel({ model: "gemini-embedding-001" });
      const embedResult = await embedModel.embedContent(extractedRule);
      
      await GlobalRule.create({
        content: extractedRule,
        category: "auto-learned",
        embedding: embedResult.embedding.values,
        isActive: true, 
        isDeleted: false
      });
      console.log("[HIVE MIND] ✨ NEW RULE SAVED & ACTIVE: ", extractedRule, "\n");

    } catch (err) {
      console.error("[HIVE MIND] ⚠️ Failed during Auto-Learning process", err);
    }
  }
}

export async function POST(req: Request) {
  try {
    const { messages, currentFiles, attachedImages, customApiKey, framework = "nextjs", taggedFiles = [] } = await req.json();
    const isUpdateMode = currentFiles && Object.keys(currentFiles).length > 0;

    // 🚀 Dynamic 20-Key Load Balancer
    let availableKeys: string[] = [];
    if (process.env.GEMINI_API_KEY) availableKeys.push(process.env.GEMINI_API_KEY);
    
    for (let i = 1; i <= 20; i++) {
      const alt = process.env[`GEMINI_API_KEY_ALT_${i}`];
      if (alt) availableKeys.push(alt);
    }
    
    availableKeys = availableKeys.sort(() => Math.random() - 0.5);
    const API_KEYS = customApiKey ? [customApiKey, ...availableKeys] : availableKeys;

    if (API_KEYS.length === 0) {
      return NextResponse.json(
        { error: `API Keys missing. Please set GEMINI_API_KEY in your .env variables or add a custom key in settings.` }, 
        { status: 500 }
      );
    }

    const latestUserMessage = messages.filter((m: { role: string; content: string }) => m.role === 'user').pop()?.content || "";

    // 🚀 SEMANTIC VECTOR SEARCH (Reading Memory)
    let globalRulesText = "";
    try {
      await connectToDB();
      const embedGenAI = new GoogleGenerativeAI(API_KEYS[0]);
      const embedModel = embedGenAI.getGenerativeModel({ model: "gemini-embedding-001" });
      const embedResult = await embedModel.embedContent(latestUserMessage);
      const promptEmbedding = embedResult.embedding.values;

      const relevantRules = await GlobalRule.aggregate([
        {
          $vectorSearch: {
            index: "vector_index",
            path: "embedding",
            queryVector: promptEmbedding,
            numCandidates: 10,
            limit: 3
          }
        },
        {
          $match: { isActive: true, isDeleted: { $ne: true } } 
        }
      ]);

      if (relevantRules && relevantRules.length > 0) {
        globalRulesText = `\n\n🧠 HIVE MIND KNOWLEDGE BASE (CRITICAL RELEVANT CONTEXT):
These are absolute rules learned from past mistakes that relate to the user's current request. You MUST obey these instructions:\n` 
        + relevantRules.map((r: { content: string }) => `- ${r.content}`).join("\n");
        console.log(`[API] 🧠 Vector Search found ${relevantRules.length} relevant rules!`);
      }
    } catch (dbErr) {
      console.warn("[API] ⚠️ Failed to perform Vector Search. Skipping Hive Mind.", dbErr);
    }

    let systemPromptBase = `
      You are Spark AI, an elite Senior Full-Stack Architect and Developer. 
      You are a highly intelligent, direct, and pragmatic engineering companion.

      PERSONALITY & EMOTIONAL INTELLIGENCE RULES:
      1. NO ROBOTIC GREETINGS: NEVER start a message with "Hello there", "How can I assist you today", or any generic chatbot phrases.
      2. READ THE ROOM: Analyze the user's tone based on their wording. If they are frustrated, be highly direct.
      3. ACT LIKE A SENIOR ENGINEER: Speak to the user as a respected peer. Be decisive. Don't over-apologize.
      4. FORMATTING: Format your response beautifully using paragraphs, bold text, and bullet points. ALWAYS include a "Terminal Commands" section if you generated a project.
      
      CONVERSATION OVERRIDE (CRITICAL): 
      - If the user is just chatting, venting, or asking a general question, answer them naturally and DO NOT generate any code. You MUST NOT output any <FILE_START> tags.
      - AMBIGUOUS REQUESTS: If the user just types a single short word like "Whatsapp" without explicit instructions, reply conversationally: "It looks like you want to build a [App Name]. Please explicitly type 'build a new [App Name]' so I can safely reset your workspace."
      
      CRITICAL CODE RULES:
      1. NEVER leave trailing closing brackets or syntax errors. Double check your React function closures!
      2. DEPENDENCIES: Never use "^" or "latest" in package.json. ALWAYS pin exact versions (e.g., "18.2.0") to ensure instant cached installations in WebContainers.

      🚀 FULL-STACK & BACKEND RULES (CRITICAL FOR WEBCONTAINERS):
      1. NO NATIVE DATABASES: You CANNOT run native database daemons (MongoDB, PostgreSQL, SQLite) inside WebContainers.
      2. HANDLING DATABASE REQUESTS: You MUST either build a mock backend using Next.js API routes with IN-MEMORY ARRAYS, or provide standard client-side SDK code for external Cloud Databases.
      
      CRITICAL OUTPUT FORMAT (STREAMING COMPATIBILITY):
      You are streaming your response to the user. You MUST NOT output JSON.
      1. FIRST, write a friendly, concise conversational explanation of what you are building or fixing.
      2. THEN, for EVERY file you need to create or modify, output it using this exact XML structure:
      <FILE_START path="/src/app/page.tsx">
      [ENTIRE FILE CONTENT HERE]
      </FILE_END>

      FRAMEWORK VALIDATION (CRITICAL):
      The user's currently selected build environment is: ${framework}.
      If the user's prompt explicitly requests a DIFFERENT framework, YOU MUST REFUSE TO WRITE CODE. Return an empty array [] for files.
      Instead, output EXACTLY this XML tag and nothing else:
      <MISMATCH requested="[framework_name]" />
    `;

    if (globalRulesText) systemPromptBase += globalRulesText;

    if (taggedFiles && Array.isArray(taggedFiles) && taggedFiles.length > 0) {
      systemPromptBase += `
      🎯 CONTEXT SELECTOR ACTIVE: 
      The user specifically tagged these files: ${taggedFiles.join(', ')}.
      YOU MUST FOCUS YOUR CHANGES STRICTLY ON THESE FILES. Do not modify other files unless absolutely necessary.
      `;
    }

    if (framework === "nextjs") {
      systemPromptBase += `
      NEXT.JS RULES:
      1. CORE: Generate "/app/page.tsx" and "/package.json".
      2. DO NOT GENERATE LAYOUT: Do not generate "/app/layout.tsx". Focus entirely on page.tsx.
      3. REACT HOOKS: Put "use client"; at the very top if using hooks.
      4. NO METADATA EXPORTS: Do not export 'const metadata'.
      5. STACKBLITZ: Include standard tailwind.config.js and postcss.config.js.
      6. TAILWIND: Use standard @tailwind directives in /app/globals.css.
      7. ANTI-TRUNCATION: Never generate massive mock data arrays. Use lucide-react.
      8. BACKEND: Use "/app/api/[route]/route.ts" for backend APIs.
      `;
    } else if (framework === "react-vite") {
      systemPromptBase += `
      REACT VITE RULES:
      1. CORE: Generate "/index.html", "/src/main.tsx", "/src/App.tsx", "/package.json", "/tailwind.config.js", and "/postcss.config.js".
      2. HTML ENTRY: Must contain <div id="root"></div> and <script type="module" src="/src/main.tsx"></script>.
      3. CONFIG SYNTAX: Must use ES Module syntax. NEVER use module.exports.
      `;
    } else if (framework === "vue-vite") {
      systemPromptBase += `
      VUE 3 VITE RULES:
      1. CORE: Generate "/index.html", "/src/main.ts", "/src/App.vue", "/package.json", "/tailwind.config.js", and "/postcss.config.js".
      2. VUE MOUNT: call createApp(App).mount('#app').
      3. CONFIG SYNTAX: Must use ES Module syntax. NEVER use module.exports.
      `;
    } else if (framework === "angular") {
      systemPromptBase += `
      ANGULAR 17+ RULES:
      1. CORE: Generate "/src/index.html", "/src/main.ts", "/src/app/app.component.ts", "/src/app/app.component.html", "/src/styles.css", and "/package.json".
      2. BOOTSTRAP: bootstrapApplication(AppComponent).
      `;
    } else if (framework === "vanilla-vite") {
      systemPromptBase += `
      VANILLA JS VITE RULES:
      1. CORE: Generate "/index.html", "/main.js", "/style.css", and "/package.json".
      `;
    }

    let conversationTranscript = "";
    if (messages && Array.isArray(messages)) {
      conversationTranscript = messages
        .map((m: {role: string, content: string}) => `${m.role === 'user' ? 'USER' : 'ASSISTANT'}: ${m.content}`)
        .join('\n\n');
    }

    const finalPromptText = isUpdateMode 
      ? `${systemPromptBase}
      
UPDATE MODE: You are modifying an existing project.

CURRENT FILES:
${JSON.stringify(currentFiles)}

CONVERSATION HISTORY:
${conversationTranscript}

CRITICAL INSTRUCTION: DO NOT USE SEARCH AND REPLACE!
Read the Conversation History, then rewrite the ENTIRE FILE for any file you need to change.

RULES:
1. ONLY output <FILE_START> tags for files you explicitly modified.
2. Output the ENTIRE, completely updated file content from top to bottom.
3. PRESERVE THE EXISTING APPLICATION! If fixing an error, keep the original UI completely intact.
4. CONVERSATION OVERRIDE: If the user is just asking a question, DO NOT output any <FILE_START> tags.
5. AUTO-LEARNING: If fixing a real programming error, output a universal rule at the end:
<NEW_RULE>When doing X, always ensure Y is implemented to prevent Z error.</NEW_RULE>`
      : `${systemPromptBase}\n\nCREATE MODE: You are in an empty workspace.\n\nCONVERSATION HISTORY:\n${conversationTranscript}\n\nINSTRUCTION:\n1. If the user explicitly describes an app, output a markdown message followed by the files using <FILE_START> tags.`;

    const promptParts: Array<string | Part> = [finalPromptText];

    if (attachedImages && Array.isArray(attachedImages) && attachedImages.length > 0) {
      promptParts.push(`\nVISION MODE ENGAGED:\nThe user attached ${attachedImages.length} image(s). Analyze the layout, typography, colors, and styling to recreate the visual structure perfectly.\n`);
      
      attachedImages.forEach(img => {
        try {
          const mimeType = img.substring(img.indexOf(":") + 1, img.indexOf(";"));
          const base64Data = img.substring(img.indexOf(",") + 1);
          promptParts.push({ inlineData: { data: base64Data, mimeType } });
        } catch (err) {
          console.warn("[API] ⚠️ Failed to parse attached image data:", err);
        }
      });
    }

    let streamResult: GenerateContentStreamResult | null = null;
    let successfulKey: string | null = null;
    let lastErrorDetails = ""; 
    let firstChunk: EnhancedGenerateContentResponse | null = null;

    // 🚀 THE ULTIMATE FALLBACK LOOP (With Stream Probing to prevent mid-stream crashes)
    keyLoop: for (let keyIndex = 0; keyIndex < Math.min(API_KEYS.length, 5); keyIndex++) {
      const currentKey = API_KEYS[keyIndex];
      const genAI = new GoogleGenerativeAI(currentKey!);

      for (const modelName of MODEL_FALLBACK_LIST) {
        try {
          const generationConfig: GenerationConfig = {
            maxOutputTokens: 8192,
            temperature: 0.4 
          };

          const model = genAI.getGenerativeModel({ 
            model: modelName,
            generationConfig,
            safetySettings: [
              { category: HarmCategory.HARM_CATEGORY_HARASSMENT, threshold: HarmBlockThreshold.BLOCK_NONE },
              { category: HarmCategory.HARM_CATEGORY_HATE_SPEECH, threshold: HarmBlockThreshold.BLOCK_NONE }
            ]
          });

          streamResult = await model.generateContentStream(promptParts);
          
          // 🚀 THE PROBE: Force the first chunk to execute the API call instantly
          const iterator = streamResult.stream[Symbol.asyncIterator]();
          const firstYield = await iterator.next();
          
          if (!firstYield.done) {
            firstChunk = firstYield.value;
          }

          successfulKey = currentKey!;
          break keyLoop; 
        } catch (e: unknown) {
          lastErrorDetails = e instanceof Error ? e.message : String(e);
          if (lastErrorDetails.includes("429") || lastErrorDetails.includes("Quota")) {
              break; // Key is dead. Break the model loop and try the next API key.
          }
          continue; // Key is fine, but model failed. Try the next model.
        }
      }
    }

    if (!streamResult) {
      return NextResponse.json(
        { error: `All API keys and models failed. Last error: ${lastErrorDetails}` }, 
        { status: 500 }
      );
    }

    const stream = new ReadableStream({
      async start(controller) {
        let fullText = "";
        
        const processChunk = (chunk: EnhancedGenerateContentResponse) => {
          const chunkText = chunk.text();
          fullText += chunkText;
          controller.enqueue(new TextEncoder().encode(chunkText));
        };

        try {
          // Send the probed chunk first
          if (firstChunk) processChunk(firstChunk);
          
          // Then stream the rest naturally
          for await (const chunk of streamResult!.stream) {
            processChunk(chunk);
          }
        } catch (err) {
          controller.error(err);
        } finally {
          controller.close(); 
          
          if (isUpdateMode && successfulKey) {
             processAutoLearning(fullText, successfulKey, latestUserMessage).catch(err => {
                 console.error("[HIVE MIND] Background task failed:", err);
             });
          }
        }
      }
    });

    return new Response(stream, {
      headers: {
        "Content-Type": "text/plain; charset=utf-8",
        "Transfer-Encoding": "chunked",
      }
    });

  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : "An unexpected server error occurred";
    return NextResponse.json({ error: errorMessage }, { status: 500 });
  }
}