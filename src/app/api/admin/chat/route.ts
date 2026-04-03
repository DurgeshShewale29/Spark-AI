import { 
  GoogleGenerativeAI, 
  SchemaType, 
  type FunctionCall, 
  type ChatSession, 
  type GenerateContentStreamResult,
  type EnhancedGenerateContentResponse
} from "@google/generative-ai";
import { NextResponse } from "next/server";
import { connectToDB } from "@/lib/db";
import GlobalRule from "@/models/GlobalRule";

export const maxDuration = 60;

interface RawRule {
  _id: { toString: () => string };
  content: string;
  isActive?: boolean;
  isDeleted?: boolean;
}

type ChatMessage = {
  role: string;
  content: string;
};

export async function POST(req: Request) {
  try {
    const { messages, customApiKey } = await req.json();
    
    let availableKeys: string[] = [];
    if (process.env.GEMINI_API_KEY) availableKeys.push(process.env.GEMINI_API_KEY);
    
    for (let i = 1; i <= 20; i++) {
      const alt = process.env[`GEMINI_API_KEY_ALT_${i}`];
      if (alt) availableKeys.push(alt);
    }
    
    availableKeys = availableKeys.sort(() => Math.random() - 0.5);
    const API_KEYS = customApiKey ? [customApiKey, ...availableKeys] : availableKeys;

    if (API_KEYS.length === 0) {
      return NextResponse.json({ error: "API Key pool is empty. Please add keys to your .env" }, { status: 500 });
    }

    await connectToDB();
    const rawRules = (await GlobalRule.find({}).lean()) as RawRule[];
    const activeRules = rawRules.filter((r) => r.isActive !== false && r.isDeleted !== true);
    
    const rulesDatabaseText = activeRules.length > 0 
      ? activeRules.map((r) => `[RULE_ID: ${r._id.toString()}] - ${r.content}`).join("\n")
      : "No active rules currently in the database.";

    // 🚀 FIXED: Upgraded to Enterprise Zero-Hallucination Prompt
    const systemPrompt = `
      You are the "Hive Mind Overseer", an elite, highly analytical AI Compliance Officer for Spark AI.
      Your absolute top priority is ZERO HALLUCINATION. You are a precise instrument.

      HERE IS THE LIVE DATABASE OF CURRENT ACTIVE RULES:
      --------------------------------------------------
      ${rulesDatabaseText}
      --------------------------------------------------

      CRITICAL DIRECTIVES (YOU MUST OBEY THESE):
      1. NO GUESSING: If a user asks about a rule or concept NOT present in the database above, you MUST explicitly state: "I cannot find any data on that in the current Hive Mind database."
      2. ALWAYS CITE: When discussing a rule, you MUST wrap its ID in brackets, like this: [RULE_ID: 12345].
      3. ARCHIVE ONLY: You do NOT have permission to permanently delete. If asked to "delete" or "remove", you MUST use the 'archive_rules' tool.

      EXAMPLES OF PERFECT BEHAVIOR:
      User: "Delete rule 67890."
      Overseer: "I do not have authorization to permanently delete data. However, I have successfully executed the archive command to move [RULE_ID: 67890] to the Recycle Bin."

      User: "What is our rule on using AWS?"
      Overseer: "I cannot find any rules regarding AWS in the current Hive Mind database. Would you like to inject a new manual rule?"

      User: "Scan for duplicate rules."
      Overseer: "Scanning complete. I have identified a conflict: [RULE_ID: 111] states we use React, but [RULE_ID: 222] states we use Vue. Would you like me to archive one of these?"

      Begin operation.
    `;

    const validMessages = messages.filter((m: ChatMessage) => !m.content.includes("Greetings, Admin"));
    const history = validMessages.slice(0, -1).map((m: ChatMessage) => ({
      role: m.role === "user" ? "user" : "model",
      parts: [{ text: m.content }]
    }));
    const latestMessage = validMessages[validMessages.length - 1].content;

    let streamResult: GenerateContentStreamResult | null = null;
    let successfulChat: ChatSession | null = null;
    let lastErrorDetails = "";
    let firstChunk: EnhancedGenerateContentResponse | null = null;

    for (const currentKey of API_KEYS) {
      try {
        const genAI = new GoogleGenerativeAI(currentKey);
        
        // 🚀 FIXED: Locked the AI's creativity to 0 for maximum factual accuracy
        const model = genAI.getGenerativeModel({ 
          model: "gemini-2.5-flash",
          generationConfig: {
            temperature: 0,
            topP: 0.1,
          }
        });

        const chat = model.startChat({
          history: [
            { role: "user", parts: [{ text: systemPrompt }] },
            { role: "model", parts: [{ text: "Understood. I am the Overseer. My archive tools are online and I will not hallucinate." }] },
            ...history
          ],
          tools: [{
            functionDeclarations: [{
              name: "archive_rules",
              description: "Safely moves one or multiple rules to the recycle bin by setting their isDeleted flag to true.",
              parameters: {
                type: SchemaType.OBJECT, 
                properties: {
                  ruleIds: { 
                    type: SchemaType.ARRAY, 
                    items: { type: SchemaType.STRING },
                    description: "An array of exact MongoDB _id strings of the rules to move to the trash." 
                  }
                },
                required: ["ruleIds"]
              }
            }]
          }]
        });

        streamResult = await chat.sendMessageStream(latestMessage);
        
        const iterator = streamResult.stream[Symbol.asyncIterator]();
        const firstYield = await iterator.next();
        
        if (!firstYield.done) {
          firstChunk = firstYield.value;
        }

        successfulChat = chat; 
        break;

      } catch (e: unknown) {
        lastErrorDetails = e instanceof Error ? e.message : String(e);
        if (lastErrorDetails.includes("429") || lastErrorDetails.includes("Quota")) {
          continue; 
        } else {
          break; 
        }
      }
    }

    if (!streamResult || !successfulChat) {
      return NextResponse.json({ 
        error: `All API keys are maxed out. Last error: ${lastErrorDetails}` 
      }, { status: 500 });
    }

    const stream = new ReadableStream({
      async start(controller) {
        const state: { functionCall: FunctionCall | null } = { functionCall: null };

        const handleChunk = (chunk: EnhancedGenerateContentResponse) => {
          const calls = chunk.functionCalls();
          if (calls && calls.length > 0) {
            state.functionCall = calls[0]; 
            return true; 
          }
          try {
            const chunkText = chunk.text();
            if (chunkText) controller.enqueue(new TextEncoder().encode(chunkText));
          } catch {}
          return false;
        };

        try {
          let shouldStop = false;
          if (firstChunk) shouldStop = handleChunk(firstChunk);
          
          if (!shouldStop) {
            for await (const chunk of streamResult!.stream) {
              if (handleChunk(chunk)) break;
            }
          }

          if (state.functionCall && state.functionCall.name === "archive_rules") {
            const args = state.functionCall.args as { ruleIds: string[] };
            const ruleIds = args.ruleIds || [];
            let executionMessage = "";

            try {
              const result = await GlobalRule.updateMany(
                { _id: { $in: ruleIds } },
                { $set: { isDeleted: true, isActive: false } },
                { strict: false } 
              );
              
              executionMessage = `SUCCESS: ${result.modifiedCount} rules were successfully moved to the recycle bin.`;
              console.log(`[OVERSEER] 🗑️ Soft Deletion (Sent to Trash) Successful for: ${ruleIds.join(', ')}`);
            } catch {
              executionMessage = `ERROR: Failed to connect to database or invalid IDs provided.`;
            }

            const followUpStream = await successfulChat!.sendMessageStream([{
              functionResponse: { name: "archive_rules", response: { status: executionMessage } }
            }]);

            for await (const finalChunk of followUpStream.stream) {
              try {
                const text = finalChunk.text();
                if (text) controller.enqueue(new TextEncoder().encode(text));
              } catch {}
            }
          }

        } catch (err: unknown) {
          const msg = err instanceof Error ? err.message : String(err);
          const errorMessage = msg.includes("429") || msg.includes("Quota") 
            ? "\n\n⚠️ **SYSTEM OVERRIDE:** Quota limit reached mid-stream. Please try again."
            : "\n\n⚠️ **SYSTEM OVERRIDE:** Connection interrupted.";
          
          controller.enqueue(new TextEncoder().encode(errorMessage));
        } finally {
          controller.close();
        }
      }
    });

    return new Response(stream, {
        headers: { "Content-Type": "text/plain; charset=utf-8", "Transfer-Encoding": "chunked" }
    });

  } catch (error: unknown) {
    console.error("[ADMIN CHAT ERROR]", error);
    const errorMessage = error instanceof Error ? error.message : "Failed to connect to Overseer core";
    return NextResponse.json({ error: errorMessage }, { status: 500 });
  }
}