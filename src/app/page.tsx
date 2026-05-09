/* eslint-disable @next/next/no-img-element */
"use client";

import { useState, useEffect, useRef, Suspense } from "react";
import sdk, { VM } from "@stackblitz/sdk";
import { useRouter } from "next/navigation";
import { 
  Loader2, Wand2, Box, Zap, 
  RefreshCw, Maximize, Minimize, Settings, X, History, MoreVertical, 
  Edit2, Pin, Trash2, Check, ChevronLeft, Plus, Upload, Send, Bot, ChevronDown, FileArchive, AlertTriangle, Github, Mic, Image as ImageIcon, FileCode2, Square, RotateCcw, LayoutTemplate,
  Share2, Copy, CheckCheck, Inbox, ShieldAlert
} from "lucide-react";
import { useAuth, SignInButton, SignUpButton, UserButton, useUser } from "@clerk/nextjs";
import type Pusher from "pusher-js"; 
import type { Channel } from "pusher-js";

interface ISpeechRecognitionEvent {
  resultIndex: number;
  results: {
    length: number;
    [index: number]: {
      length: number;
      [index: number]: {
        transcript: string;
      };
    };
  };
}

interface ISpeechRecognitionErrorEvent {
  error: string;
}

interface ISpeechRecognition {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  start: () => void;
  stop: () => void;
  onstart: (() => void) | null;
  onresult: ((event: ISpeechRecognitionEvent) => void) | null;
  onerror: ((event: ISpeechRecognitionErrorEvent) => void) | null;
  onend: (() => void) | null;
}

interface IWindow extends Window {
  SpeechRecognition?: new () => ISpeechRecognition;
  webkitSpeechRecognition?: new () => ISpeechRecognition;
}

type ProjectFiles = Record<string, string>;

type Message = {
  id?: string; 
  role: "user" | "assistant";
  content: string;
  image?: string; 
  images?: string[]; 
  fileSnapshot?: ProjectFiles; 
};

type ChatSession = {
  id: string;
  title: string;
  messages: Message[];
  framework: string;
  files: ProjectFiles;
  isPinned: boolean;
  isDeleted?: boolean;
  isShared?: boolean;
  collaborators?: { email: string; role: string }[];
  userId?: string; 
  timestamp: number;
  prompt?: string;
};

const generateUniqueId = () => {
  return `chat_${Date.now()}_${Math.random().toString(36).substring(2, 11)}`;
};

const renderMessage = (content: string) => {
  const parts = content.split(/```([\s\S]*?)```/g);
  
  return parts.map((part, index) => {
    if (index % 2 === 1) {
      const lines = part.split('\n');
      const code = lines.slice(1).join('\n').trim() || part;
      return (
        <div key={index} className="my-4 bg-[#0a0a0a] border border-gray-700/60 rounded-xl p-4 font-mono text-[13px] leading-relaxed overflow-x-auto text-emerald-400 shadow-[inset_0_2px_10px_rgba(0,0,0,0.2)]">
          <pre>{code}</pre>
        </div>
      );
    }
    
    const boldParts = part.split(/\*\*(.*?)\*\*/g);
    return (
      <span key={index}>
        {boldParts.map((bp, i) => 
          i % 2 === 1 ? <strong key={i} className="font-bold text-white tracking-wide">{bp}</strong> : <span key={i}>{bp}</span>
        )}
      </span>
    );
  });
};

