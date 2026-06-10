import { 
  type GenerationConfig,
  type Part,
  type EnhancedGenerateContentResponse
} from "@google/generative-ai"; // Keeping types for TS compatibility with EnhancedGenerateContentResponse
import OpenAI from "openai";
import Anthropic from "@anthropic-ai/sdk";
import { NextResponse } from "next/server";
import { connectToDB } from "@/lib/db";
import GlobalRule from "@/models/GlobalRule";

export const maxDuration = 300; // 300 seconds (max for Vercel Pro tier)

class UniversalAIWrapper {
  private key: string;
  private provider: 'gemini' | 'openai' | 'anthropic' | 'groq';

  constructor(key: string) {
    this.key = key ? key.trim() : "";
    if (this.key.startsWith('AIza')) this.provider = 'gemini';
    else if (this.key.startsWith('gsk_')) this.provider = 'groq';
    else if (this.key.startsWith('sk-ant-')) this.provider = 'anthropic';
    else if (this.key.startsWith('sk-')) this.provider = 'openai';
    else this.provider = 'gemini'; // fallback
  }

  getGenerativeModel(options: { model: string, generationConfig?: any }) {
    if (this.provider === 'gemini') {
      throw new Error("Gemini provider is disabled. Please use Groq or OpenAI.");
    }
    
    return {
      generateContent: async (promptParts: any) => {
        let text = Array.isArray(promptParts) 
          ? promptParts.map((p: any) => (typeof p === 'string' ? p : p?.inlineData ? '[Image omitted for non-Gemini provider]' : '')).join('\n') 
          : String(promptParts);

        if (this.provider === 'anthropic') {
          const anthropic = new Anthropic({ apiKey: this.key });
          const res = await anthropic.messages.create({
            model: "claude-3-5-sonnet-latest",
            max_tokens: 8192,
            messages: [{ role: "user", content: text }]
          });
          const msg = res.content.find((c: any) => c.type === 'text');
          return { response: { text: () => msg ? (msg as any).text : "" } };
        } else {
          const isGroq = this.provider === 'groq';
          const openai = new OpenAI({ 
            apiKey: this.key, 
            baseURL: isGroq ? 'https://api.groq.com/openai/v1' : undefined 
          });
          const res = await openai.chat.completions.create({
            model: isGroq ? "llama-3.3-70b-versatile" : "gpt-4o",
            messages: [{ role: "user", content: text }],
            response_format: options.generationConfig?.responseMimeType === "application/json" ? { type: "json_object" } : undefined
          });
          return { response: { text: () => res.choices[0].message.content || "" } };
        }
      },
      generateContentStream: async (promptParts: any) => {
        let text = Array.isArray(promptParts) 
          ? promptParts.map((p: any) => (typeof p === 'string' ? p : p?.inlineData ? '[Image omitted for non-Gemini provider]' : '')).join('\n') 
          : String(promptParts);

        if (this.provider === 'anthropic') {
          const anthropic = new Anthropic({ apiKey: this.key });
          const stream = await anthropic.messages.create({
            model: "claude-3-5-sonnet-latest",
            max_tokens: 8192,
            messages: [{ role: "user", content: text }],
            stream: true
          });

          async function* generate() {
            for await (const chunk of stream) {
              if (chunk.type === 'content_block_delta' && chunk.delta.type === 'text_delta') {
                yield { text: () => (chunk.delta as any).text };
              }
            }
          }
          return { stream: generate() };
        } else {
          const isGroq = this.provider === 'groq';
          const openai = new OpenAI({ 
            apiKey: this.key, 
            baseURL: isGroq ? 'https://api.groq.com/openai/v1' : undefined 
          });
          const stream = await openai.chat.completions.create({
            model: isGroq ? "llama-3.3-70b-versatile" : "gpt-4o",
            messages: [{ role: "user", content: text }],
            stream: true
          });

          async function* generate() {
            for await (const chunk of stream) {
              const content = chunk.choices[0]?.delta?.content || "";
              if (content) {
                yield { text: () => content };
              }
            }
          }
          return { stream: generate() };
        }
      }
    };
  }
}


