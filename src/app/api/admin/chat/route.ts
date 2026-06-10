import OpenAI from "openai";
import { NextResponse } from "next/server";
import { connectToDB } from "@/lib/db";
import GlobalRule from "@/models/GlobalRule";
import { getAvailableApiKey } from "@/lib/apiKeyManager";

export const maxDuration = 60;

interface RawRule {
  _id: { toString: () => string };
  content: string;
  isActive?: boolean;
  isDeleted?: boolean;
}

type ChatMessage = {
  role: "user" | "model" | "assistant";
  content: string;
};

export async function POST(req: Request) {
  try {
    const { messages, customApiKey } = await req.json();
    
    const apiKey = getAvailableApiKey(customApiKey);

    if (!apiKey) {
      return NextResponse.json({ error: "API Key pool is empty. Please add keys to your .env" }, { status: 500 });
    }

    const openai = new OpenAI({ 
      apiKey: apiKey, 
      baseURL: apiKey.startsWith('gsk_') ? 'https://api.groq.com/openai/v1' : undefined 
    });

    await connectToDB();
    const rawRules = (await GlobalRule.find({}).lean()) as RawRule[];
    const activeRules = rawRules.filter((r) => r.isActive !== false && r.isDeleted !== true);
    
    const rulesDatabaseText = activeRules.length > 0 
      ? activeRules.map((r) => `[RULE_ID: ${r._id.toString()}] - ${r.content}`).join("\n")
      : "No active rules currently in the database.";

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
    const history: OpenAI.Chat.Completions.ChatCompletionMessageParam[] = validMessages.map((m: ChatMessage) => ({
      role: m.role === "model" ? "assistant" : "user",
      content: m.content
    }));

    const tools: OpenAI.Chat.Completions.ChatCompletionTool[] = [{
      type: "function",
      function: {
        name: "archive_rules",
        description: "Safely moves one or multiple rules to the recycle bin by setting their isDeleted flag to true.",
        parameters: {
          type: "object", 
          properties: {
            ruleIds: { 
              type: "array", 
              items: { type: "string" },
              description: "An array of exact MongoDB _id strings of the rules to move to the trash." 
            }
          },
          required: ["ruleIds"]
        }
      }
    }];

    const allMessages: OpenAI.Chat.Completions.ChatCompletionMessageParam[] = [
      { role: "system", content: systemPrompt },
      { role: "assistant", content: "Understood. I am the Overseer. My archive tools are online and I will not hallucinate." },
      ...history
    ];

    const stream = await openai.chat.completions.create({
      model: "llama-3.3-70b-versatile",
      messages: allMessages,
      tools: tools,
      temperature: 0,
      stream: true,
    });

    const readableStream = new ReadableStream({
      async start(controller) {
        try {
          let functionName = "";
          let functionArgs = "";

          for await (const chunk of stream) {
            const delta = chunk.choices[0]?.delta;
            if (delta?.tool_calls) {
              const toolCall = delta.tool_calls[0];
              if (toolCall.function?.name) functionName = toolCall.function.name;
              if (toolCall.function?.arguments) functionArgs += toolCall.function.arguments;
            } else if (delta?.content) {
              controller.enqueue(new TextEncoder().encode(delta.content));
            }
          }

          if (functionName === "archive_rules") {
            const args = JSON.parse(functionArgs || "{}");
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

            const toolCallId = "call_" + Math.random().toString(36).substring(7);

            // Call again with tool response
            allMessages.push({
              role: "assistant",
              content: null,
              tool_calls: [{
                id: toolCallId,
                type: "function",
                function: { name: functionName, arguments: functionArgs }
              }]
            });
            allMessages.push({
              role: "tool",
              tool_call_id: toolCallId,
              content: executionMessage
            });

            const followUpStream = await openai.chat.completions.create({
              model: "llama-3.3-70b-versatile",
              messages: allMessages,
              temperature: 0,
              stream: true,
            });

            for await (const chunk of followUpStream) {
              const delta = chunk.choices[0]?.delta;
              if (delta?.content) {
                controller.enqueue(new TextEncoder().encode(delta.content));
              }
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

    return new Response(readableStream, {
        headers: { "Content-Type": "text/plain; charset=utf-8", "Transfer-Encoding": "chunked" }
    });

  } catch (error: unknown) {
    console.error("[ADMIN CHAT ERROR]", error);
    const errorMessage = error instanceof Error ? error.message : "Failed to connect to Overseer core";
    return NextResponse.json({ error: errorMessage }, { status: 500 });
  }
}