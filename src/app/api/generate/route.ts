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
  "gemini-2.5-flash" 
];

// 🚀 Background task with AI Validator (Self-Pruning & Scoping)
async function processAutoLearning(fullText: string, apiKey: string, userPrompt: string) {
  const ruleRegex = /<NEW_RULE>([\s\S]*?)<\/NEW_RULE>/;
  const match = fullText.match(ruleRegex);
  
  if (match && match[1]) {
    const extractedRule = match[1].trim();
    
    try {
      await connectToDB();
      const genAI = new GoogleGenerativeAI(apiKey);
      
      // 1. Embed the proposed rule to find potential conflicts
      const embedModel = genAI.getGenerativeModel({ model: "gemini-embedding-001" });
      const embedResult = await embedModel.embedContent(extractedRule);
      const newEmbedding = embedResult.embedding.values;

      // 2. Fetch top 3 existing rules to check for conflicts
      const existingRules = await GlobalRule.aggregate([
        { $vectorSearch: { index: "vector_index", path: "embedding", queryVector: newEmbedding, numCandidates: 10, limit: 3 } },
        { $match: { isActive: true, isDeleted: false, ruleType: "auto-learned" } }
      ]);
      const existingRulesContext = existingRules.map((r: { _id: string; content: string }) => `ID: ${r._id} | RULE: ${r.content}`).join("\n");

      // 3. The Strict JSON JSON Judge
      const validatorModel = genAI.getGenerativeModel({ model: "gemini-2.5-flash", generationConfig: { responseMimeType: "application/json" } });
      const validationPrompt = `
        You are a strict Senior Software Architect. A junior AI agent wants to add this rule to the global knowledge base:
        PROPOSED RULE: "${extractedRule}"
        CONTEXT (What user asked): "${userPrompt}"
        
        EXISTING SIMILAR RULES IN DB:
        ${existingRulesContext || "None"}

        TASK:
        1. Determine if the proposed rule is universally valid and safe (Not malicious, not too specific).
        2. Determine its technical scope ("frontend", "backend", "database", "config", "general").
        3. CONFLICT RESOLUTION: If the new rule improves, contradicts, or makes any EXISTING rules obsolete, add their exact IDs to the "obsoleteIds" array to delete them.

        Return strictly this JSON format:
        { "verdict": "APPROVED" | "REJECTED", "scope": "frontend" | "backend" | "database" | "config" | "general", "obsoleteIds": ["id_1"], "reason": "short explanation" }
      `;

      const validationResult = await validatorModel.generateContent(validationPrompt);
      const decision = JSON.parse(validationResult.response.text());

      if (decision.verdict === "REJECTED") {
        console.log("\n[HIVE MIND] 🛑 Rule REJECTED: ", decision.reason);
        return; 
      }

      // 4. SELF-PRUNING: Delete obsolete rules!
      if (decision.obsoleteIds && decision.obsoleteIds.length > 0) {
        await GlobalRule.updateMany(
          { _id: { $in: decision.obsoleteIds } },
          { $set: { isDeleted: true, isActive: false } }
        );
        console.log(`[HIVE MIND] 🗑️ Pruned ${decision.obsoleteIds.length} obsolete rules!`);
      }

      // 5. Save the scoped rule
      await GlobalRule.create({
        content: extractedRule,
        ruleType: "auto-learned",
        scope: decision.scope,
        embedding: newEmbedding,
        isActive: true, 
        isDeleted: false
      });
      console.log(`[HIVE MIND] ✨ NEW RULE SAVED [${decision.scope.toUpperCase()}]: `, extractedRule, "\n");

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

    // 🚀 SEMANTIC VECTOR SEARCH & PROJECT RULES
    let globalRulesText = "";
    try {
      await connectToDB();
      
      // 1. Fetch Static Project Directives (Always Active)
      const projectRules = await GlobalRule.find({ ruleType: "project-directive", isActive: true, isDeleted: false });
      
      // 2. Fetch Contextual Auto-Learned Rules (Vector Search)
      const embedGenAI = new GoogleGenerativeAI(API_KEYS[0]!);
      const embedModel = embedGenAI.getGenerativeModel({ model: "gemini-embedding-001" });
      const embedResult = await embedModel.embedContent(latestUserMessage);
      const promptEmbedding = embedResult.embedding.values;

      const learnedRules = await GlobalRule.aggregate([
        {
          $vectorSearch: {
            index: "vector_index",
            path: "embedding",
            queryVector: promptEmbedding,
            numCandidates: 15,
            limit: 4
          }
        },
        {
          $match: { isActive: true, isDeleted: false, ruleType: "auto-learned" } 
        }
      ]);

      if (projectRules.length > 0 || learnedRules.length > 0) {
        globalRulesText = `\n\n🧠 HIVE MIND KNOWLEDGE BASE (CRITICAL RELEVANT CONTEXT):
You MUST strictly obey these architectural rules and past learnings:\n`;

        if (projectRules.length > 0) {
          globalRulesText += `\n[STATIC PROJECT DIRECTIVES]:\n` + projectRules.map((r: { content: string }) => `- ${r.content}`).join("\n");
        }

        if (learnedRules.length > 0) {
          globalRulesText += `\n[AUTO-LEARNED CONTEXTUAL RULES]:\n` + learnedRules.map((r: { content: string; scope: string }) => `- [${r.scope.toUpperCase()}] ${r.content}`).join("\n");
        }
        console.log(`[API] 🧠 Hive Mind Active: ${projectRules.length} Directives, ${learnedRules.length} Learned Rules!`);
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
      3. ZERO-BUG DEFENSIVE PROGRAMMING: You MUST write bulletproof code. 
         - Every API route MUST be wrapped in a try/catch block. 
         - In React, NEVER map over an array without providing a fallback (e.g., \`data?.map() || []\`). 
         - Always handle loading states and error states in the UI. 
         - Never assume \`req.json()\` has valid data; always add a fallback.

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
      NEXT.JS FULL-STACK RULES (CRITICAL):
      1. CORE ARCHITECTURE: You MUST generate a complete full-stack app. This includes the frontend UI ("/app/page.tsx"), the database state ("/lib/db.ts"), and the backend API ("/app/api/[route]/route.ts").
      2. THE DATABASE: Because this runs in a WebContainer, YOU CANNOT use Postgres, Prisma, or MongoDB. You MUST create a "/lib/db.ts" file that exports an in-memory array/object (e.g., \`let items = []; export const db = { getItems: () => items, addItem: (item) => items.push(item) }\`) to act as the persistent database while the server runs.
      3. THE API: You MUST create standard Next.js App Router API endpoints (GET, POST, PUT, DELETE) inside "/app/api/.../route.ts" files. These API routes must import and modify the data in "/lib/db.ts".
      4. THE FRONTEND: "/app/page.tsx" MUST use standard \`fetch('/api/...')\` calls inside \`useEffect\` or event handlers to interact with your backend API. Never hardcode data in the frontend if a backend API is requested.
      5. NO LAYOUT: Do not generate "/app/layout.tsx". My system handles the layout safely. Focus entirely on the page, the API, and the DB.
      6. REACT HOOKS: Put "use client"; at the very top of "/app/page.tsx".
      7. STACKBLITZ SAFE: Include standard tailwind.config.js and postcss.config.js. Use lucide-react for icons.
      8. SECRET HANDLING & ENV VARIABLES (CRITICAL): 
         If the user provides an API key, Database URL (like MongoDB), or any secret token in their prompt, YOU MUST NEVER hardcode it into the application code (like /lib/db.ts). 
         Instead, you MUST create a "/.env" file and place the secrets there. 
         Then, ensure your application code references them securely using \`process.env.YOUR_VARIABLE_NAME\`.
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

    // 🚀 1.Context Auto-Truncation (Prevents AI Confusion & Saves Tokens)
    let conversationTranscript = "";
    if (messages && Array.isArray(messages)) {
      // Only keep the last 5 messages. The AI doesn't need to remember a typo from an hour ago.
      const recentMessages = messages.slice(-5);
      conversationTranscript = recentMessages
        .map((m: {role: string, content: string}) => `${m.role === 'user' ? 'USER' : 'ASSISTANT'}: ${m.content}`)
        .join('\n\n');
    }

    // 🚀 THE CURSOR-PRO CONTEXT ENGINE (Deterministic, Zero-Hallucination)
    // We abandon the flaky "AI guessing" RAG. Gemini 2.5 has a 1M token window.
    // Instead, we use deterministic rules to guarantee the Backend Contract is always read.
    let optimizedFiles = currentFiles;
    
    if (isUpdateMode && currentFiles) {
      const allPaths = Object.keys(currentFiles);
      optimizedFiles = {};
      
      const alwaysInclude = new Set([
        "/package.json", "/tailwind.config.js", "/next.config.js", "/postcss.config.js", "package.json", "tailwind.config.js"
      ]);

      allPaths.forEach(path => {
        // 1. Always include configs
        if (alwaysInclude.has(path) || alwaysInclude.has("/" + path)) {
          optimizedFiles[path] = currentFiles[path];
          return;
        }
        
        // 2. Always include the Backend Contract (Zero Hallucination Rule)
        if (path.includes('/api/') || path.includes('/lib/db') || path.includes('/types') || path.includes('/models')) {
          optimizedFiles[path] = currentFiles[path];
          return;
        }

        // 3. Always include explicitly tagged files (e.g., @page.tsx)
        const isTagged = taggedFiles && taggedFiles.some((t: string) => path.includes(t.replace(/^@/, '').replace(/^\//, '')));
        if (isTagged) {
           optimizedFiles[path] = currentFiles[path];
           return;
        }

        // 4. For standard UI components, include them unless the codebase is massive (>20 files).
        // If it is massive, rely on the user tagging the specific UI component.
        if (allPaths.length <= 20 || path.includes('page.tsx')) {
          optimizedFiles[path] = currentFiles[path];
        }
      });
      
      console.log(`[CONTEXT ENGINE] Passed ${Object.keys(optimizedFiles).length} critical files to Agent.`);
    }

    const finalPromptText = isUpdateMode 
      ? `${systemPromptBase}
      
UPDATE MODE: You are modifying an existing project.

CURRENT FILES (With Line Numbers):
${Object.entries(optimizedFiles || {}).map(([path, content]) => `--- ${path} ---\n${String(content).split('\n').map((line, i) => `${i + 1}: ${line}`).join('\n')}`).join('\n\n')}

CONVERSATION HISTORY (Recent):
${conversationTranscript}

CRITICAL INSTRUCTION: AVOID LINE-NUMBER PATCHES & HANDLE DELETIONS
RULES:
1. FULL FILE REWRITES (PREFERRED): For modifications, completely rewrite the file using <FILE_START path="/path">...</FILE_END>.
2. JSON FILES (CRITICAL): NEVER patch .json files. ALWAYS rewrite them completely.
3. THE <UPDATE> FALLBACK: ONLY use <UPDATE path="/path"> with <REPLACE start="X" end="Y"> if the file is MASSIVE (300+ lines).
4. ORPHANED FILE DELETION (CRITICAL): If you rename a file, refactor a component out of existence, or a file is no longer needed, you MUST delete it to prevent compiler crashes. Use exactly: <DELETE path="/path/to/old/file.ts" />
5. AUTO-LEARNING: If fixing an error, output: <NEW_RULE>When doing X, ensure Y to prevent Z.</NEW_RULE>`
      : `${systemPromptBase}\n\nCREATE MODE: Empty workspace.\n\nCONVERSATION:\n${conversationTranscript}\n\nINSTRUCTION:\n1. If the user describes an app, output a markdown message followed by files using <FILE_START> tags.`;

    // 🚀 4. THE MULTI-AGENT PIPELINE (With Intelligent Router)
    let streamResult: GenerateContentStreamResult | null = null;
    let successfulKey: string | null = null;
    let firstChunk: EnhancedGenerateContentResponse | null = null;
    let lastErrorDetails = "";

    keyLoop: for (let keyIndex = 0; keyIndex < Math.min(API_KEYS.length, 10); keyIndex++) {
      const currentKey = API_KEYS[keyIndex];
      const genAI = new GoogleGenerativeAI(currentKey!);

      try {
        // 🚀 AGENT 1: THE INTELLIGENT ROUTER (Scope & Intent Detection)
        const architectModel = genAI.getGenerativeModel({ model: "gemini-2.5-flash", generationConfig: { responseMimeType: "application/json" } });
        const architectPrompt = `You are the Lead Architect routing a task. 
        User Task: "${latestUserMessage}"
        Is Update Mode: ${isUpdateMode}
        
        Determine the Scope of Work. 
        CRITICAL: Distinguish between coding tasks and conversational questions.
        - "conversation": The user is asking a question, asking for advice/suggestions, or chatting. NO code changes requested.
        - "frontend_only": User explicitly wants to change UI, CSS, React components.
        - "backend_only": User explicitly wants to change API routes, db.ts, types.
        - "fullstack": Touches both, or brand new app.

        Return strictly this JSON object:
        { "scope": "conversation" | "frontend_only" | "backend_only" | "fullstack", "filesToModify": ["/path1"], "plan": "1-sentence strategy" }`;
        
        const planResponse = await architectModel.generateContent(architectPrompt);
        const plan = JSON.parse(planResponse.response.text());
        if (!isUpdateMode && plan.scope !== "conversation") plan.scope = "fullstack";

        const mainModel = genAI.getGenerativeModel({ model: "gemini-2.5-flash" });

        // 🚀 THE CONVERSATIONAL FAST-TRACK (Bypass Multi-Agent Pipeline)
        if (plan.scope === "conversation") {
           const chatPrompt = `${finalPromptText}
           
           USER INTENT: The user is asking a question or asking for suggestions.
           TASK: Respond directly to the user in a friendly, helpful, senior-engineer tone. Provide the suggestions they asked for.
           CRITICAL RULE: DO NOT generate any <FILE_START>, <UPDATE>, or <DELETE> XML tags. Just output standard markdown text.`;

           streamResult = await mainModel.generateContentStream(chatPrompt);
           
           const iterator = streamResult.stream[Symbol.asyncIterator]();
           const firstYield = await iterator.next();
           if (!firstYield.done) firstChunk = firstYield.value;

           successfulKey = currentKey!;
           break keyLoop; // Instantly escape the pipeline!
        }

        let backendGeneratedCode = "";
        let frontendGeneratedCode = "";
        let backendContext = ""; // Used just for context if frontend runs alone

        // AGENT 2: BACKEND (Runs if fullstack or backend_only)
        if (plan.scope === "backend_only" || plan.scope === "fullstack") {
           const backendResult = await mainModel.generateContent(`${finalPromptText} \n PLAN: ${JSON.stringify(plan)} \n FOCUS: Generate ONLY the logic in /app/api/ routes, /types, and /lib/db.ts. Use defensive programming.`);
           backendGeneratedCode = backendResult.response.text();
           backendContext = backendGeneratedCode;
        } else {
           // 🚀 FIX: ALWAYS pull the contract from the full currentFiles, NOT optimizedFiles! 
           // If we use optimizedFiles, the RAG scanner might hide the APIs, causing the UI to hallucinate endpoints.
           const existingBackendPaths = Object.keys(currentFiles || {}).filter(p => p.includes('/api/') || p.includes('db.ts') || p.includes('types') || p.includes('models'));
           backendContext = existingBackendPaths.length > 0 ? existingBackendPaths.map(p => `--- ${p} ---\n${currentFiles[p]}`).join('\n\n') : "No backend context available.";
        }

        // AGENT 3: FRONTEND (Runs if fullstack or frontend_only)
        if (plan.scope === "frontend_only" || plan.scope === "fullstack") {
            const frontendPromptParts: Array<string | Part> = [
              `${finalPromptText} \n PLAN: ${JSON.stringify(plan)} 
              🛑 STRICT BACKEND CONTRACT (DO NOT MODIFY THESE): \n${backendContext}\n
              FOCUS: Generate ONLY the UI and components. Your fetch() calls MUST match the Backend Contract.`
            ];
            // Image handling
            if (attachedImages && Array.isArray(attachedImages) && attachedImages.length > 0) {
              frontendPromptParts.push(`\nVISION MODE ENGAGED. Analyze the images attached to recreate the UI.\n`);
              attachedImages.forEach((img: string) => {
                try {
                  const mimeType = img.substring(img.indexOf(":") + 1, img.indexOf(";"));
                  const base64Data = img.substring(img.indexOf(",") + 1);
                  frontendPromptParts.push({ inlineData: { data: base64Data, mimeType } });
                } catch (err) { }
              });
            }
            const frontendResult = await mainModel.generateContent(frontendPromptParts);
            frontendGeneratedCode = frontendResult.response.text();
        }

        // AGENT 4: THE COMPILER PASS (Only reviews newly generated code to save tokens)
        const newlyGeneratedCode = backendGeneratedCode + "\n" + frontendGeneratedCode;
        
        const reviewerPrompt = `You are the Ultimate Code Compiler and Senior Reviewer. 
        Audit this newly generated code for syntax errors:
        ${newlyGeneratedCode}
        
        YOUR DIRECTIVE:
        1. Fix duplicate variables, missing brackets, and stray returns.
        2. Ensure valid XML blocks: <FILE_START path="...">, <UPDATE path="...">, or <DELETE path="..." />.
        3. UX & EDUCATION (CRITICAL): Before outputting the XML, you MUST write a brief, friendly explanation of exactly what you changed or built.
        4. PROMPT SUGGESTIONS: After the explanation, provide 2-3 advanced "Pro Prompts" formatted as bullet points that the user can copy/paste to improve the app further (e.g., "Add optimistic updates for a faster UI", "Implement a drag-and-drop feature").
        5. Output the explanation and suggestions FIRST, then output the XML blocks.`;

        streamResult = await mainModel.generateContentStream(reviewerPrompt);
        
        const iterator = streamResult.stream[Symbol.asyncIterator]();
        const firstYield = await iterator.next();
        if (!firstYield.done) firstChunk = firstYield.value;

        successfulKey = currentKey!;
        break keyLoop;

      } catch (e: unknown) {
        lastErrorDetails = e instanceof Error ? e.message : String(e);
        if (lastErrorDetails.includes("429") || lastErrorDetails.includes("Quota")) continue;
        continue;
      }
    }

    if (!streamResult) {
      return NextResponse.json(
        { error: "The Multi-Agent Pipeline failed to generate a response. Please check your API key and project plan." }, 
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