function HomeContent() {
  const { userId, isLoaded } = useAuth();
  const { user } = useUser();
  const router = useRouter();
  const [isGuest, setIsGuest] = useState(false);

  const [messages, setMessages] = useState<Message[]>([]);
  const [inputPrompt, setInputPrompt] = useState("");
  
  const [attachedImages, setAttachedImages] = useState<string[]>([]);
  
  const [loading, setLoading] = useState(false);
  const [isStreaming, setIsStreaming] = useState(false); 
  const [isUpdating, setIsUpdating] = useState(false);
  const [isEnhancing, setIsEnhancing] = useState(false); 
  
  const [isGeneratingRemote, setIsGeneratingRemote] = useState(false);
  const [isArchitectingRemote, setIsArchitectingRemote] = useState(false);
  const [isRefactoringRemote, setIsRefactoringRemote] = useState(false);

  const [files, setFiles] = useState<ProjectFiles | null>(null);
  const [error, setError] = useState<string | null>(null);
  
  const [previewKey, setPreviewKey] = useState(0); 
  const [isFullscreen, setIsFullscreen] = useState(false); 
  const [framework, setFramework] = useState("nextjs");
  const [frameworkMenuOpen, setFrameworkMenuOpen] = useState(false);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [isUploadModalOpen, setIsUploadModalOpen] = useState(false);
  const [attachmentMenuOpen, setAttachmentMenuOpen] = useState(false);
  const [overwriteWarningOpen, setOverwriteWarningOpen] = useState(false);
  const [customApiKey, setCustomApiKey] = useState("");

  const [history, setHistory] = useState<ChatSession[]>([]);
  const [currentChatId, setCurrentChatId] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'workspace' | 'history' | 'trash' | 'shared'>('workspace');
  const [menuOpenId, setMenuOpenId] = useState<string | null>(null);
  const [editingChatId, setEditingChatId] = useState<string | null>(null);
  const [editTitle, setEditTitle] = useState("");
  const [isSelectionMode, setIsSelectionMode] = useState(false);
  const [selectedChatIds, setSelectedChatIds] = useState<Set<string>>(new Set());

  const [abortController, setAbortController] = useState<AbortController | null>(null);
  const [editingMsgIndex, setEditingMsgIndex] = useState<number | null>(null);
  const [editMsgContent, setEditMsgContent] = useState("");

  const [isGithubModalOpen, setIsGithubModalOpen] = useState(false);
  const [githubToken, setGithubToken] = useState("");
  const [githubRepoName, setGithubRepoName] = useState("");
  const [isExporting, setIsExporting] = useState(false);

  const [isShareModalOpen, setIsShareModalOpen] = useState(false);
  const [shareCopied, setShareCopied] = useState(false);
  
  const [inviteEmail, setInviteEmail] = useState("");
  const [isInviting, setIsInviting] = useState(false);
  const [updatingCollab, setUpdatingCollab] = useState<string | null>(null); 

  const [isListening, setIsListening] = useState(false);
  const recognitionRef = useRef<ISpeechRecognition | null>(null);

  const [mentionOpen, setMentionOpen] = useState(false);
  const [mentionQuery, setMentionQuery] = useState("");
  const [mentionIndex, setMentionIndex] = useState(0);

  const [mismatchData, setMismatchData] = useState<{target: string, prompt: string} | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<{ type: 'single' | 'all', id?: string } | null>(null);
  const [detectedError, setDetectedError] = useState<string | null>(null);

  const activeChat = history.find(h => h.id === currentChatId);
  const userEmail = user?.emailAddresses[0]?.emailAddress?.toLowerCase();
  const isOwner = !activeChat?.userId || activeChat.userId === userId;
  const isEditor = activeChat?.collaborators?.some(c => c.email === userEmail && c.role === 'editor');
  const isReadOnly = Boolean(currentChatId && !isOwner && !isEditor);

  useEffect(() => {
    const handleMessage = (e: MessageEvent) => {
      if (e.data && e.data.type === 'SPARK_RUNTIME_ERROR' && e.data.message) {
        const msg = String(e.data.message);
        if (!msg.includes('Warning:') && !msg.includes('Download the React DevTools') && !msg.includes('The resource http')) {
           setDetectedError(msg);
        }
      }
    };
    window.addEventListener('message', handleMessage);
    return () => window.removeEventListener('message', handleMessage);
  }, []);

  useEffect(() => {
    const handleMessage = (e: MessageEvent) => {
      if (e.data && e.data.type === 'SPARK_RUNTIME_ERROR' && e.data.message) {
        const msg = String(e.data.message);
        if (!msg.includes('Warning:') && !msg.includes('Download the React DevTools') && !msg.includes('The resource http')) {
           setDetectedError(msg);
        }
      }
    };
    window.addEventListener('message', handleMessage);
    return () => window.removeEventListener('message', handleMessage);
  }, []);

  // 🚀 WEBCONTAINER FILE SYSTEM POLLER (Catches Terminal Errors & Auto-Installs)
  useEffect(() => {
    let lastInstallTime = 0; // 🚀 FIX: Local cooldown timer

    const interval = setInterval(async () => {
      if (!vmRef.current) return;
      try {
        const fsSnapshot = await vmRef.current.getFsSnapshot();
        if (fsSnapshot && fsSnapshot['.spark_error.log']) {
          const errContent = fsSnapshot['.spark_error.log'];
          if (errContent) {
            
            // 🚀 FIX: If we recently triggered an install, give NPM 15 seconds to finish before panicking!
            if (Date.now() - lastInstallTime < 15000) {
               return; // Wait patiently in the background
            }

            // 🚀 1. AUTO-DEPENDENCY RESOLUTION (Zero-Click Fix)
            let missingPackage = null;
            const webpackMatch = errContent.match(/Module not found: Can't resolve '([^']+)'/i);
            const viteMatch = errContent.match(/Failed to resolve import "([^"]+)"/i);
            const nodeMatch = errContent.match(/Cannot find module '([^']+)'/i);
            const pkgMatch = errContent.match(/Cannot find package '([^']+)'/i);
            
            if (webpackMatch) missingPackage = webpackMatch[1].split('/')[0];
            else if (viteMatch) missingPackage = viteMatch[1].split('/')[0];
            else if (nodeMatch) missingPackage = nodeMatch[1].split('/')[0];
            else if (pkgMatch) missingPackage = pkgMatch[1].split('/')[0];

            if (missingPackage && !missingPackage.startsWith('.') && !missingPackage.startsWith('/')) {
               console.log(`[AUTO-FIX] Missing dependency detected: ${missingPackage}. Installing silently...`);
               
               const currentPkgStr = filesRef.current?.['/package.json'] || filesRef.current?.['package.json'];
               if (currentPkgStr) {
                  try {
                     const pkg = JSON.parse(currentPkgStr);
                     pkg.dependencies = pkg.dependencies || {};
                     
                     if (!pkg.dependencies[missingPackage]) {
                        pkg.dependencies[missingPackage] = "latest"; 
                        const newPkgStr = JSON.stringify(pkg, null, 2);
                        
                        // 1. Update React State
                        setFiles(prev => prev ? { ...prev, '/package.json': newPkgStr } : null);
                        
                        // 2. Start the 15-second Cooldown!
                        lastInstallTime = Date.now();
                        
                        // 3. Update OS (Triggers npm install)
                        await vmRef.current.applyFsDiff({ 
                           create: { 'package.json': newPkgStr }, 
                           destroy: ['.spark_error.log'] 
                        });
                        
                        return;
                     }
                  } catch (e) {
                     console.warn("Failed to parse package.json for auto-fix", e);
                  }
               }
            }

            // 🚀 2. FALLBACK: If not an import error, or 15s have passed and it's still broken
            setDetectedError("TERMINAL COMPILATION ERROR:\n" + errContent);
            await vmRef.current.applyFsDiff({ create: {}, destroy: ['.spark_error.log'] });
          }
        }
      } catch (e) {
        // Silently ignore SDK sync errors
      }
    }, 1500); 

    return () => clearInterval(interval);
  }, []);

  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const vmRef = useRef<VM | null>(null);
  const filesRef = useRef<ProjectFiles | null>(null);
  filesRef.current = files; 
  const fileInputRef = useRef<HTMLInputElement>(null);
  const imageAttachRef = useRef<HTMLInputElement>(null);
  const chatEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleSecretKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key.toLowerCase() === 'a') {
        e.preventDefault(); 
        router.push('/admin');
      }
    };
    window.addEventListener('keydown', handleSecretKey);
    return () => window.removeEventListener('keydown', handleSecretKey);
  }, [router]);

  const fetchHistory = async (syncChatId?: string) => {
    if (!userId) {
      const savedHistory = localStorage.getItem("spark_chat_history");
      if (savedHistory) {
        try {
          let parsedHistory = JSON.parse(savedHistory) as ChatSession[];
          let hasDuplicates = false;
          const seenIds = new Set<string>();
          
          parsedHistory = parsedHistory.map(chat => {
            if (seenIds.has(chat.id)) {
              hasDuplicates = true;
              return { ...chat, id: generateUniqueId() };
            }
            seenIds.add(chat.id);
            return chat;
          });

          setHistory(parsedHistory);
          if (hasDuplicates) localStorage.setItem("spark_chat_history", JSON.stringify(parsedHistory));
          
          if (syncChatId) {
            const current = parsedHistory.find(h => h.id === syncChatId);
            if (current) {
              setMessages(current.messages);
              setFramework(current.framework);
              const prevFilesStr = JSON.stringify(filesRef.current || {});
              const newFilesStr = JSON.stringify(current.files || {});
              
              setFiles(current.files);
              
              if (prevFilesStr !== newFilesStr) {
                setPreviewKey(prev => prev + 1);
              }
            }
          }
        } catch {
          // Ignored
        }
      }
      return;
    }

    try {
      const res = await fetch("/api/history/load");
      if (!res.ok) throw new Error(await res.text());
      const data = await res.json();
      if (Array.isArray(data)) {
                setHistory(data);
                if (syncChatId) {
                  const current = data.find((h: ChatSession) => h.id === syncChatId);
                  if (current) {
                    setMessages(current.messages);
                    setFramework(current.framework);

                    // Only reboot the container if the code files ACTUALLY changed
                    const prevFilesStr = JSON.stringify(filesRef.current || {});
                    const newFilesStr = JSON.stringify(current.files || {});
                    
                    setFiles(current.files);
                    
                    if (prevFilesStr !== newFilesStr) {
                      setPreviewKey(prev => prev + 1);
                    }
                  }
                }
              }
    } catch {
      console.warn("Background sync paused: Could not load history right now.");
    }
  };

  useEffect(() => {
    const savedKey = localStorage.getItem("spark_custom_api_key");
    if (savedKey) setCustomApiKey(savedKey);

    const savedGithubToken = localStorage.getItem("spark_github_token");
    if (savedGithubToken) setGithubToken(savedGithubToken);

    fetchHistory();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId]); 

  useEffect(() => {
    if (!currentChatId || !userId) return;

    let pusherClient: Pusher | null = null;
    let pusherChannel: Channel | null = null;
    
    import("@/lib/pusher").then(({ getPusherClient }) => {
      pusherClient = getPusherClient();
      pusherChannel = pusherClient.subscribe(`project-${currentChatId}`);
      
      pusherChannel.bind('typing', (data: { mode?: string } | null | undefined) => {
        const mode = data?.mode || 'chat';
        if (mode === 'architect') setIsArchitectingRemote(true);
        else if (mode === 'refactor') setIsRefactoringRemote(true);
        else setIsGeneratingRemote(true);
      });

      pusherChannel.bind('update', () => {
        setIsGeneratingRemote(false);
        setIsArchitectingRemote(false);
        setIsRefactoringRemote(false);
        fetchHistory(currentChatId); 
      });
    });

    return () => {
      if (pusherClient && pusherChannel) {
        pusherChannel.unbind_all();
        pusherClient.unsubscribe(`project-${currentChatId}`);
      }
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentChatId, userId]); 

  useEffect(() => {
    if (chatEndRef.current) {
      chatEndRef.current.scrollIntoView({ behavior: "smooth" });
    }
  }, [messages, loading, isUpdating, isStreaming]);

  const saveApiKey = (key: string) => {
    setCustomApiKey(key);
    localStorage.setItem("spark_custom_api_key", key);
  };

  const saveGithubToken = (key: string) => {
    setGithubToken(key);
    localStorage.setItem("spark_github_token", key);
  };

  const saveHistory = (newHistory: ChatSession[], chatToSave?: ChatSession) => {
    setHistory(newHistory); 

    if (!userId) {
      try {
        localStorage.setItem("spark_chat_history", JSON.stringify(newHistory));
      } catch {
        console.warn("Storage Quota Exceeded.");
      }
    } else if (chatToSave) {
      fetch("/api/history/save", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(chatToSave),
      }).catch(() => console.warn("Background sync paused: Changes saved locally but not to DB yet."));
    }
  };

  const toggleShare = async (chatId: string, currentSharedState: boolean) => {
    const chatToUpdate = history.find(h => h.id === chatId);
    if (!chatToUpdate) return;
    
    const updatedChat = { ...chatToUpdate, isShared: !currentSharedState };
    const updated = history.map(h => h.id === chatId ? updatedChat : h);
    saveHistory(updated, updatedChat);

    if (userId) {
      fetch("/api/history/share", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: chatId, isShared: !currentSharedState })
      }).catch(() => console.warn("Failed to update remote share status"));
    }
  };

  const handleManageCollaborator = async (email: string, action: 'add' | 'update' | 'remove', role: string = 'viewer') => {
    if (!email.trim() || !currentChatId || !userId) return;
    
    if (action === 'add') setIsInviting(true);
    else setUpdatingCollab(email);

    try {
      const res = await fetch("/api/history/invite", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ projectId: currentChatId, email: email.toLowerCase(), role, action })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to manage collaborator");

      const chatToUpdate = history.find(h => h.id === currentChatId);
      if (chatToUpdate) {
        let updatedCollaborators = [...(chatToUpdate.collaborators || [])];
        
        if (action === 'remove') {
          updatedCollaborators = updatedCollaborators.filter(c => c.email !== email.toLowerCase());
        } else {
          const existingIdx = updatedCollaborators.findIndex(c => c.email === email.toLowerCase());
          if (existingIdx > -1) {
            updatedCollaborators[existingIdx].role = role;
          } else {
            updatedCollaborators.push({ email: email.toLowerCase(), role });
          }
        }

        const updatedChat = { ...chatToUpdate, collaborators: updatedCollaborators };
        setHistory(history.map(h => h.id === currentChatId ? updatedChat : h));
      }
      
      if (action === 'add') setInviteEmail("");
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to update user");
    } finally {
      setIsInviting(false);
      setUpdatingCollab(null);
    }
  };

  useEffect(() => {
    if (filesRef.current && previewKey > 0) {
      const timer = setTimeout(() => {
        mountStackBlitz(filesRef.current!);
      }, 50);
      return () => clearTimeout(timer);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [previewKey, isReadOnly]); 

  // 🚀 THE ULTIMATE PAYLOAD SANITIZER: This guarantees StackBlitz never 400 crashes again.
  const mountStackBlitz = async (projectFiles: ProjectFiles) => {
    const cleanFiles: Record<string, string> = {};

    Object.entries(projectFiles).forEach(([path, content]) => {
      // 1. Forcefully remove illegal leading slashes or dots that cause StackBlitz to crash
      let cleanPath = path.replace(/^[\/\.\\]+/, "").trim();
      // 2. Prevent double slashes in paths
      cleanPath = cleanPath.replace(/\/\//g, "/");

      // 3. Filter out hallucinated binary files that corrupt the JSON payload
      const isBinary = ['.png', '.jpg', '.jpeg', '.gif', '.ico', '.webp', '.mp4', '.mp3', '.woff', '.woff2', '.ttf', '.eot', '.pdf', '.zip'].some(ext => cleanPath.toLowerCase().endsWith(ext));

      if (cleanPath && cleanPath.length > 0 && !isBinary && typeof content === 'string') {
        cleanFiles[cleanPath] = content;
      }
    });

    // 🚀 4. REBUILD PACKAGE.JSON FROM SCRATCH. 
    // We strip out whatever the AI generated and rebuild a perfect, guaranteed-to-work file.
    let aiDependencies: Record<string, string> = {};
    if (cleanFiles["package.json"]) {
      try {
        const parsed = JSON.parse(cleanFiles["package.json"]);
        if (parsed && typeof parsed === 'object' && parsed.dependencies) {
            aiDependencies = parsed.dependencies;
        }
      } catch {
        console.warn("⚠️ AI generated invalid package.json. Auto-repairing.");
      }
    }

    const basePkg = {
        name: "spark-project", // Forced to perfectly valid NPM name
        version: "1.0.0",
        type: framework === "nextjs" ? "commonjs" : "module",
        scripts: {} as Record<string, string>,
        dependencies: { ...aiDependencies } as Record<string, string>,
        devDependencies: {} as Record<string, string>
    };

    if (framework === "nextjs") {
        basePkg.scripts = { dev: "next dev", build: "next build", start: "next start" };
        basePkg.dependencies = { ...basePkg.dependencies, "next": "14.2.15", "react": "18.2.0", "react-dom": "18.2.0", "lucide-react": "0.454.0", "clsx": "2.1.1", "tailwind-merge": "2.5.4" };
        basePkg.devDependencies = { "tailwindcss": "3.4.4", "postcss": "8.4.38", "autoprefixer": "10.4.19", "typescript": "5.6.3", "@types/node": "20.16.11", "@types/react": "18.2.79" };
    } else if (framework === "react-vite") {
        basePkg.scripts = { dev: "vite", build: "vite build", preview: "vite preview" };
        basePkg.dependencies = { ...basePkg.dependencies, "react": "18.2.0", "react-dom": "18.2.0", "lucide-react": "0.454.0" };
        basePkg.devDependencies = { "vite": "5.4.8", "@vitejs/plugin-react": "4.3.2", "tailwindcss": "3.4.4", "postcss": "8.4.38", "autoprefixer": "10.4.19" };
    } else if (framework === "vue-vite") {
        basePkg.scripts = { dev: "vite", build: "vite build", preview: "vite preview" };
        basePkg.dependencies = { ...basePkg.dependencies, "vue": "3.5.11", "lucide-vue-next": "0.454.0" };
        basePkg.devDependencies = { "vite": "5.4.8", "@vitejs/plugin-vue": "5.1.4", "tailwindcss": "3.4.4", "postcss": "8.4.38", "autoprefixer": "10.4.19" };
    } else if (framework === "angular") {
        basePkg.scripts = { dev: "ng serve", start: "ng serve", build: "ng build" };
        basePkg.dependencies = { ...basePkg.dependencies, "@angular/core": "^17.0.0", "@angular/common": "^17.0.0", "rxjs": "~7.8.0", "zone.js": "~2.0.0" };
        basePkg.devDependencies = { "@angular/cli": "^17.0.0", "typescript": "~5.2.2" };
    }

    // 🚀 THE TERMINAL BLINDNESS FIX: Aggressive Dev Wrapper
    if (basePkg.scripts && basePkg.scripts.dev) {
        basePkg.scripts["actual-dev"] = basePkg.scripts.dev;
        basePkg.scripts.dev = "node .spark_wrapper.js";
    }

    cleanFiles["package.json"] = JSON.stringify(basePkg, null, 2);

    // 🚀 INJECT THE OS-LEVEL ERROR HIJACKER (File System Bridge)
    cleanFiles[".spark_wrapper.js"] = `
const { spawn } = require('child_process');
const fs = require('fs');

const child = spawn('npm', ['run', 'actual-dev'], { stdio: ['ignore', 'pipe', 'pipe'] });
let errorLog = '';

const stripAnsi = (str) => str.replace(/\\x1B\\[\\d+m/g, '').replace(/\\x1b\\[[0-9;]*m/g, '');

const checkError = () => {
  const cleanLog = stripAnsi(errorLog);
  // 🚀 Added "Module not found" and "Cannot find" to trigger the auto-installer
  if (cleanLog.includes('Failed to compile') || cleanLog.includes('Build Error') || cleanLog.includes('Syntax error') || cleanLog.includes('NonErrorEmittedError') || cleanLog.includes('Module not found') || cleanLog.includes('Cannot find')) {
     fs.writeFileSync('.spark_error.log', cleanLog);
  }
};

child.stdout.on('data', data => {
  process.stdout.write(data);
  errorLog += data.toString();
  if (errorLog.length > 10000) errorLog = errorLog.slice(-10000); // Prevent memory bloat
  checkError();
});

child.stderr.on('data', data => {
  process.stderr.write(data);
  errorLog += data.toString();
  if (errorLog.length > 10000) errorLog = errorLog.slice(-10000);
  checkError();
});

child.on('exit', (code) => {
  if (code !== 0) {
     fs.writeFileSync('.spark_error.log', stripAnsi(errorLog));
  }
});
`;

    cleanFiles[".stackblitzrc"] = JSON.stringify({
      installDependencies: true, 
      startCommand: "npm run dev", 
      env: { NEXT_TELEMETRY_DISABLED: "1", NODE_ENV: "development" }
    }, null, 2);

    const containerId = `stackblitz-${previewKey}`;
    const containerElement = document.getElementById(containerId);
    
    if (!containerElement) return;

    try {
      const vm = await sdk.embedProject(
        containerElement,
        { title: "Spark AI Project", description: "Generated full-stack application", template: "node", files: cleanFiles },
        { 
          view: isReadOnly ? "preview" : "default", 
          theme: "dark", 
          showSidebar: !isReadOnly, 
          height: "100%" 
        }
      );
      
      vmRef.current = vm;
    } catch (sdkError) {
      console.warn("StackBlitz VM Connection Timeout/Warning. The preview might need a moment to reconnect:", sdkError);
    }
  };

  const sanitizeAndPrepareFiles = (data: ProjectFiles, currentFramework: string, isUpdate: boolean = false) => {
    Object.keys(data).forEach(key => {
      if (typeof data[key] === 'string') {
        data[key] = data[key].replace(/^```[a-z]*\n?/i, '').replace(/\n?```$/i, '').trim();
      }
    });

    if (!isUpdate) {
      const killList = [
        "tsconfig.json", "/tsconfig.json", "tsconfig.app.json", "/tsconfig.app.json",
        "tailwind.config.js", "/tailwind.config.js", "tailwind.config.ts", "/tailwind.config.ts",
        "postcss.config.js", "/postcss.config.js", "postcss.config.mjs", "/postcss.config.mjs",
        "next.config.js", "/next.config.js", "next.config.mjs", "/next.config.mjs", "next.config.ts", "/next.config.ts",
        ".babelrc", "/.babelrc", "angular.json", "/angular.json",
        "vite.config.js", "/vite.config.js", "vite.config.ts", "/vite.config.ts"
      ];
      killList.forEach(k => delete data[k]);

      data["/postcss.config.js"] = currentFramework === "nextjs" 
          ? `module.exports = { plugins: { tailwindcss: {}, autoprefixer: {} } };`
          : `export default { plugins: { tailwindcss: {}, autoprefixer: {} } };`;

      data["/tailwind.config.js"] = currentFramework === "nextjs"
          ? `/** @type {import('tailwindcss').Config} */\nmodule.exports = { content: ["./index.html", "./src/**/*.{js,ts,jsx,tsx,vue,html}", "./app/**/*.{js,ts,jsx,tsx}", "./components/**/*.{js,ts,jsx,tsx}"], theme: { extend: {} }, plugins: [] };`
          : `/** @type {import('tailwindcss').Config} */\nexport default { content: ["./index.html", "./src/**/*.{js,ts,jsx,tsx,vue,html}", "./app/**/*.{js,ts,jsx,tsx}", "./components/**/*.{js,ts,jsx,tsx}"], theme: { extend: {} }, plugins: [] };`;

      if (currentFramework === "nextjs") {
        data["/tsconfig.json"] = JSON.stringify({ compilerOptions: { target: "es5", lib: ["dom", "dom.iterable", "esnext"], allowJs: true, skipLibCheck: true, strict: false, forceConsistentCasingInFileNames: true, noEmit: true, esModuleInterop: true, module: "esnext", moduleResolution: "node", resolveJsonModule: true, isolatedModules: true, jsx: "preserve", incremental: true, plugins: [{ name: "next" }], paths: { "@/*": ["./*"] } }, include: ["next-env.d.ts", "**/*.ts", "**/*.tsx", ".next/types/**/*.ts"], exclude: ["node_modules"] }, null, 2);
        
        data["/next.config.js"] = `/** @type {import('next').NextConfig} */\nconst nextConfig = { swcMinify: false, eslint: { ignoreDuringBuilds: true }, typescript: { ignoreBuildErrors: true }, images: { remotePatterns: [{ protocol: 'https', hostname: '**' }, { protocol: 'http', hostname: '**' }] } };\nmodule.exports = nextConfig;`;
        
        data["/app/layout.tsx"] = `import "./globals.css";\n\nexport default function RootLayout({ children }: { children: React.ReactNode }) {\n  return (\n    <html lang="en" suppressHydrationWarning>\n      <head>\n        <script dangerouslySetInnerHTML={{ __html: "window.addEventListener('error', function(e) { window.parent.postMessage({type: 'SPARK_RUNTIME_ERROR', message: e.message}, '*'); }); window.addEventListener('unhandledrejection', function(e) { window.parent.postMessage({type: 'SPARK_RUNTIME_ERROR', message: e.reason ? e.reason.message || e.reason : 'Unknown Promise Rejection'}, '*'); }); const originalConsoleError = console.error; console.error = function(...args) { let msg = args[0] instanceof Error ? args[0].message : (typeof args[0] === 'string' ? args[0] : String(args[0])); if (msg && !msg.includes('Warning:')) { window.parent.postMessage({type: 'SPARK_RUNTIME_ERROR', message: msg}, '*'); } originalConsoleError.apply(console, args); };" }} />\n      </head>\n      <body suppressHydrationWarning className="antialiased bg-[#0a0a0a] text-white min-h-screen">\n        {children}\n      </body>\n    </html>\n  );\n}`;
        
        // Ensure standard Next.js path exists
        data["/app/globals.css"] = `@tailwind base;\n@tailwind components;\n@tailwind utilities;\n\nbody {\n  background-color: #0a0a0a;\n  color: #ffffff;\n}\n`;
      }
      
      // 🚀 THE NUCLEAR CSS FIX: Find ANY CSS file the AI hallucinated and neutralize it
      Object.keys(data).forEach(key => {
        if (key.endsWith('.css')) {
          data[key] = `@tailwind base;\n@tailwind components;\n@tailwind utilities;\n\nbody {\n  background-color: #0a0a0a;\n  color: #ffffff;\n}\n`;
        }
      });
      
      // 🚀 BONUS FIX: Also protect Vite/React projects from the same error
      const viteCssFiles = ["/src/index.css", "/src/styles.css"];
      viteCssFiles.forEach(file => {
        if (data[file]) {
          data[file] = `@tailwind base;\n@tailwind components;\n@tailwind utilities;\n\nbody {\n  background-color: #0a0a0a;\n  color: #ffffff;\n}\n`;
        }
      });
    } else {
      if (currentFramework === "nextjs") {
        Object.keys(data).forEach(k => {
          if (k.match(/next\.config\.(ts)$/)) delete data[k];
        });
      }
    }

    if (currentFramework === "nextjs") {
      const layoutKeys = ["/app/layout.tsx", "/app/layout.jsx", "app/layout.tsx"];
      layoutKeys.forEach(key => {
        if (data[key]) {
          if (!/<html[^>]*suppressHydrationWarning/i.test(data[key])) data[key] = data[key].replace(/<html/i, '<html suppressHydrationWarning');
          if (!/<body[^>]*suppressHydrationWarning/i.test(data[key])) data[key] = data[key].replace(/<body/i, '<body suppressHydrationWarning');
          data[key] = data[key].replace(/>\s+<head/gi, '><head').replace(/<\/head>\s+<body/gi, '</head><body').replace(/<html([^>]*)>\s+<body/gi, '<html$1><body').replace(/>\s+<\/html>/gi, '></html>');
        }
      });

      Object.keys(data).forEach(key => {
        if (key.endsWith('.tsx') || key.endsWith('.jsx')) {
          let content = data[key];
          const needsClient = content.includes('useState') || content.includes('useEffect') || content.includes('useRef') || content.includes('onClick');
          if (needsClient && !content.includes('use client')) content = '"use client";\n' + content;
          data[key] = content;
        }
      });
    }

    const cssKeys = ["/app/globals.css", "app/globals.css", "/src/index.css", "src/index.css", "/style.css", "style.css", "/src/styles.css", "src/styles.css"];
    cssKeys.forEach(key => {
      if (data[key] && !data[key].includes("nextjs-portal")) {
        data[key] += `\n\n/* Forcefully hide Dev Overlays */\nnextjs-portal, vite-error-overlay { display: none !important; }\n`;
      }
    });

    const errorInjectionScript = `<script>window.addEventListener('error', function(e) { window.parent.postMessage({type: 'SPARK_RUNTIME_ERROR', message: e.message}, '*'); }); window.addEventListener('unhandledrejection', function(e) { window.parent.postMessage({type: 'SPARK_RUNTIME_ERROR', message: e.reason ? e.reason.message || e.reason : 'Unknown Promise Rejection'}, '*'); }); const originalConsoleError = console.error; console.error = function(...args) { let msg = args[0] instanceof Error ? args[0].message : (typeof args[0] === 'string' ? args[0] : String(args[0])); if (msg && !msg.includes('Warning:')) { window.parent.postMessage({type: 'SPARK_RUNTIME_ERROR', message: msg}, '*'); } originalConsoleError.apply(console, args); };</script>`;
    Object.keys(data).forEach(key => {
      if (key.endsWith('.html') && data[key].includes('</head>')) {
        data[key] = data[key].replace('</head>', `${errorInjectionScript}\n</head>`);
      }
    });

    return data;
  };

  const handleEnhance = async () => {
    if (!inputPrompt) return;
    setIsEnhancing(true);
    try {
      const res = await fetch("/api/enhance", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt: inputPrompt, customApiKey }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setInputPrompt(data.enhancedPrompt);
    } catch (err) {
      console.error(err);
    } finally {
      setIsEnhancing(false);
    }
  };

  const handleImageAttach = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    if (!files.length) return;
    
    const maxAllowed = 5 - attachedImages.length;
    if (maxAllowed <= 0) {
      setError("You can only attach up to 5 images at once.");
      return;
    }

    const filesToProcess = files.slice(0, maxAllowed);
    if (files.length > maxAllowed) {
      setError(`You can only attach up to 5 images. Showing first ${maxAllowed}.`);
    }

    const newImages: string[] = [];
    let processed = 0;

    filesToProcess.forEach(file => {
      if (!file.type.startsWith('image/')) {
        processed++;
        return;
      }
      const reader = new FileReader();
      reader.onload = (event) => {
        newImages.push(event.target?.result as string);
        processed++;
        if (processed === filesToProcess.length) {
          setAttachedImages(prev => [...prev, ...newImages]);
        }
      };
      reader.readAsDataURL(file);
    });
    
    e.target.value = "";
  };

  const handlePaste = (e: React.ClipboardEvent<HTMLTextAreaElement>) => {
    const items = e.clipboardData.items;
    const pastedImages: File[] = [];

    for (let i = 0; i < items.length; i++) {
      if (items[i].type.indexOf('image') !== -1) {
        const blob = items[i].getAsFile();
        if (blob) pastedImages.push(blob);
      }
    }

    if (pastedImages.length > 0) {
      e.preventDefault(); 
      const maxAllowed = 5 - attachedImages.length;
      
      if (maxAllowed <= 0) {
        setError("You can only attach up to 5 images at once.");
        return;
      }

      const filesToProcess = pastedImages.slice(0, maxAllowed);
      if (pastedImages.length > maxAllowed) {
         setError(`You can only attach up to 5 images. Added ${maxAllowed} from clipboard.`);
      }

      const newImages: string[] = [];
      let processed = 0;

      filesToProcess.forEach(blob => {
         const reader = new FileReader();
         reader.onload = (event) => {
            newImages.push(event.target?.result as string);
            processed++;
            if (processed === filesToProcess.length) {
              setAttachedImages(prev => [...prev, ...newImages]);
            }
         };
         reader.readAsDataURL(blob);
      });
    }
  };

  const toggleListening = () => {
    if (isListening) {
      recognitionRef.current?.stop();
      setIsListening(false);
      return;
    }

    const win = window as unknown as IWindow;
    const SpeechRecognitionConstructor = win.SpeechRecognition || win.webkitSpeechRecognition;
    
    if (!SpeechRecognitionConstructor) {
      setError("Speech recognition is not supported in this browser. Please use Chrome or Edge.");
      return;
    }

    const recognition = new SpeechRecognitionConstructor();
    recognitionRef.current = recognition;
    recognition.continuous = true;
    recognition.interimResults = true; 
    recognition.lang = 'en-US';

    const startingText = inputPrompt; 

    recognition.onstart = () => {
      setIsListening(true);
    };

    recognition.onresult = (event: ISpeechRecognitionEvent) => {
      let currentTranscript = "";
      for (let i = event.resultIndex; i < event.results.length; ++i) {
        currentTranscript += event.results[i][0].transcript;
      }
      
      const newPrompt = startingText ? `${startingText} ${currentTranscript}` : currentTranscript;
      setInputPrompt(newPrompt);
    };

    recognition.onerror = (event: ISpeechRecognitionErrorEvent) => {
      console.error("Speech recognition error:", event.error);
      setIsListening(false);
    };

    recognition.onend = () => {
      setIsListening(false);
    };

    recognition.start();
  };

  const handleGithubExport = async () => {
    if (!githubToken || !githubRepoName || !files) return;
    setIsExporting(true);
    setError(null);
    
    let currentFilesToPush = files;
    if (vmRef.current) {
      try {
        const fsSnapshot = await vmRef.current.getFsSnapshot();
        if (fsSnapshot && Object.keys(fsSnapshot).length > 0) {
          const syncedFiles: ProjectFiles = {};
          Object.entries(fsSnapshot).forEach(([path, content]) => {
            if (path.includes('node_modules') || path.includes('.next') || path.includes('dist') || path.includes('.git') || path.includes('package-lock.json')) return;
            const cleanPath = path.startsWith('/') ? path : `/${path}`;
            syncedFiles[cleanPath] = content;
          });
          currentFilesToPush = syncedFiles;
        }
      } catch {
        // Ignored
      }
    }

    try {
      const res = await fetch("/api/export/github", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ files: currentFilesToPush, repoName: githubRepoName, githubToken }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error);

      window.open(data.url, '_blank');
      setIsGithubModalOpen(false);
      setMessages([...messages, { id: generateUniqueId(), role: "assistant", content: `✅ **Success!** Your project has been pushed to GitHub:\n[${data.url}](${data.url})` }]);

    } catch (err: unknown) {
      const errorMessage = err instanceof Error ? err.message : "Failed to push to GitHub.";
      setError(errorMessage);
    } finally {
      setIsExporting(false);
    }
  };

  const handleZipUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    
    setIsUploadModalOpen(false);
    setLoading(true);
    setError(null);

    try {
      const JSZip = (await import("jszip")).default;
      const zip = new JSZip();
      const zipContent = await zip.loadAsync(file);
      const extractedFiles: ProjectFiles = {};
      let detectedFramework = "react-vite"; 
      const promises: Promise<void>[] = [];
      const binaryExts = ['png', 'jpg', 'jpeg', 'gif', 'svg', 'ico', 'webp', 'mp4', 'webm', 'ogg', 'mp3', 'zip', 'tar'];

      zipContent.forEach((relativePath, zipEntry) => {
        if (zipEntry.dir) return;
        if (relativePath.includes('node_modules/') || relativePath.includes('.git/') || relativePath.includes('.next/') || relativePath.includes('dist/') || relativePath.includes('build/') || relativePath.includes('package-lock.json') || relativePath.includes('yarn.lock') || relativePath.includes('pnpm-lock.yaml')) return;
        const ext = relativePath.split('.').pop()?.toLowerCase();
        if (ext && binaryExts.includes(ext)) return;

        promises.push(
          zipEntry.async("string").then((content) => {
            const cleanPath = relativePath.startsWith('/') ? relativePath : `/${relativePath}`;
            extractedFiles[cleanPath] = content;
          })
        );
      });

      await Promise.all(promises);

      let finalFiles = { ...extractedFiles };
      const paths = Object.keys(finalFiles);
      const packageJsonPath = paths.find(p => p.endsWith('/package.json') || p === '/package.json');

      if (packageJsonPath && packageJsonPath !== '/package.json') {
        const rootPrefix = packageJsonPath.replace('package.json', ''); 
        const unnestedFiles: ProjectFiles = {};
        for (const [key, content] of Object.entries(finalFiles)) {
          if (key.startsWith(rootPrefix)) {
            unnestedFiles[key.replace(rootPrefix, '/')] = content;
          }
        }
        finalFiles = unnestedFiles;
      } else if (!packageJsonPath) {
        throw new Error("No package.json found. Make sure this is a valid Node.js project.");
      }

      if (finalFiles["/package.json"]) {
        try {
          const pkg = JSON.parse(finalFiles["/package.json"]);
          const deps = { ...(pkg.dependencies || {}), ...(pkg.devDependencies || {}) };
          if (deps["next"]) detectedFramework = "nextjs";
          else if (deps["@angular/core"]) detectedFramework = "angular";
          else if (deps["vue"]) detectedFramework = "vue-vite";
          else if (deps["react"] && deps["vite"]) detectedFramework = "react-vite";
          else if (deps["vite"]) detectedFramework = "vanilla-vite";

          if (detectedFramework === "nextjs") {
             if (pkg.scripts && typeof pkg.scripts.dev === 'string') pkg.scripts.dev = "next dev"; 
             if (pkg.dependencies && pkg.dependencies["next"]) {
               pkg.dependencies["next"] = "14.2.15";
             }
             if (pkg.devDependencies && pkg.devDependencies["next"]) {
               pkg.devDependencies["next"] = "14.2.15";
             }
             if (finalFiles["/next.config.ts"]) {
                 delete finalFiles["/next.config.ts"];
             }
             finalFiles["/next.config.js"] = `/** @type {import('next').NextConfig} */\nconst nextConfig = { swcMinify: false, eslint: { ignoreDuringBuilds: true }, typescript: { ignoreBuildErrors: true }, images: { remotePatterns: [{ protocol: 'https', hostname: '**' }, { protocol: 'http', hostname: '**' }] } };\nmodule.exports = nextConfig;`;
          }
          finalFiles["/package.json"] = JSON.stringify(pkg, null, 2);
        } catch {
          // Ignored
        }
      }

      setFramework(detectedFramework);
      setFiles(finalFiles);
      
      const initialMessages: Message[] = [
        { id: generateUniqueId(), role: "user", content: `Uploaded ${file.name}` },
        { id: generateUniqueId(), role: "assistant", content: `Successfully imported **${file.name}**. The project is booting up now in the secure WebContainer. What would you like to modify?` }
      ];
      setMessages(initialMessages);

      const newChat: ChatSession = {
        id: generateUniqueId(),
        title: `Import: ${file.name}`,
        messages: initialMessages,
        framework: detectedFramework,
        files: finalFiles,
        isPinned: false,
        isDeleted: false,
        userId: userId || undefined,
        timestamp: Date.now()
      };

      setCurrentChatId(newChat.id);
      saveHistory([newChat, ...history], newChat);
      setPreviewKey(prev => prev + 1);

    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Failed to extract ZIP.";
      setError(msg);
    } finally {
      setLoading(false);
      if (fileInputRef.current) fileInputRef.current.value = ""; 
    }
  };

  const handleRewind = async (index: number) => {
    const targetMessage = messages[index];
    if (!targetMessage || !targetMessage.fileSnapshot) return;

    const confirmed = window.confirm("🕰️ Are you sure you want to rewind to this version? All subsequent messages and code changes will be permanently deleted.");
    if (!confirmed) return;

    setIsUpdating(true);
    
    const newMessages = messages.slice(0, index + 1);
    const newFiles = targetMessage.fileSnapshot;

    setMessages(newMessages);
    setFiles(newFiles);
    
    if (currentChatId) {
      const chatToUpdate = history.find(h => h.id === currentChatId);
      if (chatToUpdate) {
        const updatedChat = { ...chatToUpdate, messages: newMessages, files: newFiles };
        const updatedHistory = history.map(h => h.id === currentChatId ? updatedChat : h);
        saveHistory(updatedHistory, updatedChat);

        fetch('/api/share/typing', { 
          method: 'POST', 
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ id: currentChatId, mode: 'refactor' }) 
        }).catch(() => {});
      }
    }

    setPreviewKey(prev => prev + 1);
    setIsUpdating(false);
  };

  const handleStopGeneration = () => {
    if (abortController) {
      abortController.abort();
      setAbortController(null);
      setLoading(false);
      setIsStreaming(false); 
      setIsUpdating(false);
    }
  };

  const handleEditSubmit = (index: number) => {
    if (!editMsgContent.trim()) return;
    
    const historyToKeep = messages.slice(0, index);
    const promptToSubmit = editMsgContent;
    
    setEditingMsgIndex(null);
    setEditMsgContent("");
    
    handleGenerate({ overrideMessages: historyToKeep, overridePrompt: promptToSubmit });
  };

  const handleGenerate = async (options: { skipWarning?: boolean, forceCreate?: boolean, overrideMessages?: Message[], overridePrompt?: string, overrideFramework?: string } = {}) => {
    const promptToUse = options.overridePrompt !== undefined ? options.overridePrompt : inputPrompt;
    
    if (!promptToUse.trim() && attachedImages.length === 0) return;

    if (isListening) {
       recognitionRef.current?.stop();
       setIsListening(false);
    }
    
    let isUpdateMode = files !== null && !options.forceCreate;

    if (isUpdateMode && !options.skipWarning) {
      const promptLower = promptToUse.toLowerCase().trim();
      
      const isErrorLog = /(error|failed|fail|compile|exception|traceback|syntax|expected|caused by|dismissed|not working|cannot|can not|can't|cant|dont|don't|doesnt|doesn't|wont|won't|bug|broken|issue|missing)/i.test(promptLower) || promptLower.includes('```');
      
      const explicitNewProject = /(build|create|generate|develop|start)\s+(?:a\s+|an\s+|the\s+|new\s+|a\s+new\s+|brand\s+new\s+|fresh\s+)?(?:[a-zA-Z0-9_-]+\s+){0,3}(app|project|website|site|platform|dashboard|application|clone|game|portfolio|portal|system)\b/i.test(promptLower);
      
      if (explicitNewProject && !isErrorLog) {
        setOverwriteWarningOpen(true);
        return; 
      }
    }

    setOverwriteWarningOpen(false);
    
    let currentMessages = options.overrideMessages !== undefined ? options.overrideMessages : messages;
    let currentFilesState = files;

    if (options.forceCreate) {
      currentMessages = [];
      currentFilesState = null;
      setFiles(null);
      setMessages([]);
      setCurrentChatId(null);
      isUpdateMode = false;
    }

    if (vmRef.current && isUpdateMode) {
      try {
        const fsSnapshot = await vmRef.current.getFsSnapshot();
        if (fsSnapshot && Object.keys(fsSnapshot).length > 0) {
          const syncedFiles: ProjectFiles = {};
          Object.entries(fsSnapshot).forEach(([path, content]) => {
            if (
              path.includes('node_modules') ||
              path.includes('.next') ||
              path.includes('dist') ||
              path.includes('.git') ||
              path.includes('package-lock.json')
            ) return;

            const cleanPath = path.startsWith('/') ? path : `/${path}`;
            syncedFiles[cleanPath] = content;
          });
          currentFilesState = syncedFiles;
          setFiles(syncedFiles);
        }
      } catch (syncErr) {
        console.warn("Failed to sync StackBlitz FS:", syncErr);
      }
    }

    const activeTags: string[] = [];
    if (currentFilesState) {
      Object.keys(currentFilesState).forEach(key => {
        if (promptToUse.includes(`@${key}`)) {
          activeTags.push(key);
        }
      });
    }

    const imagesToSend = attachedImages.length > 0 ? attachedImages : undefined;
    
    const newMessagesToSend: Message[] = [...currentMessages, { id: generateUniqueId(), role: "user", content: promptToUse || "Please implement the attached design.", images: imagesToSend }];
    setMessages(newMessagesToSend); 
    
    if (options.overridePrompt === undefined) setInputPrompt(""); 
    setAttachedImages([]);
    setMentionOpen(false);
    
    if (isUpdateMode) setIsUpdating(true);
    else setLoading(true);
    
    setError(null);

    const controller = new AbortController();
    setAbortController(controller);

    const activeFramework = options.overrideFramework || framework;

    if (currentChatId) {
      const syncMode = isUpdateMode ? 'refactor' : (!currentFilesState ? 'architect' : 'chat');
      setTimeout(() => {
        fetch('/api/share/typing', { 
          method: 'POST', 
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ id: currentChatId, mode: syncMode }) 
        }).catch(() => {});
      }, 0);
    }

    try {
      const res = await fetch("/api/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ 
          messages: newMessagesToSend, 
          attachedImages: imagesToSend, 
          currentFiles: currentFilesState, 
          customApiKey, 
          framework: activeFramework,
          taggedFiles: activeTags 
        }),
        signal: controller.signal
      });

      if (!res.ok) throw new Error(await res.text() || "Failed to process request");

      setLoading(false);
      setIsStreaming(true);

      setMessages(prev => [...prev, { id: generateUniqueId(), role: "assistant", content: "" }]);

      const reader = res.body?.getReader();
      const decoder = new TextDecoder();
      let rawText = "";
      let visibleText = "";

      if (reader) {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          
          const chunk = decoder.decode(value, { stream: true });
          rawText += chunk;

          const fileStartIndex = rawText.indexOf("<FILE_START");
          const mismatchIndex = rawText.indexOf("<MISMATCH");
          const ruleIndex = rawText.indexOf("<NEW_RULE");
          
          let cutIndex = -1;
          if (fileStartIndex !== -1) cutIndex = fileStartIndex;
          if (mismatchIndex !== -1 && (cutIndex === -1 || mismatchIndex < cutIndex)) cutIndex = mismatchIndex;
          if (ruleIndex !== -1 && (cutIndex === -1 || ruleIndex < cutIndex)) cutIndex = ruleIndex;

          if (cutIndex !== -1) {
              visibleText = rawText.substring(0, cutIndex).trim();
          } else {
              visibleText = rawText;
          }

          setMessages(prev => {
             const updated = [...prev];
             updated[updated.length - 1] = { ...updated[updated.length - 1], content: visibleText + " ▍" };
             return updated;
          });
        }
      }

      setIsStreaming(false);

      const mergedFiles: Record<string, string> = currentFilesState ? { ...currentFilesState } : {};
      let isConversational = false;
      let assistantMessage = visibleText.trim() || (isUpdateMode ? "I have updated the files as requested." : "Project generated successfully! What should we build next?");

      const mismatchMatch = /<MISMATCH\s+requested=["']([^"']+)["']\s*\/>/i.exec(rawText);
      
      if (mismatchMatch) {
         let targetFramework = mismatchMatch[1].toLowerCase().trim();
         
         if (targetFramework.includes('vue')) targetFramework = 'vue-vite';
         else if (targetFramework.includes('react') && !targetFramework.includes('next')) targetFramework = 'react-vite';
         else if (targetFramework.includes('next')) targetFramework = 'nextjs';
         else if (targetFramework.includes('angular')) targetFramework = 'angular';
         else if (targetFramework.includes('vanilla') || targetFramework.includes('html')) targetFramework = 'vanilla-vite';

         if (targetFramework === activeFramework) {
             assistantMessage = "I encountered a minor generation error parsing the framework. Please click 'Generate' again to retry.";
             isConversational = true; 
         } else {
             setMismatchData({ target: targetFramework, prompt: promptToUse });
             setMessages(newMessagesToSend); 
             setIsUpdating(false);
             setAbortController(null);
             return; 
         }
      }

      // 🚀 BULLETPROOF PARSER: Stops at </FILE_END> OR the next <FILE_START>
      const fileRegex = /<FILE_START\s+path=["']?([^"'>]+)["']?\s*>([\s\S]*?)(?=<\/FILE_END>|<FILE_START|$)/gi;
      let match;
      let appliedChanges = 0;

      // 1. Parse full file replacements or brand new files
      while ((match = fileRegex.exec(rawText)) !== null) {
        let path = match[1].trim();
        if (!path.startsWith('/')) path = '/' + path;
        let newContent = match[2].replace(/^```[a-z]*\n?/mi, '').replace(/\n?```$/i, '').trim();
        newContent = newContent.replace(/<\/?FILE_START[^>]*>/gi, '').replace(/<\/?FILE_END>/gi, '').trim();
        mergedFiles[path] = newContent;
        appliedChanges++;
      }

      // 2. Parse Diffs/Patches for existing files
      const updateRegex = /<UPDATE\s+path=["']?([^"'>]+)["']?\s*>([\s\S]*?)(?:<\/UPDATE>|$)/gi;
      const replaceRegex = /<REPLACE\s+start=["']?(\d+)["']?\s+end=["']?(\d+)["']?\s*>([\s\S]*?)<\/REPLACE>/gi;
      
      let updateMatch;
      while ((updateMatch = updateRegex.exec(rawText)) !== null) {
        let path = updateMatch[1].trim();
        if (!path.startsWith('/')) path = '/' + path;
        
        const originalContent = mergedFiles[path] || "";
        const lines = originalContent.split('\n');
        
        const replaceBlocks = [];
        let replaceMatch;
        while ((replaceMatch = replaceRegex.exec(updateMatch[2])) !== null) {
          replaceBlocks.push({
            start: parseInt(replaceMatch[1], 10),
            end: parseInt(replaceMatch[2], 10),
            content: replaceMatch[3].replace(/^```[a-z]*\n?/mi, '').replace(/\n?```$/i, '').trim()
          });
        }
        
        // Apply patches from bottom to top (reverse order) so line numbers don't shift during edits!
        replaceBlocks.sort((a, b) => b.start - a.start).forEach(block => {
           const startIndex = Math.max(0, block.start - 1);
           const deleteCount = Math.max(0, block.end - block.start + 1);
           lines.splice(startIndex, deleteCount, block.content);
        });

        mergedFiles[path] = lines.join('\n');
        appliedChanges++;
      }

      // 🚀 3. Parse Autonomous File Deletions (Ghost File Fix)
      const deleteRegex = /<DELETE\s+path=["']?([^"'>]+)["']?\s*\/>/gi;
      let deleteMatch;
      const destroyFilesQueue: string[] = [];
      
      while ((deleteMatch = deleteRegex.exec(rawText)) !== null) {
        let path = deleteMatch[1].trim();
        if (!path.startsWith('/')) path = '/' + path;
        
        delete mergedFiles[path]; // Remove from React state
        destroyFilesQueue.push(path.replace(/^\//, "")); // Queue for WebContainer OS destruction
        appliedChanges++;
      }

      if (appliedChanges === 0) {
         isConversational = true;
      }

      const cleanData = isConversational ? (currentFilesState || {}) : sanitizeAndPrepareFiles(mergedFiles, activeFramework, isUpdateMode);
      if (!isConversational) setFiles(cleanData);

      // (Attach destroy queue to the window so we can access it during the VM update below)
      if (typeof window !== 'undefined') {
        (window as Window & { _pendingDestroys?: string[] })._pendingDestroys = destroyFilesQueue;
      }

      const finalMessages: Message[] = [
        ...newMessagesToSend, 
        { id: generateUniqueId(), role: "assistant", content: assistantMessage, fileSnapshot: cleanData }
      ];
      setMessages(finalMessages);

      const chatId = currentChatId || generateUniqueId();
      const existingChat = currentChatId ? history.find(h => h.id === currentChatId) : null;
      let chatTitle = existingChat?.title;
      
      if (!chatTitle) {
        const chatTitleText = newMessagesToSend[newMessagesToSend.length - 1].content || "New Project";
        chatTitle = chatTitleText.split('\n')[0].slice(0, 30) + (chatTitleText.length > 30 ? "..." : "");
      }

      const historyMessages = finalMessages.map(msg => {
        if (msg.images || msg.image) {
           const imgCount = msg.images ? msg.images.length : 1;
           return { ...msg, image: undefined, images: undefined, content: `[${imgCount} Image(s) Provided] ${msg.content}` };
        }
        return msg;
      });

      const newChat: ChatSession = {
        id: chatId,
        title: chatTitle,
        messages: historyMessages,
        framework: activeFramework,
        files: cleanData,
        isPinned: existingChat?.isPinned || false,
        isShared: existingChat?.isShared || false,
        isDeleted: false,
        collaborators: existingChat?.collaborators || [],
        userId: userId || undefined,
        timestamp: Date.now()
      };

      if (currentChatId && !options.forceCreate) {
        saveHistory(history.map(h => h.id === chatId ? newChat : h), newChat);
      } else {
        setCurrentChatId(chatId);
        saveHistory([newChat, ...history], newChat);
      }

      if (isConversational) return; 

      if (vmRef.current && isUpdateMode) {
        try {
          const diffFiles: Record<string, string> = {};
          Object.entries(cleanData).forEach(([path, content]) => {
            // ONLY add the file to the update queue if the content actually changed
            if (!currentFilesState || currentFilesState[path] !== content) {
              const cleanPath = path.replace(/^\//, "");
              diffFiles[cleanPath] = content;
            }
          });
          
          // 🚀 Execute the File Deletions inside the WebContainer OS
          const customWindow = window as Window & { _pendingDestroys?: string[] };
          const pendingDestroys = customWindow._pendingDestroys || [];
          
          if (Object.keys(diffFiles).length > 0 || pendingDestroys.length > 0) {
            await vmRef.current.applyFsDiff({ 
              create: diffFiles, 
              destroy: pendingDestroys 
            });
            customWindow._pendingDestroys = []; // Clear queue
          }
        } catch {
          setPreviewKey(prev => prev + 1); 
        }
      } else {
        setPreviewKey(prev => prev + 1); 
      }
      
    } catch (err: unknown) {
      if (err instanceof Error && err.name === 'AbortError') {
        console.log("Generation stopped by user.");
      } else {
        const rawError = err instanceof Error ? err.message : "An unexpected error occurred";
        const errorMessage = rawError.includes("429") || rawError.includes("Quota")
          ? "⚠️ High Traffic Alert: The daily free-tier AI limit has been reached. Please check back tomorrow, or enter your own API Key in settings."
          : rawError;
        
        setMessages(newMessagesToSend);
        setError(errorMessage);
      }
    } finally {
      setAbortController(null);
      setLoading(false);
      setIsUpdating(false);
      setIsStreaming(false);
    }
  };

  const loadChat = async (chat: ChatSession) => {
    if (currentChatId === chat.id) {
      setActiveTab('workspace');
      return;
    }

    const previousFramework = framework;
    
    if (chat.messages) {
      setMessages(chat.messages);
    } else if (chat.prompt) {
      setMessages([{ id: generateUniqueId(), role: "user", content: chat.prompt }, { id: generateUniqueId(), role: "assistant", content: "Project loaded from legacy history."}]);
    }

    setFramework(chat.framework);
    setCurrentChatId(chat.id);
    setActiveTab('workspace');

    const hasFiles = chat.files && Object.keys(chat.files).length > 0;

    if (hasFiles) {
      if (vmRef.current && previousFramework === chat.framework && filesRef.current && Object.keys(filesRef.current).length > 0) {
        const diffFiles: Record<string, string> = {};
        Object.entries(chat.files).forEach(([path, content]) => {
          diffFiles[path.replace(/^\//, "")] = content;
        });

        const destroyFiles: string[] = [];
        Object.keys(filesRef.current).forEach(path => {
          if (!chat.files[path]) {
            destroyFiles.push(path.replace(/^\//, ""));
          }
        });

        setFiles(chat.files);

        try {
          await vmRef.current.applyFsDiff({ create: diffFiles, destroy: destroyFiles });
          return; 
        } catch {
          setPreviewKey(prev => prev + 1);
        }
      } else {
        setFiles(chat.files);
        setPreviewKey(prev => prev + 1); 
      }
    } else {
      setFiles(null);
    }
  };

  const togglePin = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    const chatToUpdate = history.find(h => h.id === id);
    if (!chatToUpdate) return;

    const updatedChat = { ...chatToUpdate, isPinned: !chatToUpdate.isPinned };
    const updated = history.map(h => h.id === id ? updatedChat : h);
    saveHistory(updated, updatedChat);
    setMenuOpenId(null);
  };

  const softDeleteChat = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    const chatToUpdate = history.find(h => h.id === id);
    if (!chatToUpdate) return;
    
    const updatedChat = { ...chatToUpdate, isDeleted: true, isPinned: false };
    const updated = history.map(h => h.id === id ? updatedChat : h);
    saveHistory(updated, updatedChat);
    
    if (currentChatId === id) {
      setFiles(null);
      setMessages([]);
      setInputPrompt("");
      setCurrentChatId(null);
      setActiveTab('history');
    }
    setMenuOpenId(null);
  };

  const restoreChat = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    const chatToUpdate = history.find(h => h.id === id);
    if (!chatToUpdate) return;
    
    const updatedChat = { ...chatToUpdate, isDeleted: false };
    const updated = history.map(h => h.id === id ? updatedChat : h);
    saveHistory(updated, updatedChat);
    setMenuOpenId(null);
  };

  const permanentDeleteChat = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setConfirmDelete({ type: 'single', id });
    setMenuOpenId(null);
  };

  const emptyTrash = () => {
    setConfirmDelete({ type: 'all' });
  };

  const executeDelete = async () => {
    if (!confirmDelete) return;

    if (confirmDelete.type === 'single' && confirmDelete.id) {
      const updated = history.filter(h => h.id !== confirmDelete.id);
      if (userId) {
        fetch(`/api/history/delete`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ id: confirmDelete.id })
        }).catch(() => console.warn("Could not delete from remote DB"));
      }
      saveHistory(updated);
    } 
    else if (confirmDelete.type === 'all') {
      const deletedItems = history.filter(h => h.isDeleted);
      const remainingItems = history.filter(h => !h.isDeleted);
      
      setHistory(remainingItems);
      
      if (userId) {
        try {
          await Promise.all(deletedItems.map(item => 
            fetch(`/api/history/delete`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ id: item.id })
            })
          ));
        } catch {
          console.warn("Could not empty all items from remote DB");
        }
      } else {
        try {
          localStorage.setItem("spark_chat_history", JSON.stringify(remainingItems));
        } catch {
          // Ignored
        }
      }
    }
    
    setConfirmDelete(null);
  };

  const saveRename = (id: string, e: React.MouseEvent | React.KeyboardEvent) => {
    e.stopPropagation();
    const chatToUpdate = history.find(h => h.id === id);
    if (!chatToUpdate) return;

    const updatedChat = { ...chatToUpdate, title: editTitle };
    const updated = history.map(h => h.id === id ? updatedChat : h);
    saveHistory(updated, updatedChat);
    setEditingChatId(null);
  };

  const startRename = (chat: ChatSession, e: React.MouseEvent) => {
    e.stopPropagation();
    setEditingChatId(chat.id);
    setEditTitle(chat.title);
    setMenuOpenId(null);
  };

  const batchMoveToTrash = async () => {
    if (selectedChatIds.size === 0) return;
    
    const updatedHistory = history.map(h => 
      selectedChatIds.has(h.id) ? { ...h, isDeleted: true, isPinned: false } : h
    );
    
    saveHistory(updatedHistory);
    
    // 🚀 NEW: Wait for ALL database updates to finish before letting the function complete!
    if (userId) {
      const syncPromises = Array.from(selectedChatIds).map(id => {
        const chatToUpdate = updatedHistory.find(h => h.id === id);
        if (chatToUpdate) {
          return fetch("/api/history/save", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(chatToUpdate),
          }).catch(() => console.warn("Failed to sync batch trash to DB"));
        }
        return Promise.resolve();
      });
      
      await Promise.all(syncPromises);
    }
    
    if (currentChatId && selectedChatIds.has(currentChatId)) {
      setFiles(null);
      setMessages([]);
      setInputPrompt("");
      setCurrentChatId(null);
      setActiveTab('history');
    }
    
    setIsSelectionMode(false);
    setSelectedChatIds(new Set());
  };

  const handleRebootSandbox = () => {
    setDetectedError(null); 
    setPreviewKey((prev) => prev + 1); 
  };

  const handleDevelopNew = () => {
    setFiles(null);
    setMessages([]);
    setInputPrompt("");
    setCurrentChatId(null);
    setActiveTab('workspace');
  };

  const sortedHistory = [...history].sort((a, b) => {
    if (a.isPinned === b.isPinned) return b.timestamp - a.timestamp;
    return a.isPinned ? -1 : 1;
  });

  const availableFiles = files ? Object.keys(files).filter(k => !k.startsWith('/node_modules') && !k.startsWith('/.next')) : [];
  const filteredFiles = availableFiles.filter(f => f.toLowerCase().includes(mentionQuery.toLowerCase()));

  const handlePromptChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const val = e.target.value;
    setInputPrompt(val);
    
    if (!files) return;

    const cursorPos = e.target.selectionStart || 0;
    const textBeforeCursor = val.slice(0, cursorPos);
    const lastAtSymbol = textBeforeCursor.lastIndexOf('@');

    if (lastAtSymbol !== -1) {
      const textAfterAt = textBeforeCursor.slice(lastAtSymbol + 1);
      if (!/\s/.test(textAfterAt)) {
        setMentionQuery(textAfterAt);
        setMentionOpen(true);
        setMentionIndex(0);
        return;
      }
    }
    setMentionOpen(false);
  };

  const insertMention = (filePath: string) => {
    const cursorPos = textareaRef.current?.selectionStart || 0;
    const textBeforeCursor = inputPrompt.slice(0, cursorPos);
    const textAfterCursor = inputPrompt.slice(cursorPos);
    
    const lastAtSymbol = textBeforeCursor.lastIndexOf('@');
    if (lastAtSymbol !== -1) {
      const newTextBefore = textBeforeCursor.slice(0, lastAtSymbol) + `@${filePath} `;
      setInputPrompt(newTextBefore + textAfterCursor);
      setMentionOpen(false);
      
      setTimeout(() => {
        if (textareaRef.current) {
          textareaRef.current.focus();
          const newPos = newTextBefore.length;
          textareaRef.current.setSelectionRange(newPos, newPos);
        }
      }, 0);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (mentionOpen && filteredFiles.length > 0) {
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setMentionIndex((prev) => (prev + 1) % filteredFiles.length);
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        setMentionIndex((prev) => (prev - 1 + filteredFiles.length) % filteredFiles.length);
      } else if (e.key === 'Enter' || e.key === 'Tab') {
        e.preventDefault();
        insertMention(filteredFiles[mentionIndex]);
      } else if (e.key === 'Escape') {
        setMentionOpen(false);
      }
      return; 
    }

    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleGenerate();
    }
  };

  if (!isLoaded) {
    return (
      <div className="flex h-screen w-full items-center justify-center bg-gray-950">
        <Loader2 className="w-10 h-10 text-blue-500 animate-spin" />
      </div>
    );
  }

  const renderedList = (() => {
    if (activeTab === 'trash') return sortedHistory.filter(h => h.isDeleted && (!h.userId || h.userId === user?.id));
    if (activeTab === 'shared') return sortedHistory.filter(h => !h.isDeleted && h.userId && h.userId !== user?.id);
    return sortedHistory.filter(h => !h.isDeleted && (!h.userId || h.userId === user?.id));
  })();

  const SUGGESTIONS = [
    { icon: <Zap size={14} className="text-yellow-400"/>, text: "Build a SaaS Landing Page" },
    { icon: <Box size={14} className="text-blue-400"/>, text: "Create a React Dashboard" },
    { icon: <ImageIcon size={14} className="text-purple-400"/>, text: "Design a Glassmorphism UI" },
    { icon: <FileCode2 size={14} className="text-green-400"/>, text: "Develop a Next.js Blog" }
  ];

  return (
    <div className="flex flex-col lg:flex-row h-screen w-full bg-[#0E1117] text-white overflow-hidden font-sans relative selection:bg-blue-500/30">
      
      {!userId && !isGuest && (
        <div className="absolute inset-0 z-[100] flex items-center justify-center bg-[#0E1117]/90 backdrop-blur-md p-4">
          <div className="bg-gray-900 border border-gray-800 p-8 rounded-3xl w-full max-w-md shadow-[0_20px_60px_-15px_rgba(0,0,0,0.5)] relative text-center animate-in zoom-in-95 duration-500 ease-out">
            <div className="w-24 h-24 mx-auto flex items-center justify-center mb-6 transition-transform hover:scale-105 duration-500">
              <img src="/logo.jpg?v=hq" alt="Spark AI" className="w-full h-full object-cover mix-blend-screen" />
            </div>
            
            <h1 className="text-3xl font-extrabold text-white mb-3 tracking-tight">Spark AI</h1>
            <p className="text-gray-400 mb-8 text-sm leading-relaxed">
              Log in to seamlessly save your projects to the cloud, or jump right in as a guest.
            </p>

            <div className="space-y-3">
              <SignInButton mode="modal">
                <button className="w-full bg-blue-600 hover:bg-blue-500 text-white font-bold py-3.5 rounded-xl transition-all shadow-lg hover:shadow-blue-500/20 active:scale-[0.98]">
                  Sign In
                </button>
              </SignInButton>
              
              <SignUpButton mode="modal">
                <button className="w-full bg-gray-800 hover:bg-gray-700 text-white font-bold py-3.5 rounded-xl border border-gray-700 transition-all active:scale-[0.98]">
                  Create Account
                </button>
              </SignUpButton>
              
              <div className="pt-4 border-t border-gray-800/50 mt-4">
                <button 
                  onClick={() => setIsGuest(true)}
                  className="w-full text-gray-500 hover:text-gray-300 font-medium py-2 transition-colors text-sm"
                >
                  Continue as Guest (Progress won&apos;t be saved)
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {isShareModalOpen && currentChatId && (
        <div className="absolute inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-md p-4 animate-in fade-in duration-300">
          <div className="bg-gray-900 border border-gray-800 p-6 rounded-2xl w-full max-w-md shadow-[0_20px_60px_-15px_rgba(0,0,0,0.5)] relative animate-in slide-in-from-top-8 zoom-in-95 duration-300 ease-out">
            <button onClick={() => { setIsShareModalOpen(false); setShareCopied(false); setError(null); }} className="absolute top-4 right-4 text-gray-500 hover:text-white transition-colors">
              <X className="w-5 h-5" />
            </button>
            <div className="flex items-center gap-3 mb-4">
              <div className="p-2 bg-blue-500/10 rounded-lg"><Share2 className="w-5 h-5 text-blue-500" /></div>
              <h2 className="text-xl font-bold text-white tracking-tight">Share Project</h2>
            </div>
            
            {error && <div className="mb-4 p-3 bg-red-500/10 border border-red-500/20 rounded-xl text-red-400 text-xs animate-in slide-in-from-top-2">{error}</div>}

            <div className="mb-6">
              <label className="block text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">Invite Collaborator</label>
              <div className="flex gap-2">
                <input 
                  type="email" 
                  value={inviteEmail}
                  onChange={(e) => setInviteEmail(e.target.value)}
                  placeholder="developer@gmail.com" 
                  className="flex-1 bg-gray-950 border border-gray-800 rounded-xl px-4 py-2.5 text-sm text-gray-300 outline-none focus:border-blue-500 transition-colors" 
                />
                <button 
                  onClick={() => handleManageCollaborator(inviteEmail, 'add', 'viewer')}
                  disabled={!inviteEmail || isInviting}
                  className="bg-blue-600 hover:bg-blue-500 text-white font-semibold px-4 py-2.5 rounded-xl transition-all shadow-md active:scale-95 disabled:opacity-50 disabled:active:scale-100 flex items-center justify-center min-w-[70px]"
                >
                  {isInviting && inviteEmail ? <Loader2 className="w-4 h-4 animate-spin" /> : "Add"}
                </button>
              </div>
            </div>

            {history.find(h => h.id === currentChatId)?.collaborators && history.find(h => h.id === currentChatId)!.collaborators!.length > 0 && (
              <div className="mb-6 border border-gray-800 rounded-xl bg-gray-950/50 overflow-hidden">
                <div className="px-4 py-2 border-b border-gray-800 bg-gray-900/50 text-xs font-bold text-gray-500 uppercase tracking-wider">Team Members</div>
                <div className="max-h-40 overflow-y-auto custom-scrollbar divide-y divide-gray-800/60">
                  {history.find(h => h.id === currentChatId)!.collaborators!.map((collab, idx) => (
                    <div key={idx} className="flex items-center justify-between px-4 py-3 group">
                      <div className="flex items-center gap-3 truncate pr-2">
                        <div className="w-6 h-6 rounded-full bg-blue-900/40 border border-blue-500/30 flex items-center justify-center text-blue-400 text-[10px] font-bold uppercase shrink-0">
                          {collab.email.substring(0, 2)}
                        </div>
                        <span className="text-sm text-gray-300 truncate">{collab.email}</span>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        {updatingCollab === collab.email ? (
                          <Loader2 className="w-4 h-4 animate-spin text-gray-500 mr-2" />
                        ) : (
                          <>
                            <select
                              value={collab.role}
                              onChange={(e) => handleManageCollaborator(collab.email, 'update', e.target.value)}
                              className={`text-[10px] font-bold uppercase tracking-wider px-2 py-1 rounded-md outline-none cursor-pointer appearance-none text-center ${
                                collab.role === 'editor' 
                                  ? 'bg-green-500/10 text-green-400 border border-green-500/20 focus:ring-1 focus:ring-green-500' 
                                  : 'bg-gray-800 text-gray-400 border border-gray-700 focus:ring-1 focus:ring-gray-500'
                              }`}
                            >
                              <option value="viewer">Viewer</option>
                              <option value="editor">Editor</option>
                            </select>
                            <button 
                              onClick={() => handleManageCollaborator(collab.email, 'remove')}
                              className="p-1 text-gray-500 hover:text-red-400 hover:bg-red-500/10 rounded transition-colors opacity-0 group-hover:opacity-100"
                              title="Remove user"
                            >
                              <X size={14} />
                            </button>
                          </>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <div className="bg-gray-950 border border-gray-800 rounded-xl p-4 mb-6 flex items-center justify-between">
              <div>
                <p className="text-sm font-semibold text-white">Public Link</p>
                <p className="text-xs text-gray-500 mt-0.5">Allow anyone with the link to view</p>
              </div>
              <button 
                onClick={() => toggleShare(currentChatId, history.find(h => h.id === currentChatId)?.isShared || false)}
                className={`w-11 h-6 rounded-full transition-colors relative ${history.find(h => h.id === currentChatId)?.isShared ? 'bg-blue-600' : 'bg-gray-700'}`}
              >
                <div className={`w-4 h-4 bg-white rounded-full absolute top-1 transition-transform ${history.find(h => h.id === currentChatId)?.isShared ? 'translate-x-6' : 'translate-x-1'}`}></div>
              </button>
            </div>

            {history.find(h => h.id === currentChatId)?.isShared && (
              <div className="animate-in slide-in-from-top-2 fade-in duration-300">
                <label className="block text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">Read-Only Link</label>
                <div className="flex gap-2">
                  <input 
                    type="text" 
                    readOnly
                    value={`${typeof window !== 'undefined' ? window.location.origin : ''}/share/${currentChatId}`} 
                    className="w-full bg-gray-950 border border-gray-800 rounded-xl px-4 py-2.5 text-sm text-gray-300 outline-none" 
                  />
                  <button 
                    onClick={() => {
                      navigator.clipboard.writeText(`${window.location.origin}/share/${currentChatId}`);
                      setShareCopied(true);
                      setTimeout(() => setShareCopied(false), 2000);
                    }}
                    className="bg-gray-800 hover:bg-gray-700 text-white p-2.5 rounded-xl transition-all shadow-md active:scale-95 flex items-center justify-center min-w-[44px]"
                  >
                    {shareCopied ? <CheckCheck className="w-4 h-4 text-green-400" /> : <Copy className="w-4 h-4" />}
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {confirmDelete && (
        <div className="absolute inset-0 z-[100] flex items-center justify-center bg-black/60 backdrop-blur-md p-4 animate-in fade-in duration-300">
          <div className="bg-gray-900 border border-red-500/30 p-6 rounded-2xl w-full max-w-md shadow-[0_20px_60px_-15px_rgba(239,68,68,0.2)] relative animate-in slide-in-from-top-8 zoom-in-95 duration-300 ease-out">
            <button onClick={() => setConfirmDelete(null)} className="absolute top-4 right-4 text-gray-500 hover:text-white transition-colors">
              <X className="w-5 h-5" />
            </button>
            
            <div className="flex items-center gap-3 mb-3">
              <div className="p-2 bg-red-500/10 rounded-lg border border-red-500/20">
                <AlertTriangle className="w-5 h-5 text-red-500" />
              </div>
              <h2 className="text-xl font-bold text-white tracking-tight">Delete Permanently?</h2>
            </div>
            
            <div className="bg-gray-950 border border-gray-800 rounded-xl p-4 mb-6">
              <p className="text-sm text-gray-300 leading-relaxed">
                {confirmDelete.type === 'all' 
                  ? "Are you sure you want to permanently delete ALL projects in the trash?" 
                  : "Are you sure you want to permanently delete this project?"}
              </p>
              <p className="text-sm text-red-400 font-semibold mt-3">
                This action cannot be undone.
              </p>
            </div>

            <div className="flex items-center gap-3">
              <button 
                onClick={() => setConfirmDelete(null)} 
                className="w-full bg-gray-800 hover:bg-gray-700 text-gray-300 hover:text-white font-semibold py-3 rounded-xl flex items-center justify-center gap-2 transition-all active:scale-[0.98] border border-gray-700"
              >
                Cancel
              </button>
              <button 
                onClick={executeDelete} 
                className="w-full bg-red-600 hover:bg-red-500 text-white font-semibold py-3 rounded-xl flex items-center justify-center gap-2 transition-all shadow-md hover:shadow-red-500/20 active:scale-[0.98]"
              >
                <Trash2 className="w-4 h-4" /> {confirmDelete.type === 'all' ? "Empty Trash" : "Delete Forever"}
              </button>
            </div>
          </div>
        </div>
      )}

      {mismatchData && (
        <div className="absolute inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-md p-4 animate-in fade-in duration-300">
          <div className="bg-gray-900 border border-red-500/30 p-6 rounded-2xl w-full max-w-md shadow-[0_20px_60px_-15px_rgba(239,68,68,0.2)] relative animate-in slide-in-from-top-8 zoom-in-95 duration-300 ease-out">
            <button 
              onClick={() => {
                 setInputPrompt(mismatchData.prompt); 
                 setMismatchData(null);
              }} 
              className="absolute top-4 right-4 text-gray-500 hover:text-white transition-colors"
            >
              <X className="w-5 h-5" />
            </button>

            <div className="flex items-center gap-3 mb-3">
              <div className="p-2 bg-red-500/10 rounded-lg border border-red-500/20">
                <AlertTriangle className="w-5 h-5 text-red-500" />
              </div>
              <h2 className="text-xl font-bold text-white tracking-tight">Framework Mismatch!</h2>
            </div>

            <div className="bg-gray-950 border border-gray-800 rounded-xl p-4 mb-6">
              <p className="text-sm text-gray-300 leading-relaxed">
                You asked to build a project using <span className="font-semibold text-blue-400 capitalize">{mismatchData.target.replace('-', ' ')}</span>, but your dropdown is currently set to <span className="font-semibold text-gray-400 capitalize">{framework.replace('-', ' ')}</span>.
              </p>
              <p className="text-sm text-gray-400 mt-3">
                Do you want to automatically switch your workspace and continue?
              </p>
            </div>

            <div className="space-y-3">
              <button 
                onClick={() => {
                  const targetFw = mismatchData.target;
                  const promptToRetry = mismatchData.prompt;
                  setFramework(targetFw);
                  setMismatchData(null);
                  
                  handleGenerate({ overridePrompt: promptToRetry, skipWarning: true, overrideFramework: targetFw });
                }} 
                className="w-full bg-blue-600 hover:bg-blue-500 text-white font-semibold py-3 rounded-xl flex items-center justify-center gap-2 transition-all shadow-md active:scale-[0.98] hover:shadow-blue-500/20"
              >
                <RefreshCw className="w-4 h-4" /> Switch to {mismatchData.target.replace('-', ' ')} & Continue
              </button>
              <button 
                onClick={() => {
                  setInputPrompt(mismatchData.prompt);
                  setMismatchData(null);
                }} 
                className="w-full bg-gray-800 hover:bg-gray-700 text-gray-300 hover:text-white font-semibold py-3 rounded-xl flex items-center justify-center gap-2 transition-all active:scale-[0.98] border border-gray-700"
              >
                Cancel & Edit Prompt
              </button>
            </div>
          </div>
        </div>
      )}

      {isGithubModalOpen && (
        <div className="absolute inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-md p-4 animate-in fade-in duration-300">
          <div className="bg-gray-900 border border-gray-800 p-6 rounded-2xl w-full max-w-md shadow-[0_20px_60px_-15px_rgba(0,0,0,0.5)] relative animate-in slide-in-from-top-8 zoom-in-95 duration-300 ease-out">
            <button onClick={() => setIsGithubModalOpen(false)} className="absolute top-4 right-4 text-gray-500 hover:text-white transition-colors disabled:opacity-50">
              <X className="w-5 h-5" />
            </button>
            
            <div className="flex items-center gap-3 mb-4">
              <div className="p-2 bg-white rounded-lg shadow-sm">
                <Github className="w-5 h-5 text-black" />
              </div>
              <h2 className="text-xl font-bold text-white tracking-tight">Push to GitHub</h2>
            </div>
            
            {error && <div className="mb-4 p-3 bg-red-500/10 border border-red-500/20 rounded-xl text-red-400 text-xs animate-in slide-in-from-top-2">{error}</div>}

            <div className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">Repository Name</label>
                <input 
                  type="text" 
                  value={githubRepoName} 
                  onChange={(e) => setGithubRepoName(e.target.value.replace(/[^a-zA-Z0-9-_]/g, '-'))} 
                  placeholder="my-awesome-app" 
                  className="w-full bg-gray-950 border border-gray-800 rounded-xl px-4 py-3 text-sm text-white focus:ring-2 focus:ring-blue-500 outline-none transition-all" 
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">Personal Access Token</label>
                <input 
                  type="password" 
                  value={githubToken} 
                  onChange={(e) => saveGithubToken(e.target.value)} 
                  placeholder="ghp_..." 
                  className="w-full bg-gray-950 border border-gray-800 rounded-xl px-4 py-3 text-sm text-white focus:ring-2 focus:ring-blue-500 outline-none transition-all" 
                />
                <p className="text-[10px] text-gray-500 mt-2 leading-relaxed">
                  Needs <strong className="text-gray-300">repo</strong> permissions. Get one from your <a href="[https://github.com/settings/tokens/new](https://github.com/settings/tokens/new)" target="_blank" rel="noopener noreferrer" className="text-blue-400 hover:underline">GitHub Developer Settings</a>. Saved locally.
                </p>
              </div>

              <button 
                onClick={handleGithubExport} 
                disabled={isExporting || !githubToken || !githubRepoName}
                className="w-full bg-white text-black hover:bg-gray-200 font-semibold py-3 rounded-xl flex items-center justify-center gap-2 transition-all shadow-md active:scale-[0.98] hover:shadow-lg disabled:opacity-50 mt-2"
              >
                {isExporting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Github className="w-4 h-4" />}
                {isExporting ? "Pushing to GitHub..." : "Create & Push Repository"}
              </button>
            </div>
          </div>
        </div>
      )}

      {isSettingsOpen && (
        <div className="absolute inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-md p-4 animate-in fade-in duration-300">
          <div className="bg-gray-900 border border-gray-800 p-6 rounded-2xl w-full max-w-md shadow-[0_20px_60px_-15px_rgba(0,0,0,0.5)] relative animate-in slide-in-from-top-8 zoom-in-95 duration-300 ease-out">
            <button onClick={() => setIsSettingsOpen(false)} className="absolute top-4 right-4 text-gray-500 hover:text-white transition-colors">
              <X className="w-5 h-5" />
            </button>
            <div className="flex items-center gap-3 mb-2">
              <div className="p-2 bg-blue-500/10 rounded-lg"><Settings className="w-5 h-5 text-blue-500" /></div>
              <h2 className="text-xl font-bold text-white">API Settings</h2>
            </div>
            <p className="text-sm text-gray-400 mb-6">Enter your own Gemini API key to bypass limits.</p>
            <div className="space-y-4">
              <input type="password" value={customApiKey} onChange={(e) => saveApiKey(e.target.value)} placeholder="AIzaSy..." className="w-full bg-gray-950 border border-gray-800 rounded-xl px-4 py-3 text-sm text-white focus:ring-2 focus:ring-blue-500 transition-all outline-none" />
              <button onClick={() => setIsSettingsOpen(false)} className="w-full bg-white text-black font-semibold py-3 rounded-xl hover:bg-gray-200 transition-all active:scale-[0.98] hover:shadow-lg">Save & Close</button>
            </div>
          </div>
        </div>
      )}

      {isUploadModalOpen && (
        <div className="absolute inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-md p-4 animate-in fade-in duration-300">
          <div className="bg-gray-900 border border-gray-800 p-6 rounded-2xl w-full max-w-md shadow-[0_20px_60px_-15px_rgba(0,0,0,0.5)] relative animate-in slide-in-from-top-8 zoom-in-95 duration-300 ease-out">
            <button onClick={() => setIsUploadModalOpen(false)} className="absolute top-4 right-4 text-gray-500 hover:text-white transition-colors">
              <X className="w-5 h-5" />
            </button>
            
            <div className="flex items-center gap-3 mb-3">
              <div className="p-2 bg-indigo-500/10 rounded-lg border border-indigo-500/20">
                <FileArchive className="w-5 h-5 text-indigo-400" />
              </div>
              <h2 className="text-xl font-bold text-white tracking-tight">Import Project</h2>
            </div>
            
            <div className="bg-gray-950 border border-gray-800 rounded-xl p-4 mb-6">
              <p className="text-sm text-gray-300 leading-relaxed mb-3">
                To ensure the preview environment boots correctly, please make sure your ZIP file contains a valid Node.js framework.
              </p>
              <div className="flex flex-col gap-2 text-xs text-gray-400">
                <div className="flex items-center gap-2"><Check className="w-3.5 h-3.5 text-green-500"/> <span className="font-medium text-gray-200">Recommended Frameworks:</span> Next.js, React (Vite), Vue, or Angular.</div>
                <div className="flex items-center gap-2"><Check className="w-3.5 h-3.5 text-green-500"/> Must contain a valid <code className="bg-gray-800 px-1 py-0.5 rounded text-gray-300">package.json</code> file.</div>
              </div>
            </div>

            <div className="space-y-3">
              <button 
                onClick={() => {
                  setIsUploadModalOpen(false);
                  fileInputRef.current?.click();
                }} 
                className="w-full bg-indigo-600 hover:bg-indigo-500 text-white font-semibold py-3 rounded-xl flex items-center justify-center gap-2 transition-all shadow-md hover:shadow-indigo-500/20 active:scale-[0.98]"
              >
                <Upload className="w-4 h-4" /> Choose from files (.zip)
              </button>
              <input type="file" ref={fileInputRef} onChange={handleZipUpload} accept=".zip" className="hidden" />
            </div>
          </div>
        </div>
      )}

      {overwriteWarningOpen && (
        <div className="absolute inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-md p-4 animate-in fade-in duration-300">
          <div className="bg-gray-900 border border-yellow-500/30 p-6 rounded-2xl w-full max-w-md shadow-[0_20px_60px_-15px_rgba(234,179,8,0.2)] relative animate-in slide-in-from-top-8 zoom-in-95 duration-300 ease-out">
            <button onClick={() => setOverwriteWarningOpen(false)} className="absolute top-4 right-4 text-gray-500 hover:text-white transition-colors">
              <X className="w-5 h-5" />
            </button>
            
            <div className="flex items-center gap-3 mb-3">
              <div className="p-2 bg-yellow-500/10 rounded-lg border border-yellow-500/20">
                <AlertTriangle className="w-5 h-5 text-yellow-500" />
              </div>
              <h2 className="text-xl font-bold text-white tracking-tight">Overwrite Warning</h2>
            </div>
            
            <div className="bg-gray-950 border border-gray-800 rounded-xl p-4 mb-6">
              <p className="text-sm text-gray-300 leading-relaxed">
                It looks like you want to build a completely new application. Continuing will <span className="text-red-400 font-semibold">overwrite</span> your current project code.
              </p>
              <p className="text-sm text-gray-400 mt-3">
                How would you like to proceed?
              </p>
            </div>

            <div className="space-y-3">
              <button 
                onClick={() => handleGenerate({ skipWarning: true, forceCreate: true })} 
                className="w-full bg-blue-600 hover:bg-blue-500 text-white font-semibold py-3 rounded-xl flex items-center justify-center gap-2 transition-all shadow-md hover:shadow-blue-500/20 active:scale-[0.98]"
              >
                <Plus className="w-4 h-4" /> Start Fresh Project (Recommended)
              </button>
              <button 
                onClick={() => handleGenerate({ skipWarning: true, forceCreate: false })} 
                className="w-full bg-gray-800 hover:bg-gray-700 text-gray-300 hover:text-white font-semibold py-3 rounded-xl flex items-center justify-center gap-2 transition-all active:scale-[0.98] border border-gray-700"
              >
                <RefreshCw className="w-4 h-4" /> Overwrite Current Code
              </button>
            </div>
          </div>
        </div>
      )}

      {!isFullscreen && (
        <div className="w-full lg:w-[420px] h-[50vh] lg:h-full flex flex-col border-b lg:border-b-0 lg:border-r border-gray-800/60 shrink-0 relative bg-[#0B0D11] transition-all duration-300 ease-in-out shadow-2xl z-20">
          
          <div className="flex items-center justify-between px-6 py-4 border-b border-gray-800/60 sticky top-0 bg-[#0B0D11]/90 backdrop-blur z-10 shrink-0">
            {activeTab === 'workspace' ? (
              <div className="flex items-center gap-3 animate-in fade-in slide-in-from-left-4 duration-300">
                <div className="w-11 h-11 shrink-0 flex items-center justify-center">
                  <img src="/logo.jpg?v=hq" alt="Spark AI" className="w-full h-full object-cover mix-blend-screen" />
                </div>
                <h1 className="text-lg font-extrabold tracking-tight">Spark AI</h1>
              </div>
            ) : (
              <div className="flex items-center gap-2 animate-in fade-in slide-in-from-right-4 duration-300">
                <button onClick={() => setActiveTab('workspace')} className="p-1.5 text-gray-400 hover:text-white hover:bg-gray-800 rounded-lg transition-all active:scale-95">
                  <ChevronLeft className="w-5 h-5" />
                </button>
                <h1 className="text-lg font-bold tracking-tight">
                  {activeTab === 'trash' ? 'Trash Bin' : activeTab === 'shared' ? 'Shared with me' : 'Project History'}
                </h1>
              </div>
            )}
            
            <div className="flex items-center gap-1">
              {activeTab !== 'history' && (
                <button onClick={() => setActiveTab('history')} className="p-2 text-gray-400 hover:text-white hover:bg-gray-800 rounded-lg transition-all hover:scale-105 active:scale-95" title="History">
                  <History className="w-5 h-5" />
                </button>
              )}
              {activeTab !== 'shared' && userId && (
                <button onClick={() => setActiveTab('shared')} className="p-2 text-gray-400 hover:text-white hover:bg-gray-800 rounded-lg transition-all hover:scale-105 active:scale-95" title="Shared with me">
                  <Inbox className="w-5 h-5" />
                </button>
              )}
              {activeTab !== 'trash' && (
                <button onClick={() => setActiveTab('trash')} className="p-2 text-gray-400 hover:text-white hover:bg-gray-800 rounded-lg transition-all hover:scale-105 active:scale-95" title="Trash">
                  <Trash2 className="w-5 h-5" />
                </button>
              )}
              
              <button onClick={() => setIsSettingsOpen(true)} className="p-2 text-gray-400 hover:text-white hover:bg-gray-800 rounded-lg transition-all hover:scale-105 active:scale-95" title="Settings">
                <Settings className="w-5 h-5" />
              </button>
              {userId && (
                <div className="ml-2 pl-2 border-l border-gray-800 flex items-center">
                  <UserButton />
                </div>
              )}
            </div>
          </div>

          {(activeTab === 'history' || activeTab === 'trash' || activeTab === 'shared') ? (
            <div className="p-4 space-y-2 overflow-y-auto flex-1 custom-scrollbar">
              
              {activeTab === 'history' && (
                isSelectionMode ? (
                  <div className="flex gap-2 mb-4 animate-in fade-in slide-in-from-top-2 duration-300">
                    <button
                      onClick={() => { setIsSelectionMode(false); setSelectedChatIds(new Set()); }}
                      className="flex-1 bg-gray-800 hover:bg-gray-700 text-gray-300 font-semibold py-3 rounded-xl transition-all"
                    >
                      Cancel
                    </button>
                    <button
                      onClick={batchMoveToTrash}
                      disabled={selectedChatIds.size === 0}
                      className="flex-1 bg-red-600/20 hover:bg-red-600/30 text-red-400 border border-red-500/30 disabled:opacity-50 disabled:active:scale-100 active:scale-[0.98] font-semibold py-3 rounded-xl transition-all flex items-center justify-center gap-2"
                    >
                      <Trash2 size={16} /> Trash ({selectedChatIds.size})
                    </button>
                  </div>
                ) : (
                  <button
                    onClick={handleDevelopNew}
                    className="w-full bg-gradient-to-r from-blue-600/10 to-blue-500/5 text-blue-400 hover:from-blue-600 hover:to-blue-500 hover:text-white border border-blue-900/50 hover:border-blue-500 font-semibold py-3 rounded-xl flex items-center justify-center gap-2 transition-all duration-300 mb-4 hover:shadow-[0_0_20px_rgba(37,99,235,0.2)] active:scale-[0.98]"
                  >
                    <Plus size={16} /> Develop New Project
                  </button>
                )
              )}

              {activeTab === 'trash' && renderedList.length > 0 && (
                <button
                  onClick={emptyTrash}
                  className="w-full bg-gradient-to-r from-red-600/10 to-red-500/5 text-red-400 hover:from-red-600 hover:to-red-500 hover:text-white border border-red-900/50 hover:border-red-500 font-semibold py-3 rounded-xl flex items-center justify-center gap-2 transition-all duration-300 mb-4 hover:shadow-[0_0_20px_rgba(239,68,68,0.2)] active:scale-[0.98]"
                >
                  <Trash2 size={16} /> Empty Trash
                </button>
              )}

              {renderedList.length === 0 ? (
                <div className="text-center p-8 text-gray-500 text-sm animate-in fade-in duration-500">
                  {activeTab === 'trash' ? 'Trash is empty.' : activeTab === 'shared' ? 'No projects shared with you yet.' : 'No active projects found.'}
                </div>
              ) : (
                renderedList.map((chat, index) => (
                  <div 
                    key={chat.id} 
                    onClick={() => {
                      if (isSelectionMode) {
                        const newSet = new Set(selectedChatIds);
                        if (newSet.has(chat.id)) newSet.delete(chat.id);
                        else newSet.add(chat.id);
                        setSelectedChatIds(newSet);
                      } else if (activeTab !== 'trash') {
                        loadChat(chat);
                      }
                    }} 
                    className={`group relative flex items-center justify-between p-3.5 rounded-xl transition-all duration-300 ${activeTab !== 'trash' ? 'cursor-pointer' : ''} animate-in slide-in-from-left-4 fade-in fill-mode-backwards ${currentChatId === chat.id && !isSelectionMode ? 'bg-blue-900/10 border-l-4 border-y border-r border-blue-500 shadow-[inset_0_0_20px_rgba(59,130,246,0.05)]' : 'bg-[#13151A] border-l-4 border-l-transparent border-y border-r border-gray-800/80 hover:bg-gray-800/50 hover:border-gray-700/80'} ${isSelectionMode && selectedChatIds.has(chat.id) ? 'bg-blue-900/10 border-blue-500/50' : ''}`}
                    style={{ animationDelay: `${index * 50}ms` }}
                  >
                    
                    <div className="flex items-center gap-3 overflow-hidden flex-1 pl-1">
                      {isSelectionMode ? (
                        <div className={`w-4 h-4 shrink-0 rounded-[4px] border flex items-center justify-center transition-colors ${selectedChatIds.has(chat.id) ? 'bg-blue-500 border-blue-500' : 'border-gray-600 bg-gray-900 group-hover:border-gray-500'}`}>
                          {selectedChatIds.has(chat.id) && <Check size={12} className="text-white" strokeWidth={3} />}
                        </div>
                      ) : chat.isPinned && activeTab !== 'trash' ? (
                        <Pin className="w-4 h-4 text-yellow-500 shrink-0 fill-yellow-500/20" /> 
                      ) : (
                        <Box className={`w-4 h-4 shrink-0 transition-colors ${currentChatId === chat.id ? 'text-blue-400' : 'text-gray-500 group-hover:text-blue-400/70'}`} />
                      )}
                      
                      {editingChatId === chat.id && activeTab !== 'trash' && !isSelectionMode ? (
                        <div className="flex items-center gap-2 w-full pr-2">
                          <input 
                            autoFocus
                            value={editTitle}
                            onChange={(e) => setEditTitle(e.target.value)}
                            onClick={(e) => e.stopPropagation()}
                            onKeyDown={(e) => e.key === 'Enter' && saveRename(chat.id, e)}
                            className="bg-gray-950 border border-gray-700 text-sm text-white px-2 py-1 rounded w-full focus:outline-none focus:border-blue-500 transition-colors"
                          />
                          <button onClick={(e) => saveRename(chat.id, e)} className="text-green-400 hover:text-green-300 transition-colors"><Check size={16}/></button>
                        </div>
                      ) : (
                        <div className="truncate">
                          <h3 className={`text-sm font-semibold truncate transition-colors ${currentChatId === chat.id ? 'text-white' : 'text-gray-300 group-hover:text-white'}`}>{chat.title}</h3>
                          <p className="text-xs text-gray-500 mt-0.5 capitalize flex items-center gap-1.5">
                            {chat.framework.replace('-', ' ')} 
                            <span className="w-1 h-1 rounded-full bg-gray-600 inline-block"></span>
                            {new Date(chat.timestamp).toLocaleDateString()}
                          </p>
                        </div>
                      )}
                    </div>

                    {!editingChatId && activeTab !== 'shared' && (
                      <div className="relative">
                        <button 
                          onClick={(e) => { e.stopPropagation(); setMenuOpenId(menuOpenId === chat.id ? null : chat.id); }}
                          className={`p-1.5 text-gray-500 hover:text-white hover:bg-gray-700 rounded-md transition-all duration-200 ${menuOpenId === chat.id ? 'opacity-100 bg-gray-800 text-white' : 'opacity-0 group-hover:opacity-100'}`}
                        >
                          <MoreVertical className="w-4 h-4" />
                        </button>

                        {menuOpenId === chat.id && (
                          <>
                            <div className="fixed inset-0 z-40 cursor-default" onClick={(e) => { e.stopPropagation(); setMenuOpenId(null); }} />
                            <div className="absolute right-0 top-8 w-36 bg-gray-800 border border-gray-700 rounded-xl shadow-2xl z-50 py-1 overflow-hidden animate-in fade-in slide-in-from-top-2 duration-200">
                              {activeTab === 'trash' ? (
                                <>
                                  <button onClick={(e) => restoreChat(chat.id, e)} className="flex items-center gap-2 w-full px-4 py-2.5 text-xs font-medium text-gray-300 hover:bg-gray-700 hover:text-blue-400 transition-colors">
                                    <RotateCcw size={14}/> Restore
                                  </button>
                                  <div className="h-px bg-gray-700 my-1 w-full"></div>
                                  <button onClick={(e) => permanentDeleteChat(chat.id, e)} className="flex items-center gap-2 w-full px-4 py-2.5 text-xs font-medium text-red-400 hover:bg-gray-700 hover:text-red-300 transition-colors">
                                    <Trash2 size={14}/> Delete Forever
                                  </button>
                                </>
                              ) : (
                                <>
                                  <button onClick={(e) => startRename(chat, e)} className="flex items-center gap-2 w-full px-4 py-2.5 text-xs font-medium text-gray-300 hover:bg-gray-700 hover:text-white transition-colors">
                                    <Edit2 size={14}/> Rename
                                  </button>
                                  <button onClick={(e) => togglePin(chat.id, e)} className="flex items-center gap-2 w-full px-4 py-2.5 text-xs font-medium text-gray-300 hover:bg-gray-700 hover:text-white transition-colors">
                                    <Pin size={14}/> {chat.isPinned ? "Unpin Project" : "Pin Project"}
                                  </button>
                                  <button onClick={(e) => { e.stopPropagation(); setIsSelectionMode(true); setSelectedChatIds(new Set([chat.id])); setMenuOpenId(null); }} className="flex items-center gap-2 w-full px-4 py-2.5 text-xs font-medium text-gray-300 hover:bg-gray-700 hover:text-white transition-colors">
                                    <Check size={14}/> Select Multiple
                                  </button>
                                  <div className="h-px bg-gray-700/50 my-1 w-full"></div>
                                  <button onClick={(e) => softDeleteChat(chat.id, e)} className="flex items-center gap-2 w-full px-4 py-2.5 text-xs font-medium text-red-400 hover:bg-gray-700 hover:text-red-300 transition-colors">
                                    <Trash2 size={14}/> Move to Trash
                                  </button>
                                </>
                              )}
                            </div>
                          </>
                        )}
                      </div>
                    )}
                  </div>
                ))
              )}
            </div>
          ) : (
            <div className="flex-1 flex flex-col h-full overflow-hidden relative">
              
              <div className="flex-1 overflow-y-auto p-4 space-y-6 custom-scrollbar scroll-smooth">
                {messages.length === 0 ? (
                   <div className="h-full flex flex-col items-center justify-center text-center animate-in fade-in zoom-in-95 duration-700 w-full px-4">
                      <div className="w-14 h-14 rounded-full bg-gradient-to-br from-blue-500/20 to-purple-500/20 border border-blue-500/20 flex items-center justify-center shadow-[0_0_30px_rgba(59,130,246,0.15)] mb-4">
                        <Bot size={28} className="text-blue-400" />
                      </div>
                      <h2 className="text-[22px] font-bold text-white mb-1.5 tracking-tight">What would you like to build?</h2>
                      <p className="text-sm text-gray-400 leading-relaxed">
                Describe your vision, upload a design mockup, or choose a template to start generating your application.
              </p>
                   </div>
                ) : (
                   messages.map((msg, i) => (
                     <div key={msg.id || i} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'} animate-in slide-in-from-bottom-4 fade-in duration-300`}>
                       
                       {msg.role === 'assistant' && (
                          <div className="w-8 h-8 rounded-full bg-gradient-to-br from-blue-600/30 to-purple-600/30 flex items-center justify-center border border-blue-500/30 shrink-0 mr-3 mt-1 shadow-sm">
                              <Bot size={16} className="text-blue-400" />
                          </div>
                       )}

                       {editingMsgIndex === i && msg.role === 'user' ? (
                         <div className="w-[85%] flex flex-col gap-2 items-end animate-in fade-in zoom-in-95 duration-200">
                           <textarea
                             autoFocus
                             value={editMsgContent}
                             onChange={(e) => setEditMsgContent(e.target.value)}
                             className="w-full bg-gray-900 border border-blue-500/50 rounded-2xl p-4 text-sm text-white focus:ring-2 focus:ring-blue-500/50 outline-none resize-y min-h-[100px] shadow-lg transition-all"
                           />
                           <div className="flex gap-2 mt-1">
                             <button onClick={() => setEditingMsgIndex(null)} className="px-4 py-1.5 text-xs font-semibold text-gray-400 hover:text-white hover:bg-gray-800 rounded-lg transition-colors active:scale-95">
                               Cancel
                             </button>
                             <button onClick={() => handleEditSubmit(i)} className="px-4 py-1.5 text-xs font-semibold bg-blue-600 text-white rounded-lg hover:bg-blue-500 shadow-md transition-all active:scale-95">
                               Save & Resubmit
                             </button>
                           </div>
                         </div>
                       ) : (
                         <div className={`relative group p-4 max-w-[85%] text-[14.5px] shadow-md leading-relaxed whitespace-pre-wrap flex flex-col gap-3 transition-transform duration-200 ${
                           msg.role === 'user' 
                           ? 'bg-gradient-to-br from-blue-600 to-blue-700 text-white rounded-[24px] rounded-tr-[4px] shadow-blue-900/20 border border-blue-500/20' 
                           : 'bg-[#13151A] text-gray-200 border border-gray-800/80 rounded-[24px] rounded-tl-[4px] shadow-black/50'
                         }`}>
                           {msg.role === 'user' && !loading && !isUpdating && !isStreaming && !isReadOnly && (
                             <button 
                               onClick={() => { setEditingMsgIndex(i); setEditMsgContent(msg.content); }} 
                               className="absolute -left-10 top-1 opacity-0 -translate-x-2 group-hover:translate-x-0 group-hover:opacity-100 p-2 text-gray-400 hover:text-white hover:bg-gray-800 rounded-xl transition-all duration-200"
                               title="Edit Message"
                             >
                                <Edit2 size={14} />
                             </button>
                           )}

                           {(msg.images && msg.images.length > 0) ? (
                              <div className="flex gap-2 flex-wrap justify-end mb-2">
                                {msg.images.map((img, imgIdx) => (
                                  <img key={imgIdx} src={img} alt="User attachment" className="max-w-[200px] rounded-xl border border-white/10 object-contain shadow-sm" />
                                ))}
                              </div>
                           ) : msg.image ? (
                              <img src={msg.image} alt="User attachment" className="max-w-[240px] rounded-xl border border-white/10 object-contain self-end shadow-sm mb-2" />
                           ) : null}

                           {msg.role === 'assistant' ? (
                             <>
                               {renderMessage(msg.content)}
                               {msg.fileSnapshot && Object.keys(msg.fileSnapshot).length > 0 && !isReadOnly && i < messages.length - 1 && (
                                 <div className="mt-4 pt-3 border-t border-gray-800/50 flex justify-end">
                                   <button 
                                     onClick={() => handleRewind(i)}
                                     className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold text-gray-400 bg-[#0a0a0a] hover:bg-blue-600 hover:text-white border border-gray-700 hover:border-blue-500 rounded-xl transition-all active:scale-95 shadow-sm group"
                                     title="Restore project to this exact state"
                                   >
                                     <History size={14} className="group-hover:-rotate-45 transition-transform duration-300" /> Rewind to Version
                                   </button>
                                 </div>
                               )}
                             </>
                           ) : msg.content}
                         </div>
                       )}

                     </div>
                   ))
                )}

                {((loading || isUpdating || isGeneratingRemote || isArchitectingRemote || isRefactoringRemote) && !isStreaming) && (
                  <div className="flex justify-start animate-in fade-in slide-in-from-bottom-2 duration-300">
                    <div className="w-8 h-8 rounded-full bg-gradient-to-br from-blue-600/30 to-purple-600/30 flex items-center justify-center border border-blue-500/30 shrink-0 mr-3 mt-1 shadow-sm">
                       <Bot size={16} className="text-blue-400" />
                    </div>
                    <div className="p-4 px-5 bg-[#13151A] border border-gray-800/80 rounded-[24px] rounded-tl-[4px] flex items-center gap-2 text-gray-400 text-sm shadow-sm relative overflow-hidden">
                       <div className="w-1.5 h-1.5 bg-blue-500 rounded-full animate-[bounce_1.4s_infinite_ease-in-out_both] shadow-[0_0_8px_rgba(59,130,246,0.8)]" style={{ animationDelay: '-0.32s' }}></div>
                       <div className="w-1.5 h-1.5 bg-blue-500 rounded-full animate-[bounce_1.4s_infinite_ease-in-out_both] shadow-[0_0_8px_rgba(59,130,246,0.8)]" style={{ animationDelay: '-0.16s' }}></div>
                       <div className="w-1.5 h-1.5 bg-blue-500 rounded-full animate-[bounce_1.4s_infinite_ease-in-out_both] shadow-[0_0_8px_rgba(59,130,246,0.8)]"></div>
                    </div>
                  </div>
                )}
                <div ref={chatEndRef} className="h-2" />
              </div>

              <div className="p-4 bg-gradient-to-t from-[#0B0D11] via-[#0B0D11] to-transparent pt-8 pb-6 z-10 w-full flex-shrink-0">
                {error && <div className="mb-3 p-3 bg-red-500/10 border border-red-500/20 rounded-xl text-red-400 text-xs flex items-center gap-2 shadow-lg animate-in slide-in-from-bottom-2"><AlertTriangle size={14} className="shrink-0"/> {error}</div>}
                
                <div className="relative w-full">

                  {detectedError && (
                    <div className="absolute bottom-[calc(100%+12px)] left-0 right-0 z-50 flex justify-center animate-in slide-in-from-bottom-2 fade-in duration-300">
                      <div className="bg-red-500/10 border border-red-500/30 shadow-[0_0_20px_rgba(239,68,68,0.2)] backdrop-blur-xl p-3 rounded-2xl flex flex-col gap-3 w-[92%]">
                        
                        {/* Top Row: Icon, Error Text, Close Button */}
                        <div className="flex items-start justify-between gap-2">
                          <div className="flex items-center gap-2 overflow-hidden">
                            <div className="p-1.5 bg-red-500/20 rounded-lg shrink-0">
                              <AlertTriangle className="w-4 h-4 text-red-400" />
                            </div>
                            <div className="flex flex-col truncate">
                              <span className="text-sm text-red-200 font-medium truncate" title={detectedError}>{detectedError}</span>
                              <span className="text-[10px] text-red-300/70 font-semibold uppercase tracking-wider mt-0.5">Terminal Build Error</span>
                            </div>
                          </div>
                          <button onClick={() => setDetectedError(null)} className="p-1.5 hover:bg-red-500/20 rounded-lg text-red-400 transition-colors shrink-0">
                            <X size={14} />
                          </button>
                        </div>

                        {/* Bottom Row: Full Width Buttons */}
                        <div className="flex items-center gap-2 w-full">
                          <button 
                            onClick={() => {
                              setDetectedError(null);
                              handleRebootSandbox();
                            }}
                            className="flex-1 text-xs font-bold bg-gray-800 hover:bg-gray-700 border border-gray-600 text-white py-2.5 rounded-xl transition-all shadow-md active:scale-95 flex items-center justify-center gap-1.5"
                          >
                            <RefreshCw size={14} /> Restart
                          </button>

                          <button 
                            onClick={() => {
                              const errorText = detectedError;
                              setDetectedError(null);
                              setInputPrompt("");
                              
                              const cleansedHistory = [...messages]; 
                              if (cleansedHistory.length > 0 && cleansedHistory[cleansedHistory.length - 1].role === "assistant") {
                                cleansedHistory.pop(); 
                              }

                              const aggressivePrompt = `FATAL ERROR:\n\n${errorText}\n\nSYSTEM OVERRIDE: Your previous attempt failed. DO NOT repeat the exact code.\n\nCRITICAL INSTRUCTION: If this is a Syntax Error or "Module not found", DO NOT use <UPDATE> patches. Your previous file is corrupted. You MUST completely rewrite the broken file using <FILE_START path="/path">...</FILE_END> to guarantee a clean slate. Ensure all imports are present.`;

                              handleGenerate({ 
                                overridePrompt: aggressivePrompt, 
                                overrideMessages: cleansedHistory, 
                                skipWarning: true 
                              });
                            }}
                            className="flex-[2] text-xs font-bold bg-red-600 hover:bg-red-500 text-white py-2.5 rounded-xl transition-all shadow-[0_0_15px_rgba(239,68,68,0.3)] active:scale-95 flex items-center justify-center gap-1.5"
                          >
                            <Wand2 size={14} /> Auto-Fix Issue
                          </button>
                        </div>

                      </div>
                    </div>
                  )}
                  
                  {mentionOpen && filteredFiles.length > 0 && (
                    <div className="absolute bottom-full mb-3 left-4 w-[85%] max-h-56 overflow-y-auto bg-[#1A1D24] border border-gray-700 rounded-xl shadow-2xl z-[100] flex flex-col py-1.5 custom-scrollbar animate-in slide-in-from-bottom-2 fade-in duration-200">
                      {filteredFiles.map((file, idx) => (
                        <button
                          key={file}
                          onClick={(e) => { e.preventDefault(); insertMention(file); }}
                          className={`text-left px-4 py-2.5 text-[13px] font-mono truncate flex items-center gap-3 transition-colors ${idx === mentionIndex ? 'bg-blue-600/20 text-blue-400' : 'text-gray-300 hover:bg-gray-800/50 hover:text-white'}`}
                        >
                          <FileCode2 size={14} className={idx === mentionIndex ? 'text-blue-400' : 'text-gray-500'} />
                          {file}
                        </button>
                      ))}
                    </div>
                  )}

                  {attachmentMenuOpen && (
                    <>
                      <div className="fixed inset-0 z-40 cursor-default" onClick={(e) => { e.stopPropagation(); setAttachmentMenuOpen(false); }} />
                      <div className="absolute bottom-full mb-3 right-4 w-48 bg-[#1A1D24] border border-gray-700 rounded-xl shadow-2xl z-[100] py-1.5 flex flex-col animate-in fade-in zoom-in-95 slide-in-from-bottom-2 duration-200">
                        <button 
                          onClick={() => { imageAttachRef.current?.click(); setAttachmentMenuOpen(false); }} 
                          className="flex items-center gap-3 w-full px-4 py-2.5 text-sm font-medium text-gray-300 hover:bg-gray-800 hover:text-white transition-colors"
                        >
                          <ImageIcon size={16} className="text-blue-400"/> Upload Images
                        </button>
                        <div className="h-[1px] bg-gray-800 my-1 w-full"></div>
                        <button 
                          onClick={() => { setIsUploadModalOpen(true); setAttachmentMenuOpen(false); }} 
                          className="flex items-center gap-3 w-full px-4 py-2.5 text-sm font-medium text-gray-300 hover:bg-gray-800 hover:text-white transition-colors"
                        >
                          <FileArchive size={16} className="text-indigo-400"/> Import (.zip)
                        </button>
                      </div>
                    </>
                  )}

                  {attachedImages.length > 0 && (
                    <div className="flex gap-3 flex-wrap mb-3 px-2 animate-in slide-in-from-bottom-2 fade-in">
                      {attachedImages.map((img, idx) => (
                        <div key={idx} className="relative inline-block group">
                          <img src={img} alt="Attachment preview" className="h-20 w-auto rounded-xl border border-gray-700 object-cover shadow-[0_8px_30px_rgba(0,0,0,0.4)] transition-transform group-hover:scale-[1.02]" />
                          <button onClick={() => setAttachedImages(prev => prev.filter((_, i) => i !== idx))} className="absolute -top-2.5 -right-2.5 bg-gray-800 hover:bg-gray-700 rounded-full p-1.5 text-gray-400 hover:text-white border border-gray-600 transition-all shadow-xl hover:scale-110 active:scale-95">
                            <X size={12} strokeWidth={3} />
                          </button>
                        </div>
                      ))}
                    </div>
                  )}

                  {isReadOnly ? (
                    <div className="flex items-center justify-center p-5 bg-[#13151A] border border-gray-800/80 rounded-[20px] text-gray-500 shadow-inner">
                      <ShieldAlert className="w-5 h-5 mr-3 text-gray-600" />
                      <span className="text-sm font-medium tracking-wide">You have Viewer access. Editing is disabled.</span>
                    </div>
                  ) : (
                    <div className="relative bg-[#13151A] border border-gray-800/80 rounded-[20px] flex flex-col focus-within:border-blue-500/50 focus-within:shadow-[0_0_20px_rgba(59,130,246,0.15)] transition-all duration-300 shadow-[0_8px_30px_rgba(0,0,0,0.4)]">
                      
                      <div className="absolute top-0 left-0 w-full h-[1px] bg-gradient-to-r from-transparent via-gray-700/50 to-transparent"></div>

                      <textarea 
                        ref={textareaRef}
                        value={inputPrompt} 
                        onChange={handlePromptChange} 
                        onKeyDown={handleKeyDown}
                        onPaste={handlePaste}
                        placeholder={files ? "Type @ to select files, or paste an image..." : "Describe your app or paste an image (Ctrl+V)..."}
                        className="w-full bg-transparent pl-5 pr-5 pt-4 pb-2 text-[14px] text-white focus:outline-none resize-none min-h-[72px] max-h-[250px] custom-scrollbar placeholder:text-gray-500" 
                      />
                      
                      <div className="flex justify-between items-center px-3 pb-3 pt-1 flex-wrap gap-2">
                        
                        <div className="flex items-center gap-1.5">
                           <button 
                             onClick={toggleListening} 
                             className={`p-2 rounded-xl transition-all duration-200 hover:scale-105 active:scale-95 ${isListening ? 'bg-red-500/20 text-red-400 animate-pulse shadow-[0_0_15px_rgba(239,68,68,0.2)]' : 'text-gray-400 hover:bg-gray-800 hover:text-white'}`}
                             title="Voice Typing"
                           >
                             <Mic className="w-[18px] h-[18px]" />
                           </button>

                           <input type="file" ref={imageAttachRef} onChange={handleImageAttach} accept="image/*" multiple className="hidden" />

                           {!files && (
                             <button 
                               onClick={handleEnhance} 
                               disabled={isEnhancing || !inputPrompt.trim() || loading || isUpdating || isStreaming} 
                               className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-gray-400 hover:text-purple-400 disabled:opacity-50 transition-all duration-200 rounded-lg hover:bg-gray-800/80 hover:scale-105 active:scale-95"
                               title="Enhance Prompt"
                             >
                               {isEnhancing ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Wand2 className="w-3.5 h-3.5" />}
                               <span className="hidden sm:inline tracking-wide">Enhance</span>
                             </button>
                           )}
                        </div>

                        <div className="flex items-center gap-1.5 shrink-0">
                          {!files && (
                            <div className="relative group z-50">
                              <button 
                                onClick={() => setFrameworkMenuOpen(!frameworkMenuOpen)}
                                className="flex items-center gap-2 bg-gray-900 text-gray-300 text-xs font-semibold rounded-xl pl-3 pr-3 py-2 border border-gray-700 cursor-pointer focus:outline-none hover:bg-gray-800 hover:text-white transition-colors hover:border-gray-600 shadow-sm hover:scale-[1.02]"
                              >
                                {framework === 'nextjs' ? 'Next.js' : framework === 'react-vite' ? 'React (Vite)' : framework === 'vue-vite' ? 'Vue' : framework === 'angular' ? 'Angular' : 'Vanilla'}
                                <ChevronDown className={`w-3.5 h-3.5 text-gray-400 group-hover:text-white transition-transform duration-200 ${frameworkMenuOpen ? 'rotate-180' : ''}`} />
                              </button>

                              {frameworkMenuOpen && (
                                <>
                                  {/* Invisible backdrop to close menu when clicking outside */}
                                  <div className="fixed inset-0 z-40 cursor-default" onClick={() => setFrameworkMenuOpen(false)}></div>
                                  
                                  {/* The Custom Menu */}
                                  <div className="absolute bottom-full mb-2 left-0 w-36 bg-[#1A1D24] border border-gray-700 rounded-xl shadow-2xl z-50 py-1.5 flex flex-col overflow-hidden animate-in fade-in slide-in-from-bottom-1 duration-200">
                                    {[
                                      { id: 'nextjs', label: 'Next.js' },
                                      { id: 'react-vite', label: 'React (Vite)' },
                                      { id: 'vue-vite', label: 'Vue' },
                                      { id: 'angular', label: 'Angular' },
                                      { id: 'vanilla-vite', label: 'Vanilla' }
                                    ].map((fw) => (
                                      <button
                                        key={fw.id}
                                        onClick={() => {
                                          setFramework(fw.id);
                                          setFrameworkMenuOpen(false);
                                        }}
                                        className={`text-left px-4 py-2 text-xs font-semibold transition-colors ${framework === fw.id ? 'bg-blue-600/20 text-blue-400' : 'text-gray-300 hover:bg-gray-800 hover:text-white'}`}
                                      >
                                        {fw.label}
                                      </button>
                                    ))}
                                  </div>
                                </>
                              )}
                            </div>
                          )}

                          <div className="relative z-40">
                            <button 
                              onClick={() => setAttachmentMenuOpen(!attachmentMenuOpen)} 
                              disabled={loading || isUpdating || isStreaming}
                              className={`p-2 rounded-xl transition-all duration-200 hover:scale-105 active:scale-95 disabled:opacity-50 disabled:hover:scale-100 ${attachmentMenuOpen ? 'bg-gray-700 text-white shadow-inner' : 'bg-gray-800 hover:bg-gray-700 text-gray-300 hover:text-white'}`}
                              title="Add Attachment"
                            >
                              <Plus className={`w-[18px] h-[18px] transition-transform duration-300 ${attachmentMenuOpen ? 'rotate-45' : ''}`} />
                            </button>
                          </div>

                          {(loading || isUpdating || isStreaming) ? (
                            <button 
                              onClick={handleStopGeneration}
                              className="p-2 bg-red-500 hover:bg-red-400 text-white rounded-xl transition-all duration-200 shadow-[0_0_15px_rgba(239,68,68,0.3)] hover:shadow-[0_0_25px_rgba(239,68,68,0.5)] hover:scale-105 active:scale-95 shrink-0"
                              title="Stop Generating"
                            >
                              <Square className="w-5 h-5 fill-current" />
                            </button>
                          ) : (
                            <button 
                              onClick={() => handleGenerate()}
                              disabled={!inputPrompt.trim() && attachedImages.length === 0}
                              className="p-2 bg-blue-600 hover:bg-blue-500 text-white rounded-xl transition-all duration-200 hover:scale-105 active:scale-95 disabled:opacity-50 disabled:hover:scale-100 disabled:bg-gray-800 disabled:text-gray-500 shadow-lg hover:shadow-[0_0_20px_rgba(37,99,235,0.4)] shrink-0"
                            >
                              <Send className="w-5 h-5 ml-0.5" />
                            </button>
                          )}
                        </div>
                      </div>
                    </div>
                  )}

                </div>

                {!isReadOnly && (
                  <div className="text-center mt-2.5 pb-1">
                     <span className="text-[11px] text-gray-500 font-medium tracking-wide">Press Enter to send, Shift + Enter for new line</span>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      )}

      <div className="flex-1 flex flex-col h-screen overflow-hidden bg-[#0A0C10] relative">
        
        {((loading && !files) || isArchitectingRemote) && (
          <div className="absolute inset-0 z-50 flex flex-col items-center justify-center bg-[#0A0C10]/80 backdrop-blur-xl animate-in fade-in duration-700">
            <div className="relative mb-10">
              <div className="absolute inset-0 rounded-full bg-blue-600/20 blur-[80px] animate-[pulse_3s_ease-in-out_infinite] scale-[2]"></div>
              <div className="absolute inset-0 rounded-full bg-cyan-400/20 blur-[40px] animate-[pulse_2s_ease-in-out_infinite] scale-[1.5]"></div>
              <div className="relative p-6 bg-[#13151A] border border-gray-800 rounded-full shadow-[0_0_50px_rgba(37,99,235,0.2)] animate-in zoom-in-50 duration-700">
                <Loader2 className="w-14 h-14 text-blue-500 animate-spin" />
              </div>
            </div>
            <h2 className="text-2xl font-extrabold text-white mb-2 tracking-tight animate-in slide-in-from-bottom-4 duration-500 delay-100 fill-mode-both">Architecting Project</h2>
            <p className="text-gray-400 text-sm mb-8 font-medium tracking-wide animate-in slide-in-from-bottom-4 duration-500 delay-200 fill-mode-both">Analyzing context and building neural vectors...</p>
            {abortController && (
               <button onClick={handleStopGeneration} className="px-6 py-2.5 bg-gray-900 border border-gray-800 text-gray-300 hover:bg-red-500/10 hover:border-red-500/30 hover:text-red-400 rounded-xl text-sm font-semibold transition-all duration-300 flex items-center gap-2 hover:scale-105 active:scale-95 animate-in fade-in duration-500 delay-300 fill-mode-both shadow-lg">
                 <Square size={14} className="fill-current"/> Cancel Build
               </button>
            )}
          </div>
        )}

        {(isUpdating || isRefactoringRemote) && (
          <div className="absolute inset-0 z-50 flex flex-col items-center justify-center bg-[#0A0C10]/80 backdrop-blur-xl animate-in fade-in duration-700">
            <div className="relative mb-10">
              <div className="absolute inset-0 rounded-full bg-purple-600/20 blur-[80px] animate-[pulse_3s_ease-in-out_infinite] scale-[2]"></div>
              <div className="absolute inset-0 rounded-full bg-blue-400/20 blur-[40px] animate-[pulse_2s_ease-in-out_infinite] scale-[1.5]"></div>
              <div className="relative p-6 bg-[#13151A] border border-gray-800 rounded-full shadow-[0_0_50px_rgba(168,85,247,0.2)] animate-in zoom-in-50 duration-700">
                <Loader2 className="w-14 h-14 text-purple-400 animate-spin" />
              </div>
            </div>
            <h2 className="text-2xl font-extrabold text-white mb-2 tracking-tight animate-in slide-in-from-bottom-4 duration-500 delay-100 fill-mode-both">Refactoring Codebase</h2>
            <p className="text-gray-400 text-sm mb-8 font-medium tracking-wide animate-in slide-in-from-bottom-4 duration-500 delay-200 fill-mode-both">Analyzing context and injecting updates...</p>
            {abortController && (
               <button onClick={handleStopGeneration} className="px-6 py-2.5 bg-gray-900 border border-gray-800 text-gray-300 hover:bg-red-500/10 hover:border-red-500/30 hover:text-red-400 rounded-xl text-sm font-semibold transition-all duration-300 flex items-center gap-2 hover:scale-105 active:scale-95 animate-in fade-in duration-500 delay-300 fill-mode-both shadow-lg">
                 <Square size={14} className="fill-current"/> Cancel Refactor
               </button>
            )}
          </div>
        )}

        {files && previewKey > 0 ? (
          <>
            <div className="flex items-center bg-[#0A0C10] border-b border-gray-800/80 px-4 py-2.5 shrink-0 justify-end z-10 shadow-sm animate-in fade-in duration-500">
              <div className="flex items-center gap-2">
                
                {isOwner && (
                  <button 
                    onClick={() => setIsShareModalOpen(true)} 
                    className="flex items-center gap-2 px-3 py-1.5 text-xs font-bold text-gray-400 hover:text-white hover:bg-gray-800 rounded-lg transition-all duration-200 hover:scale-105 active:scale-95"
                  >
                    <Share2 className="w-4 h-4" /> Share
                  </button>
                )}

                {!isReadOnly && (
                  <button 
                    onClick={() => setIsGithubModalOpen(true)} 
                    className="flex items-center gap-2 px-3 py-1.5 text-xs font-bold text-gray-400 hover:text-white hover:bg-gray-800 rounded-lg transition-all duration-200 hover:scale-105 active:scale-95"
                  >
                    <Github className="w-4 h-4" /> Export
                  </button>
                )}

                <div className="h-4 w-[1px] bg-gray-800 mx-1"></div>

                <button onClick={() => setIsFullscreen(!isFullscreen)} className="flex items-center gap-2 px-3 py-1.5 text-xs font-bold text-gray-400 hover:text-white hover:bg-gray-800 rounded-lg transition-all duration-200 hover:scale-105 active:scale-95">
                  {isFullscreen ? <Minimize className="w-4 h-4" /> : <Maximize className="w-4 h-4" />}
                </button>
                <button onClick={handleRebootSandbox} className="flex items-center gap-2 px-3 py-1.5 text-xs font-bold text-gray-400 hover:text-white hover:bg-gray-800 rounded-lg transition-all duration-200 hover:scale-105 active:scale-95">
                  <RefreshCw className="w-4 h-4" /> Restart
                </button>
              </div>
            </div>

            <div className="flex-1 w-full h-full flex overflow-hidden relative animate-in fade-in duration-700">
              <div className="w-full h-full bg-[#1e1e1e]" key={previewKey}>
                <div id={`stackblitz-${previewKey}`} className="w-full h-full" />
              </div>
            </div>
          </>
        ) : (!loading && !files && !isArchitectingRemote && !isRefactoringRemote) && (
          <div className="h-full flex flex-col items-center justify-center gap-6 animate-in fade-in zoom-in-95 duration-700 select-none relative w-full">
            
            {/* Deep Background Ambient Glow */}
            <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
               <div className="w-[600px] h-[600px] bg-blue-600/5 rounded-full blur-[120px]"></div>
            </div>

            {/* Logo */}
            <div className="relative flex justify-center items-center z-10">
              <div className="w-44 h-44 relative flex items-center justify-center">
                <img src="/logo.jpg?v=hq" alt="Spark AI" className="w-full h-full object-cover mix-blend-screen drop-shadow-[0_0_30px_rgba(59,130,246,0.2)]" />
              </div>
            </div>

            {/* Typography */}
            <div className="text-center space-y-3 relative z-10 max-w-md px-4 mt-2">
              <h2 className="text-3xl font-extrabold text-transparent bg-clip-text bg-gradient-to-b from-white to-gray-400 tracking-tight">
                Build the Future
              </h2>
            </div>

            {/* Quick-Start Action Pills */}
            <div className="flex flex-wrap justify-center gap-3 mt-4 relative z-10 max-w-2xl px-4">
              {[
                { icon: '⚡', text: 'Build a SaaS Landing Page' },
                { icon: '📦', text: 'Create a React Dashboard' },
                { icon: '🎨', text: 'Design a Glassmorphism UI' },
                { icon: '🚀', text: 'Develop a Next.js Blog' }
              ].map((item, i) => (
                 <button 
                   key={i} 
                   onClick={() => {
                     setInputPrompt(""); 
                     handleGenerate({ overridePrompt: item.text, forceCreate: true, skipWarning: true });
                   }} 
                   className="flex items-center gap-2 px-4 py-2.5 rounded-full border border-gray-800 bg-gray-900/40 text-[13px] font-medium text-gray-300 hover:text-white hover:border-blue-500/50 hover:bg-blue-500/10 transition-all backdrop-blur-md shadow-sm hover:shadow-[0_0_15px_rgba(59,130,246,0.15)] active:scale-95 group"
                 >
                   <span className="opacity-70 group-hover:opacity-100 transition-opacity">{item.icon}</span>
                   {item.text}
                 </button>
              ))}
            </div>

          </div>
        )}
      </div>

    </div>
  );
}

export default function Home() {
  return (
    <Suspense fallback={<div className="flex h-screen bg-[#0E1117] items-center justify-center"><Loader2 className="w-10 h-10 text-blue-500 animate-spin" /></div>}>
      <HomeContent />
    </Suspense>
  );
}