const MODEL_FALLBACK_LIST = [
  "llama-3.3-70b-versatile" 
];

// Hive Mind disabled due to removal of Gemini embeddings.
export async function POST(req: Request) {
  console.log("====== API GENERATE HIT ======");
  try {
    const { messages, currentFiles, attachedImages, customApiKey, framework = "nextjs", taggedFiles = [] } = await req.json();
    const isUpdateMode = currentFiles && Object.keys(currentFiles).length > 0;

    // 🚀 Dynamic 20-Key Load Balancer
    let availableKeys: string[] = [];
    if (process.env.GEMINI_API_KEY) availableKeys.push(process.env.GEMINI_API_KEY);
    
    for (let i = 1; i <= 20; i++) {
      const genericAlt = process.env[`API_KEY_ALT_${i}`];
      if (genericAlt) availableKeys.push(genericAlt);
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
      
      // 2. Disable Contextual Auto-Learned Rules (Requires Gemini Embeddings)
      let learnedRules: any[] = [];
      console.warn("[API] Gemini is disabled. Skipping contextual auto-learned rules.");

      if (projectRules.length > 0 || learnedRules.length > 0) {
        globalRulesText = `\n\n🧠 HIVE MIND KNOWLEDGE BASE (CRITICAL RELEVANT CONTEXT):
You MUST strictly obey these architectural rules and past learnings:\n`;

        if (projectRules.length > 0) {
          globalRulesText += `\n[STATIC PROJECT DIRECTIVES]:\n` + projectRules.map((r: { content: string }) => `- ${r.content}`).join("\n");
        }

        console.log(`[API] 🧠 Hive Mind Active: ${projectRules.length} Directives, 0 Learned Rules!`);
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
         - In React, NEVER map over an array without providing a fallback (e.g., \`(data || []).map()\`). 
         - Always handle loading states and error states in the UI. 
         - Never assume \`request.json()\` has valid data; always add a fallback.

      🚀 FULL-STACK & BACKEND RULES (CRITICAL FOR WEBCONTAINERS):
      1. NO NATIVE DATABASES: You CANNOT run native database daemons (MongoDB, PostgreSQL, SQLite) inside WebContainers.
      2. HANDLING DATABASE REQUESTS: You MUST either build a mock backend using Next.js API routes with IN-MEMORY ARRAYS, or provide standard client-side SDK code for external Cloud Databases.
      
      CRITICAL OUTPUT FORMAT (STREAMING COMPATIBILITY):
      You are streaming your response to the user. You MUST NOT output JSON.
      1. FIRST, write a friendly, concise conversational explanation of what you are building or fixing.
      2. THEN, for EVERY file you need to create or modify, output it using this exact XML structure:
      <FILE_START path="/app/page.tsx">
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
      NEXT.JS 14 APP ROUTER RULES (CRITICAL — READ EVERY LINE):

      === EXACT DIRECTORY TREE YOU MUST GENERATE ===
      /app/page.tsx          <- Main UI ("use client" at top)
      /app/api/xxx/route.ts  <- API endpoints (one per feature)
      /lib/db.ts             <- In-memory database with mock data
      /components/xxx.tsx    <- Reusable UI components (optional)
      /package.json          <- ONLY include extra dependencies the user needs

      === FILES OUR SYSTEM AUTO-GENERATES (DO NOT CREATE THESE) ===
      Our build system automatically injects these with correct settings.
      If you generate them, they will be DELETED and replaced. Save your tokens:
      - /tailwind.config.js  (auto-injected)
      - /postcss.config.js   (auto-injected)
      - /tsconfig.json       (auto-injected with @/* path alias)
      - /next.config.js      (auto-injected)
      - /app/layout.tsx      (auto-injected)
      - /app/globals.css     (auto-injected)

      === BANNED PATHS (NEVER GENERATE THESE) ===
      NEVER use /src/ directory. EVER. All paths start from root /.
      NEVER use /pages/ directory. EVER. We use App Router only.

      === 1. DATABASE TEMPLATE (/lib/db.ts) ===
      You MUST create /lib/db.ts as an in-memory store. NO Postgres, Prisma, MongoDB, or SQLite.
      Pre-fill with 5-10 realistic mock items so the UI looks alive instantly.
      Example:
      \`\`\`
      // /lib/db.ts
      export const db = {
        users: [
          { id: '1', name: 'Sarah Chen', email: 'sarah@example.com', avatar: 'https://i.pravatar.cc/150?u=sarah' },
          { id: '2', name: 'Alex Rivera', email: 'alex@example.com', avatar: 'https://i.pravatar.cc/150?u=alex' },
        ],
        // ... more collections as needed
      };
      \`\`\`

      === 2. API ROUTE TEMPLATE (/app/api/xxx/route.ts) ===
      You MUST use Next.js App Router syntax. NEVER use NextApiRequest/NextApiResponse.
      \`\`\`
      // /app/api/users/route.ts
      import { NextResponse } from 'next/server';
      import { db } from '@/lib/db';

      export async function GET() {
        return NextResponse.json(db.users);
      }

      export async function POST(request: Request) {
        try {
          const body = await request.json();
          const newUser = { id: Date.now().toString(), ...body };
          db.users.push(newUser);
          return NextResponse.json(newUser, { status: 201 });
        } catch (error) {
          return NextResponse.json({ error: 'Invalid request' }, { status: 400 });
        }
      }
      \`\`\`
      CRITICAL: Use \`import { db } from '@/lib/db';\` (the @ alias). This works because our tsconfig.json maps "@/*" to the project root.

      === 3. FRONTEND TEMPLATE (/app/page.tsx) ===
      \`\`\`
      'use client';
      import { useState, useEffect } from 'react';
      import { Home, Search, Bell } from 'lucide-react'; // NAMED icons only!

      export default function Page() {
        const [data, setData] = useState<any[]>([]);
        const [loading, setLoading] = useState(true);

        useEffect(() => {
          fetch('/api/users')
            .then(res => res.json())
            .then(setData)
            .catch(console.error)
            .finally(() => setLoading(false));
        }, []);

        if (loading) return <div className="flex items-center justify-center h-screen"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500" /></div>;

        return ( /* your UI here */ );
      }
      \`\`\`
      CRITICAL: fetch() is a GLOBAL browser API. NEVER import it from any library.

      === 4. BANNED IMPORTS (WILL CRASH THE APP) ===
      These imports DO NOT EXIST in our environment and will cause Module not found errors:
      - import fetch from 'node-fetch' -> DELETE (fetch is a global browser API)
      - import fetch from 'isomorphic-fetch' -> DELETE (fetch is a global browser API)
      - import fetch from 'cross-fetch' -> DELETE (fetch is a global browser API)
      - import { Icon } from 'lucide-react' -> Use NAMED icons: import { Home, User } from 'lucide-react'
      - import { NextApiRequest, NextApiResponse } from 'next' -> Use: import { NextResponse } from 'next/server'
      - import from 'fs', 'path', 'child_process', 'crypto' -> DELETE (Node.js built-ins)
      - import Image from 'next/image' -> Use standard <img> tag instead
      - import from 'next/font' -> DELETE (Google Fonts don't load in WebContainers)
      - import { useRouter } from 'next/navigation' -> DELETE (single-page app, no routing)
      - 'use server' directive -> DELETE (server actions not supported)
      
      CORRECT IMPORTS:
      - fetch('/api/...') is a global browser API, just call it directly
      - import { NextResponse } from 'next/server' for API routes
      - import { Home, Settings, User } from 'lucide-react' for icons
      - <img src="url" alt="" className="..." /> for images

      === 5. PACKAGE.JSON RULES ===
      - Pin EXACT versions. No ^ or ~ or "latest".
      - Our build system auto-merges your dependencies with the base framework deps (next, react, react-dom, lucide-react, tailwindcss, typescript are already included).
      - You only need to add EXTRA dependencies the user's app specifically needs (e.g., "framer-motion": "11.0.0", "recharts": "2.12.0", "date-fns": "3.3.1").
      - The "scripts" must be: { "dev": "next dev", "build": "next build" }

      === 6. CONFIG FILES ===
      DO NOT generate tailwind.config.js, postcss.config.js, tsconfig.json, next.config.js, layout.tsx, or globals.css.
      Our system auto-injects them with correct settings including the @/* path alias.
      Just use import { db } from '@/lib/db' in your code and it will work.

      === 7. SECRET HANDLING ===
      If the user provides API keys or secrets, create a /.env file. Reference via process.env.VARIABLE_NAME.
      NEVER hardcode secrets in source code.
      `;
    } else if (framework === "react-vite") {
      systemPromptBase += `
      REACT VITE RULES:
      1. CORE: Generate "/index.html", "/src/main.tsx", "/src/App.tsx", "/package.json", "/tailwind.config.js", "/postcss.config.js", and "/vite.config.ts".
      2. HTML ENTRY: Must contain <div id="root"></div> and <script type="module" src="/src/main.tsx"></script>.
      3. CONFIG SYNTAX: Must use ES Module syntax. NEVER use module.exports.
      4. VITE CONFIG: You MUST generate "/vite.config.ts" using \`@vitejs/plugin-react\`.
      `;
    } else if (framework === "vue-vite") {
      systemPromptBase += `
      VUE 3 VITE RULES:
      1. CORE: Generate "/index.html", "/src/main.ts", "/src/App.vue", "/package.json", "/tailwind.config.js", "/postcss.config.js", and "/vite.config.ts".
      2. VUE MOUNT: call createApp(App).mount('#app').
      3. CONFIG SYNTAX: Must use ES Module syntax. NEVER use module.exports.
      4. VITE CONFIG: You MUST generate "/vite.config.ts" using \`@vitejs/plugin-vue\`.
      `;
    } else if (framework === "angular") {
      systemPromptBase += `
      ANGULAR 17+ RULES:
      1. CORE: Generate "/src/index.html", "/src/main.ts", "/src/app/app.component.ts", "/src/app/app.component.html", "/src/styles.css", "/package.json", "/angular.json", and "/tsconfig.json".
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
        "/package.json", "/tailwind.config.js", "/next.config.js", "/postcss.config.js", "/tsconfig.json",
        "package.json", "tailwind.config.js", "tsconfig.json", "postcss.config.js", "next.config.js"
      ]);

      allPaths.forEach(path => {
        // 1. Always include configs
        if (alwaysInclude.has(path) || alwaysInclude.has("/" + path)) {
          optimizedFiles[path] = currentFiles[path];
          return;
        }
        
        // 2. Always include the Backend Contract (Zero Hallucination Rule)
        if (path.includes('/api/') || path.includes('/lib/db') || path.includes('/lib/') || path.includes('/types') || path.includes('/models') || path.includes('/components/')) {
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
      : `${systemPromptBase}\n\nCREATE MODE: Empty workspace. You are building from scratch.\n\nCONVERSATION:\n${conversationTranscript}\n\nINSTRUCTION:\n1. You MUST generate a complete full-stack application for the user.\n2. For EVERY single file you generate, you MUST output it using this exact XML format:\n<FILE_START path="/path/to/file">\n[content]\n</FILE_END>\n3. DO NOT use standard markdown code blocks to output project files.\n4. The main page MUST be at /app/page.tsx (NOT /src/app/page.tsx).\n5. API routes MUST be at /app/api/[name]/route.ts.\n6. Database MUST be at /lib/db.ts with pre-filled mock data.\n7. You MUST generate package.json, tailwind.config.js, postcss.config.js, and tsconfig.json.`;

    // 🚀 4. THE MULTI-AGENT PIPELINE (With Intelligent Router)
    let streamResult: any = null;
    let successfulKey: string | null = null;
    let firstChunk: EnhancedGenerateContentResponse | null = null;
    let lastErrorDetails = "";

    keyLoop: for (let keyIndex = 0; keyIndex < Math.min(API_KEYS.length, 10); keyIndex++) {
      const currentKey = API_KEYS[keyIndex];
      const genAI = new UniversalAIWrapper(currentKey!);

      try {
        // 🚀 AGENT 1: THE INTELLIGENT ROUTER (Scope & Intent Detection)
        const architectModel = genAI.getGenerativeModel({ model: "llama-3.3-70b-versatile", generationConfig: { responseMimeType: "application/json" } });
        const architectPrompt = `You are the Lead Architect routing a task. 
        User Task: "${latestUserMessage}"
        Is Update Mode: ${isUpdateMode}
        
        Determine the Scope of Work. 
        CRITICAL RULES:
        1. If Is Update Mode is false, you MUST return "fullstack".
        2. Distinguish between coding tasks and conversational questions.
        - "conversation": The user is asking a question, asking for advice/suggestions, or chatting. NO code changes requested.
        - "frontend_only": User explicitly wants to change UI, CSS, React components.
        - "backend_only": User explicitly wants to change API routes, db.ts, types.
        - "fullstack": Touches both, or brand new app.

        Return strictly this JSON object:
        { "scope": "conversation" | "frontend_only" | "backend_only" | "fullstack", "filesToModify": ["/path1"], "plan": "1-sentence strategy" }`;
        
        const planResponse = await architectModel.generateContent(architectPrompt);
        // 🚀 FIX: Bulletproof JSON parsing. If the AI rebels and outputs raw text, default to fullstack.
        let plan = { scope: "fullstack", filesToModify: [], plan: "Fallback to fullstack due to parsing error." };
        try {
          const rawPlanText = planResponse.response.text();
          const cleanPlanText = rawPlanText.replace(/```json/gi, '').replace(/```/g, '').trim();
          const parsedPlan = JSON.parse(cleanPlanText);
          if (parsedPlan && parsedPlan.scope) plan = parsedPlan;
        } catch (parseError) {
          console.warn("[ROUTER] AI failed to return JSON. Defaulting to fullstack.", parseError);
        }
        
        // 🚀 FORCED OVERRIDE: If it's a new project, NEVER allow conversation mode.
        if (!isUpdateMode) plan.scope = "fullstack";

        const mainModel = genAI.getGenerativeModel({ model: "llama-3.3-70b-versatile" });

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
           const backendResult = await mainModel.generateContent(`${finalPromptText} \n PLAN: ${JSON.stringify(plan)} \n
           FOCUS: Generate ONLY the backend files:
           - /lib/db.ts (in-memory database with realistic mock data)
           - /app/api/[feature]/route.ts (one route file per feature)
           
           MANDATORY PATTERNS:
           - Use \`import { NextResponse } from 'next/server';\` in every route file.
           - Use \`import { db } from '@/lib/db';\` to access the database.
           - Export named async functions: GET, POST, PUT, DELETE.
           - Wrap every handler in try/catch. Return NextResponse.json() for all responses.
           - NEVER use NextApiRequest, NextApiResponse, or req.query. Use \`request.json()\` for body and \`new URL(request.url).searchParams\` for query params.
           `);
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

              MASTER UI/UX DESIGNER DIRECTIVE:
              You are an elite Senior Frontend Developer and UI/UX Designer.
              Generate ONLY the frontend files: /app/page.tsx and /components/*.tsx.

              === CRITICAL RULES ===
              1. FILE PATH: Write the main UI into EXACTLY "/app/page.tsx". NEVER use /src/ or /pages/.
              2. FIRST LINE: The very first line of /app/page.tsx MUST be: 'use client';
              3. IMPORTS: import { useState, useEffect } from 'react'; import specific lucide-react icons like { Home, User, Settings, Search, Bell, Menu, X, ChevronDown, Plus, Trash2, Edit, Check, BarChart3, TrendingUp, DollarSign, Users, Activity, ArrowUpRight, ArrowDownRight, Eye, MessageSquare, Heart, Star, ShoppingCart, Package, Clock, Calendar, Mail, Phone, MapPin, Globe, Shield, Zap, Award, Target, Layers, Grid, List }.
              4. FETCH: Call fetch('/api/...') directly. It is a GLOBAL browser API. NEVER import it.
              5. LOADING STATE: Always show an animated spinner while data loads.
              6. ERROR STATE: Always wrap fetch in try/catch and show a user-friendly error message.

              === PREMIUM DESIGN SYSTEM ===
              You MUST make the UI look like a premium SaaS product, not a student project.
              - COLOR PALETTE: Use a cohesive dark theme (bg-gray-950, bg-gray-900) with vibrant accent colors (blue-500, purple-500, emerald-500). No plain white backgrounds.
              - TYPOGRAPHY: Use font-bold and text-xl/2xl/3xl for headings. Use text-gray-400 for secondary text. Proper hierarchy.
              - CARDS: Use bg-gray-900/50 backdrop-blur-xl border border-gray-800/50 rounded-2xl p-6 shadow-xl for card containers.
              - GLASSMORPHISM: Use backdrop-blur-xl bg-white/5 border border-white/10 for glass effects.
              - GRADIENTS: Use bg-gradient-to-br from-blue-500 to-purple-600 for accent backgrounds and buttons.
              - HOVER STATES: Every clickable element MUST have hover:scale-[1.02] transition-all duration-300 hover:shadow-lg.
              - ICONS: Place lucide-react icons inside colored rounded-xl bg-blue-500/10 p-3 containers for visual hierarchy.
              - SPACING: Use generous padding (p-6, p-8) and gaps (gap-6). Never cramped.
              - RESPONSIVE: Use grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 for card grids.
              - SIDEBAR: If a sidebar is needed, use w-64 bg-gray-950 border-r border-gray-800 with nav items using rounded-xl hover:bg-gray-800/50.
              - STAT CARDS: Display key numbers in text-3xl font-bold with colored trend indicators (text-emerald-400 for positive, text-red-400 for negative).
              - TABLES: Use divide-y divide-gray-800 with hover:bg-gray-800/30 row highlights.
              - AVATARS: Use rounded-full with ring-2 ring-gray-800 borders.
              - EMPTY STATES: If no data, show a centered icon + message, never a blank page.
              `
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
        
        const reviewerPrompt = `You are the Ultimate Code Compiler and Senior Code Reviewer.
        Your job is to audit, fix, and finalize this generated code.
        
        IMPORTANT: The code below was generated by two separate AI agents (Backend + Frontend).
        It may contain duplicate explanations, markdown text, or FILE_START tags from both agents.
        You must MERGE and DEDUPLICATE all files into a single clean output.

        === RAW GENERATED CODE ===
        ${newlyGeneratedCode}

        === YOUR DIRECTIVE ===

        STEP 1 - IMPORT VALIDATION (CRITICAL):
        Scan every file and REMOVE these banned imports:
        - import fetch from 'node-fetch' / 'isomorphic-fetch' / 'cross-fetch' -> DELETE (fetch is global)
        - import { Icon } from 'lucide-react' -> Replace with specific named icons like { Home, User, Settings }
        - import { NextApiRequest, NextApiResponse } from 'next' -> Replace with: import { NextResponse } from 'next/server'
        - import from 'fs', 'path', 'crypto', 'child_process' -> DELETE (Node.js built-ins)
        - import Image from 'next/image' -> Replace with standard <img> tag
        - import from 'next/font' -> DELETE
        - 'use server' directive -> DELETE

        STEP 2 - PATH VALIDATION:
        - All file paths MUST start with / (root), NEVER with /src/
        - If you see /src/app/page.tsx -> change path to /app/page.tsx
        - If you see /src/lib/db.ts -> change path to /lib/db.ts
        - If you see /src/components/ -> change path to /components/
        - Main page MUST be at path /app/page.tsx
        - API routes MUST be at path /app/api/[name]/route.ts
        - Database MUST be at path /lib/db.ts
        - If any file uses ../../lib/db or ../../../lib/db in imports, change to @/lib/db
        - DO NOT output these files (our system auto-injects them): tailwind.config.js, postcss.config.js, tsconfig.json, next.config.js, app/layout.tsx, app/globals.css

        STEP 3 - SYNTAX FIXES:
        - Fix duplicate variable declarations
        - Fix missing closing brackets, parentheses, or JSX tags
        - Ensure every React component has a proper default export
        - Ensure 'use client'; is the FIRST line of /app/page.tsx (before any imports)
        - Ensure all arrays are safely accessed with (data || []).map()

        STEP 4 - API ROUTE VALIDATION:
        - Every /app/api/*/route.ts MUST export named async functions (GET, POST, etc.), NOT default exports
        - Every route MUST use NextResponse.json(), NOT res.json() or res.send()
        - Every route MUST import { NextResponse } from 'next/server'
        - Every route MUST import { db } from '@/lib/db'
        - Every route MUST have try/catch error handling

        STEP 5 - OUTPUT FORMAT:
        A. FIRST: Write a brief, friendly explanation of what was built (2-3 sentences max).
        B. THEN: Provide 2-3 "Pro Prompt" suggestions as bullet points for what to build next.
        C. FINALLY: Output EVERY file wrapped in exact XML tags:
           <FILE_START path="/app/page.tsx">
           // full corrected file content here
           </FILE_END>
           DO NOT use markdown code blocks. You MUST use <FILE_START path="..."> tags ONLY.
           DO NOT output config files (tailwind.config.js, postcss.config.js, tsconfig.json, next.config.js, layout.tsx, globals.css).
        `;

        streamResult = await mainModel.generateContentStream(reviewerPrompt);
        
        const iterator = streamResult.stream[Symbol.asyncIterator]();
        const firstYield = await iterator.next();
        if (!firstYield.done) firstChunk = firstYield.value;

        successfulKey = currentKey!;
        break keyLoop;

      } catch (e: unknown) {
        lastErrorDetails = e instanceof Error ? e.message : String(e);
        
        // 🚀 THE KEY-LOOP FALLBACK FIX: Switch to a backup key if the current one is OUT of quota, INVALID, or UNAVAILABLE. 
        if (lastErrorDetails.includes("429") || lastErrorDetails.includes("Quota") || lastErrorDetails.includes("API key not valid") || lastErrorDetails.includes("400") || lastErrorDetails.includes("401") || lastErrorDetails.includes("503") || lastErrorDetails.includes("500") || lastErrorDetails.includes("502")) {
            console.warn(`[API] Key failed with error: ${lastErrorDetails}. Trying next backup key...`);
            continue; 
        } else {
            console.warn(`[API] Fatal error or unhandled status: ${lastErrorDetails}. Aborting pipeline.`);
            break; 
        }
      }
    }

    // 🚀 FIX: Unmask the actual Google API error so the frontend can catch rate limits!
    if (!streamResult) {
      return NextResponse.json(
        { error: lastErrorDetails ? `API Error: ${lastErrorDetails}` : "The Multi-Agent Pipeline failed. Please check your API keys." }, 
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
        }
      }
    });

    return new Response(stream, {
      headers: {
        "Content-Type": "text/plain; charset=utf-8",
      }
    });

  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : "An unexpected server error occurred";
    return NextResponse.json({ error: errorMessage }, { status: 500 });
  }
}