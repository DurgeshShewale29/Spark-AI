"use client";

import { useEffect, useState, useRef, use } from "react";
import sdk, { VM } from "@stackblitz/sdk";
import { Loader2, Bot, ShieldAlert, Code2, FileCode2 } from "lucide-react";
import type Pusher from "pusher-js"; 
import type { Channel } from "pusher-js";

type Message = {
  id?: string; 
  role: "user" | "assistant";
  content: string;
  image?: string; 
  images?: string[]; 
};

type SharedProject = {
  title: string;
  framework: string;
  files: Record<string, string>;
  messages: Message[];
  timestamp: number;
};

const renderMessage = (content: string) => {
  if (!content || typeof content !== 'string') return null;

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

export default function SharedProjectPage(props: { params: Promise<{ id: string }> }) {
  const resolvedParams = use(props.params);
  const projectId = resolvedParams.id;

  const [project, setProject] = useState<SharedProject | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  
  // 🚀 NEW: State to securely store the user's role
  const [userRole, setUserRole] = useState<'viewer' | 'editor' | 'owner' | 'none'>('viewer');
  
  const [isGenerating, setIsGenerating] = useState(false); 
  const [isArchitecting, setIsArchitecting] = useState(false);
  const [isRefactoring, setIsRefactoring] = useState(false);
  
  const vmRef = useRef<VM | null>(null);
  const containerRef = useRef<HTMLDivElement>(null); 
  const messagesEndRef = useRef<HTMLDivElement>(null); 

  const fetchProjectData = async () => {
    if (!projectId) return;
    try {
      // Fetch Project Files
      const res = await fetch(`/api/share/${projectId}`);
      if (!res.ok) {
        const text = await res.text();
        let errorMessage = "Internal Server Error";
        try {
          const json = JSON.parse(text);
          errorMessage = json.error || errorMessage;
        } catch(e) {}
        throw new Error(errorMessage);
      }
      const data = await res.json();
      if (data.error) throw new Error(data.error);
      setProject(data);
      setError(null);

      // 🚀 NEW: Securely Fetch the User's Role for this Project
      const roleRes = await fetch(`/api/share/check?projectId=${projectId}`);
      if (roleRes.ok) {
        const roleData = await roleRes.json();
        setUserRole(roleData.role);
        if (roleData.role === 'none') {
          setError("You do not have permission to view this project.");
        }
      }

    } catch (err: unknown) {
      const errorMsg = err instanceof Error ? err.message : "Failed to load project.";
      setError(errorMsg);
    } finally {
      setLoading(false);
      setIsGenerating(false); 
      setIsArchitecting(false);
      setIsRefactoring(false);
    }
  };

  useEffect(() => {
    if (!projectId) return;

    fetchProjectData();

    let pusherClient: Pusher | null = null;
    let pusherChannel: Channel | null = null;
    
    import("@/lib/pusher").then(({ getPusherClient }) => {
      pusherClient = getPusherClient();
      pusherChannel = pusherClient.subscribe(`project-${projectId}`);
      
      pusherChannel.bind('typing', (data: { mode?: string } | null | undefined) => {
        const mode = data?.mode || 'chat';
        if (mode === 'architect') setIsArchitecting(true);
        else if (mode === 'refactor') setIsRefactoring(true);
        else setIsGenerating(true);
      });

      pusherChannel.bind('update', () => {
        fetchProjectData();
      });
    });

    return () => {
      if (pusherClient && pusherChannel) {
        pusherChannel.unbind_all();
        pusherClient.unsubscribe(`project-${projectId}`);
      }
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [project?.messages, isGenerating, isArchitecting, isRefactoring]);

  const mountStackBlitz = async (projectFiles: Record<string, string>, containerElement: HTMLElement) => {
    if (!projectFiles) return; 
    
    const cleanFiles: Record<string, string> = {};

    Object.entries(projectFiles).forEach(([path, content]) => {
      const cleanPath = path.replace(/^\//, "");
      cleanFiles[cleanPath] = content;
    });

    cleanFiles[".stackblitzrc"] = JSON.stringify({
      installDependencies: true, 
      startCommand: "npm run dev", 
      env: { NEXT_TELEMETRY_DISABLED: "1", NODE_ENV: "development" }
    }, null, 2);

    try {
      // 🚀 FIXED: If user is a Viewer, disable the editor and sidebar entirely!
      const isReadOnly = userRole === 'viewer';

      const vm = await sdk.embedProject(
        containerElement,
        { 
          title: project?.title || "Shared Project", 
          description: "Read-only Spark AI project", 
          template: "node", 
          files: cleanFiles 
        },
        { 
          view: isReadOnly ? "preview" : "default", // Hide code editor
          theme: "dark", 
          showSidebar: !isReadOnly, // Hide file tree
          height: "100%" 
        }
      );
      vmRef.current = vm;
    } catch (e) {
      console.warn("StackBlitz VM Connection Timeout/Warning.", e);
    }
  };

  useEffect(() => {
    if (project && project.files && Object.keys(project.files || {}).length > 0 && userRole !== 'none') {
      const timer = setTimeout(() => {
        if (containerRef.current) {
          mountStackBlitz(project.files, containerRef.current);
        }
      }, 300); 
      return () => clearTimeout(timer);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [project, userRole]);

  if (loading) {
    return (
      <div className="flex h-screen w-full bg-gray-950 items-center justify-center flex-col gap-4">
        <Loader2 className="w-10 h-10 text-blue-500 animate-spin" />
        <p className="text-gray-400 text-sm font-medium animate-pulse">Loading shared workspace...</p>
      </div>
    );
  }

  if (error || !project || userRole === 'none') {
    return (
      <div className="flex h-screen w-full bg-gray-950 items-center justify-center flex-col gap-4 p-6 text-center">
        <div className="w-16 h-16 rounded-full bg-red-500/10 flex items-center justify-center border border-red-500/20 mb-2">
          <ShieldAlert className="w-8 h-8 text-red-500" />
        </div>
        <h1 className="text-2xl font-bold text-white">Access Denied</h1>
        <p className="text-gray-400 text-sm max-w-sm">
          {error || "This project does not exist or you do not have permission to view it."}
        </p>
      </div>
    );
  }

  const hasFiles = project?.files ? Object.keys(project.files).length > 0 : false;

  return (
    <div className="flex h-screen w-full bg-[#0E1117] text-white overflow-hidden font-sans">
      
      {/* LEFT SIDE: Read-Only Chat History */}
      <div className="w-[420px] flex flex-col border-r border-gray-800/60 h-full shrink-0 relative bg-[#0B0D11] shadow-2xl z-20">
        <div className="flex items-center px-6 py-4 border-b border-gray-800/60 sticky top-0 bg-[#0B0D11]/90 backdrop-blur z-10 shrink-0 gap-3">
           <div className="w-9 h-9 rounded-full overflow-hidden border-[1px] border-cyan-500 shadow-[0_0_10px_rgba(6,182,212,0.2)] shrink-0 bg-black flex items-center justify-center">
             <img src="/logo.jpg?v=hq" alt="Spark AI" className="w-[160%] h-[160%] max-w-none object-cover" style={{ imageRendering: 'crisp-edges' }} />
           </div>
           <div className="truncate">
             <h1 className="text-sm font-extrabold tracking-tight truncate">{project?.title || "Project"}</h1>
             <p className="text-[10px] text-gray-500 uppercase tracking-wider font-semibold flex items-center gap-1.5 mt-0.5">
                <Code2 size={10} className="text-blue-400" /> {userRole === 'viewer' ? 'Public Read-Only' : 'Collaboration Mode'}
             </p>
           </div>
        </div>

        <div className="flex-1 overflow-y-auto p-4 space-y-6 custom-scrollbar scroll-smooth">
          {(project?.messages || []).map((msg: Message, i: number) => (
            <div key={i} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
              {msg.role === 'assistant' && (
                <div className="w-8 h-8 rounded-full bg-gradient-to-br from-blue-600/30 to-purple-600/30 flex items-center justify-center border border-blue-500/30 shrink-0 mr-3 mt-1 shadow-sm">
                  <Bot size={16} className="text-blue-400" />
                </div>
              )}
              <div className={`p-4 max-w-[85%] text-[14.5px] shadow-md leading-relaxed whitespace-pre-wrap flex flex-col gap-3 ${
                msg.role === 'user' 
                ? 'bg-gradient-to-br from-blue-600 to-blue-700 text-white rounded-[24px] rounded-tr-[4px] shadow-blue-900/20 border border-blue-500/20' 
                : 'bg-[#13151A] text-gray-200 border border-gray-800/80 rounded-[24px] rounded-tl-[4px] shadow-black/50'
              }`}>
                {msg.role === 'assistant' ? renderMessage(msg.content) : msg.content}
              </div>
            </div>
          ))}

          {/* Chat Bouncing Bubbles matched with the main page! */}
          {(isGenerating || isArchitecting || isRefactoring) && (
            <div className="flex justify-start animate-in fade-in duration-300 mb-4">
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
          
          <div ref={messagesEndRef} className="h-4 w-full shrink-0" />
        </div>
      </div>

      {/* RIGHT SIDE: StackBlitz VM or Fallback */}
      <div className="flex-1 flex flex-col h-screen overflow-hidden bg-[#0A0C10] relative">
        
        {isArchitecting && (
          <div className="absolute inset-0 z-50 flex flex-col items-center justify-center bg-[#0A0C10]/80 backdrop-blur-xl animate-in fade-in duration-700">
            <div className="relative mb-10">
              <div className="absolute inset-0 rounded-full bg-blue-600/20 blur-[80px] animate-[pulse_3s_ease-in-out_infinite] scale-[2]"></div>
              <div className="absolute inset-0 rounded-full bg-cyan-400/20 blur-[40px] animate-[pulse_2s_ease-in-out_infinite] scale-[1.5]"></div>
              <div className="relative p-6 bg-[#13151A] border border-gray-800 rounded-full shadow-[0_0_50px_rgba(37,99,235,0.2)] animate-in zoom-in-50 duration-700">
                <Loader2 className="w-14 h-14 text-blue-500 animate-spin" />
              </div>
            </div>
            <h2 className="text-2xl font-extrabold text-white mb-2 tracking-tight">Architecting Project</h2>
            <p className="text-gray-400 text-sm font-medium tracking-wide">Spark AI is building the environment...</p>
          </div>
        )}

        {isRefactoring && (
          <div className="absolute inset-0 z-50 flex flex-col items-center justify-center bg-[#0A0C10]/80 backdrop-blur-xl animate-in fade-in duration-700">
            <div className="relative mb-10">
              <div className="absolute inset-0 rounded-full bg-purple-600/20 blur-[80px] animate-[pulse_3s_ease-in-out_infinite] scale-[2]"></div>
              <div className="absolute inset-0 rounded-full bg-blue-400/20 blur-[40px] animate-[pulse_2s_ease-in-out_infinite] scale-[1.5]"></div>
              <div className="relative p-6 bg-[#13151A] border border-gray-800 rounded-full shadow-[0_0_50px_rgba(168,85,247,0.2)] animate-in zoom-in-50 duration-700">
                <Loader2 className="w-14 h-14 text-purple-400 animate-spin" />
              </div>
            </div>
            <h2 className="text-2xl font-extrabold text-white mb-2 tracking-tight">Refactoring Codebase</h2>
            <p className="text-gray-400 text-sm font-medium tracking-wide">Spark AI is injecting code updates...</p>
          </div>
        )}

        {/* Quarantined StackBlitz Wrapper so React's DOM stays perfectly synchronized */}
        {hasFiles ? (
          <div className="w-full h-full relative z-0">
             <div ref={containerRef} className="absolute inset-0 w-full h-full" />
          </div>
        ) : (!isArchitecting && !isRefactoring) && (
          <div className="h-full flex flex-col items-center justify-center text-gray-500 gap-4 animate-in fade-in duration-500">
            <div className="w-20 h-20 rounded-full bg-gray-800/50 flex items-center justify-center border border-gray-700/50">
               <FileCode2 size={32} className="text-gray-400" />
            </div>
            <div className="text-center">
              <h2 className="text-xl font-bold text-white mb-1">No Source Code</h2>
              <p className="text-sm">This project doesn&apos;t have any generated files yet.</p>
            </div>
          </div>
        )}
      </div>

    </div>
  );
}