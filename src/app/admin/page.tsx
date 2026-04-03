"use client";

import { useState, useEffect, useRef, Suspense } from "react";
import { useAuth, useUser } from "@clerk/nextjs";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { 
  BrainCircuit, Search, Trash2, Power, PowerOff, 
  ArrowLeft, Loader2, CheckCircle2, Clock, 
  Plus, Zap, X, RefreshCw, Users, ShieldCheck, RotateCcw,
  FolderOpen, MessageSquare, ChevronRight, UserCircle, LayoutDashboard,
  Box, Bot, AlertTriangle, Send, ShieldAlert, Minus
} from "lucide-react";

type Rule = {
  _id: string;
  content: string;
  category: string;
  isActive: boolean;
  isDeleted?: boolean;
  createdAt: string;
};

type AdminRecord = {
  _id: string;
  email: string;
  isPrimary: boolean;
  createdAt: string;
};

type AuthStatus = {
  loaded: boolean;
  isSystemClaimed: boolean;
  isCurrentUserAdmin: boolean;
  isCurrentUserPrimary: boolean;
  admins: AdminRecord[];
};

type UserProject = {
  id: string;
  title: string;
  framework: string;
  timestamp: number;
  isDeleted: boolean;
  messages: { role: string; content: string }[];
};

type UserStat = {
  userId: string;
  email?: string; 
  projectCount: number;
  lastActive: number;
  projects: UserProject[];
};

type ChatMessage = { role: "user" | "assistant"; content: string };

const renderMessage = (content: string) => {
  const parts = content.split(/```([\s\S]*?)```/g);
  
  return parts.map((part, index) => {
    if (index % 2 === 1) {
      const lines = part.split('\n');
      const code = lines.slice(1).join('\n').trim() || part;
      return (
        <div key={index} className="my-3 bg-[#0a0a0a] border border-gray-700 rounded-lg p-4 font-mono text-xs overflow-x-auto text-emerald-400 shadow-inner custom-scrollbar">
          <pre>{code}</pre>
        </div>
      );
    }
    
    const boldParts = part.split(/\*\*(.*?)\*\*/g);
    return (
      <span key={index}>
        {boldParts.map((bp, i) => 
          i % 2 === 1 ? <strong key={i} className="font-bold text-white">{bp}</strong> : <span key={i}>{bp}</span>
        )}
      </span>
    );
  });
};

function AdminDashboardContent() {
  const { isLoaded, userId } = useAuth();
  const { user } = useUser();
  const router = useRouter();
  const searchParams = useSearchParams();
  const initKey = searchParams.get("key"); 
  
  // 🚀 FIXED: Removed 'overseer' from main tabs
  const [adminTab, setAdminTab] = useState<'rules' | 'users'>('rules');

  const [rules, setRules] = useState<Rule[]>([]);
  const [loadingRules, setLoadingRules] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [activeFilter, setActiveFilter] = useState<'all' | 'active' | 'disabled' | 'trash'>('all');

  const [usersList, setUsersList] = useState<UserStat[]>([]);
  const [loadingUsers, setLoadingUsers] = useState(false);
  const [selectedUser, setSelectedUser] = useState<UserStat | null>(null);
  const [selectedProject, setSelectedProject] = useState<UserProject | null>(null);

  const [authStatus, setAuthStatus] = useState<AuthStatus>({
    loaded: false,
    isSystemClaimed: false,
    isCurrentUserAdmin: false,
    isCurrentUserPrimary: false,
    admins: []
  });

  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [isManageAdminsOpen, setIsManageAdminsOpen] = useState(false);

  const [newRuleContent, setNewRuleContent] = useState("");
  const [newRuleCategory, setNewRuleCategory] = useState("manual-injection");
  const [isCreating, setIsCreating] = useState(false);
  const [newAdminEmail, setNewAdminEmail] = useState("");
  const [isAddingAdmin, setIsAddingAdmin] = useState(false);

  const [confirmAction, setConfirmAction] = useState<{ 
    type: 'rule' | 'allRules' | 'project' | 'admin', 
    id?: string, 
    secondaryId?: string,
    message: string 
  } | null>(null);

  // 🚀 FIXED: State for the floating Overseer bot
  const [isOverseerOpen, setIsOverseerOpen] = useState(false);
  const [overseerMessages, setOverseerMessages] = useState<ChatMessage[]>([
    { role: "assistant", content: "Greetings, Admin. I am the Hive Mind Overseer. I am currently monitoring the active rules database. Would you like me to run a diagnostic scan for duplicates or conflicts?" }
  ]);
  const [overseerInput, setOverseerInput] = useState("");
  const [isOverseerLoading, setIsOverseerLoading] = useState(false);
  const chatEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (isLoaded && userId) {
      checkAdminAuth();
    } else if (isLoaded && !userId) {
      router.replace("/");
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isLoaded, userId]);

  useEffect(() => {
    if (authStatus.isCurrentUserAdmin) {
      if (adminTab === 'rules') fetchRules();
      if (adminTab === 'users') fetchUsers();
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [adminTab, authStatus.isCurrentUserAdmin]);

  useEffect(() => {
    if (isOverseerOpen) {
      chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
    }
  }, [overseerMessages, isOverseerOpen]);

  const checkAdminAuth = async () => {
    try {
      const res = await fetch("/api/admin/auth");
      const data = await res.json();
      
      setAuthStatus({
        loaded: true,
        isSystemClaimed: data.isSystemClaimed,
        isCurrentUserAdmin: data.isCurrentUserAdmin,
        isCurrentUserPrimary: data.isCurrentUserPrimary,
        admins: data.admins || []
      });
      
      if (data.isCurrentUserAdmin) {
        fetchRules();
      } else if (data.isSystemClaimed) {
        router.replace("/");
      } else if (!data.isSystemClaimed && initKey !== "godmode") {
        router.replace("/");
      }
    } catch (err) {
      router.replace("/");
    }
  };

  const handleClaimSystem = async () => {
    try {
      const res = await fetch("/api/admin/auth", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "claim" }),
      });
      if (!res.ok) throw new Error("Failed to claim system");
      
      router.replace("/admin");
      checkAdminAuth();
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : "Error claiming system");
    }
  };

  const fetchRules = async () => {
    setLoadingRules(true);
    try {
      const res = await fetch("/api/rules");
      if (!res.ok) throw new Error("Failed to fetch Hive Mind rules");
      const data = await res.json();
      setRules(data);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Unknown error occurred");
    } finally {
      setLoadingRules(false);
    }
  };

  const handleCreateRule = async () => {
    if (!newRuleContent.trim()) return;
    setIsCreating(true);
    setError(null);
    try {
      const res = await fetch("/api/rules", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content: newRuleContent, category: newRuleCategory }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to create rule");
      setRules([data.rule, ...rules]);
      setNewRuleContent("");
      setIsCreateModalOpen(false);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to inject rule.");
    } finally {
      setIsCreating(false);
    }
  };

  const toggleRuleStatus = async (id: string, currentStatus: boolean) => {
    setRules(rules.map(rule => rule._id === id ? { ...rule, isActive: !currentStatus } : rule));
    try {
      await fetch("/api/rules", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id, isActive: !currentStatus }) });
    } catch (err) {
      setRules(rules.map(rule => rule._id === id ? { ...rule, isActive: currentStatus } : rule));
    }
  };

  const softDeleteRule = async (id: string) => {
    setRules(rules.map(rule => rule._id === id ? { ...rule, isDeleted: true } : rule));
    try {
      await fetch("/api/rules", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id, isDeleted: true }) });
    } catch (err) {
      setRules(rules.map(rule => rule._id === id ? { ...rule, isDeleted: false } : rule));
    }
  };

  const restoreRule = async (id: string) => {
    setRules(rules.map(rule => rule._id === id ? { ...rule, isDeleted: false } : rule));
    try {
      await fetch("/api/rules", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id, isDeleted: false }) });
    } catch (err) {
      setRules(rules.map(rule => rule._id === id ? { ...rule, isDeleted: true } : rule));
    }
  };

  const fetchUsers = async () => {
    setLoadingUsers(true);
    try {
      const res = await fetch("/api/admin/users");
      if (!res.ok) throw new Error("Failed to fetch users");
      const data = await res.json();
      setUsersList(data);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Unknown error fetching users");
    } finally {
      setLoadingUsers(false);
    }
  };

  const handleAddAdmin = async () => {
    if (!newAdminEmail.trim() || !newAdminEmail.includes("@")) return;
    setIsAddingAdmin(true);
    try {
      const res = await fetch("/api/admin/auth", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "add", emailToAdd: newAdminEmail }) });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setAuthStatus(prev => ({ ...prev, admins: [...prev.admins, data.admin] }));
      setNewAdminEmail("");
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : "Error adding admin");
    } finally {
      setIsAddingAdmin(false);
    }
  };

  const hardDeleteRule = (id: string) => {
    setConfirmAction({ type: 'rule', id, message: "This will permanently delete this rule from the vector database." });
  };

  const emptyRuleTrash = () => {
    setConfirmAction({ type: 'allRules', message: "This will permanently delete ALL rules currently in the trash from the vector database." });
  };

  const hardDeleteUserProject = (projectId: string, currentUserId: string) => {
    setConfirmAction({ type: 'project', id: projectId, secondaryId: currentUserId, message: "Force delete this user's project from the database?" });
  };

  const handleRemoveAdmin = (id: string) => {
    setConfirmAction({ type: 'admin', id, message: "Remove this user's admin privileges?" });
  };

  const executeAdminAction = async () => {
    if (!confirmAction) return;
    const { type, id, secondaryId } = confirmAction;
    
    try {
      if (type === 'rule' && id) {
        setRules(rules.filter(rule => rule._id !== id));
        await fetch("/api/rules", { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id }) });
      } 
      else if (type === 'allRules') {
        const trashRules = rules.filter(r => r.isDeleted);
        setRules(rules.filter(r => !r.isDeleted));
        await Promise.all(trashRules.map(rule => 
          fetch("/api/rules", { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: rule._id }) })
        ));
      } 
      else if (type === 'project' && id && secondaryId) {
        await fetch("/api/admin/users", {
          method: "DELETE",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ projectId: id }),
        });
        setUsersList(usersList.map(u => {
          if (u.userId === secondaryId) {
            return { ...u, projectCount: u.projectCount - 1, projects: u.projects.filter(p => p.id !== id) };
          }
          return u;
        }));
        if (selectedUser && selectedUser.userId === secondaryId) {
          setSelectedUser({ ...selectedUser, projectCount: selectedUser.projectCount - 1, projects: selectedUser.projects.filter(p => p.id !== id) });
        }
        setSelectedProject(null);
      } 
      else if (type === 'admin' && id) {
        await fetch("/api/admin/auth", { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id }) });
        setAuthStatus(prev => ({ ...prev, admins: prev.admins.filter(a => a._id !== id) }));
      }
    } catch (err) {
      alert("Action failed to execute properly.");
    }
    
    setConfirmAction(null);
  };

  // 🚀 Overseer Bot Handler
  const handleSendOverseerMessage = async () => {
    if (!overseerInput.trim() || isOverseerLoading) return;

    const newMessages: ChatMessage[] = [...overseerMessages, { role: "user", content: overseerInput }];
    setOverseerMessages(newMessages);
    setOverseerInput("");
    setIsOverseerLoading(true);

    try {
      const res = await fetch("/api/admin/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: newMessages, customApiKey: localStorage.getItem("spark_custom_api_key") })
      });

      if (!res.ok) {
        const errorData = await res.json().catch(() => ({}));
        throw new Error(errorData.error || `Server responded with status ${res.status}`);
      }

      setOverseerMessages(prev => [...prev, { role: "assistant", content: "" }]);

      const reader = res.body?.getReader();
      const decoder = new TextDecoder();
      let fullText = "";

      if (reader) {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          fullText += decoder.decode(value, { stream: true });
          
          setOverseerMessages(prev => {
            const updated = [...prev];
            updated[updated.length - 1].content = fullText;
            return updated;
          });
        }
      }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } catch (error: any) {
      console.error("Overseer Chat Error:", error);
      setOverseerMessages(prev => [...prev, { 
        role: "assistant", 
        content: `⚠️ **System Error:** ${error.message}\n\n*If this says 429 or Quota Exceeded, the Gemini API is just cooling down. Wait 30 seconds and try again!*` 
      }]);
    } finally {
      setIsOverseerLoading(false);
    }
  };

  const safeQuery = (searchQuery || "").toLowerCase();

  const filteredRules = rules.filter(rule => {
    const safeContent = (rule.content || "").toLowerCase();
    const safeCategory = (rule.category || "").toLowerCase();
    const matchesSearch = safeContent.includes(safeQuery) || safeCategory.includes(safeQuery);
    
    if (activeFilter === 'trash') return matchesSearch && rule.isDeleted;
    if (rule.isDeleted) return false;
    if (activeFilter === 'active') return matchesSearch && rule.isActive;
    if (activeFilter === 'disabled') return matchesSearch && !rule.isActive;
    return matchesSearch; 
  });

  const filteredUsers = usersList.filter(u => 
    (u.userId && u.userId.toLowerCase().includes(safeQuery)) ||
    (u.email && u.email.toLowerCase().includes(safeQuery))
  );

  if (!isLoaded || !authStatus.loaded) return <div className="flex h-screen w-full bg-gray-950"></div>;
  if (!userId || (!authStatus.isCurrentUserAdmin && authStatus.isSystemClaimed) || (!authStatus.isSystemClaimed && initKey !== "godmode")) return null; 

  if (!authStatus.isSystemClaimed && initKey === "godmode") {
    return (
      <div className="flex h-screen w-full items-center justify-center bg-gray-950 text-white flex-col gap-6 p-4 animate-in fade-in zoom-in-95 duration-500">
        <div className="relative">
          <div className="absolute inset-0 bg-blue-500/20 blur-[50px] rounded-full"></div>
          <div className="w-24 h-24 relative rounded-full overflow-hidden border-2 border-blue-500/50 bg-black z-10 flex items-center justify-center">
            <ShieldCheck className="w-10 h-10 text-blue-400" />
          </div>
        </div>
        <div className="text-center max-w-md">
          <h1 className="text-3xl font-extrabold mb-3 tracking-tight">Secret Setup Protocol</h1>
          <p className="text-gray-400 mb-8 leading-relaxed">
            You have accessed the hidden setup route. Click below to permanently bind this system to <strong className="text-white">{user?.emailAddresses[0]?.emailAddress}</strong> as the Primary Administrator.
          </p>
          <button onClick={handleClaimSystem} className="w-full bg-blue-600 hover:bg-blue-500 text-white font-bold py-4 rounded-xl shadow-[0_0_20px_rgba(37,99,235,0.4)] transition-all hover:scale-[1.02] active:scale-95">
            Claim Primary Admin Rights
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-950 text-white font-sans relative">

      {/* CUSTOM ADMIN ACTION CONFIRMATION MODAL */}
      {confirmAction && (
        <div className="absolute inset-0 z-[100] flex items-center justify-center bg-black/60 backdrop-blur-md p-4 animate-in fade-in duration-300">
          <div className="bg-gray-900 border border-red-500/30 p-6 rounded-2xl w-full max-w-md shadow-[0_20px_60px_-15px_rgba(239,68,68,0.2)] relative animate-in slide-in-from-top-8 zoom-in-95 duration-300 ease-out">
            <button onClick={() => setConfirmAction(null)} className="absolute top-4 right-4 text-gray-500 hover:text-white transition-colors">
              <X className="w-5 h-5" />
            </button>
            
            <div className="flex items-center gap-3 mb-3">
              <div className="p-2 bg-red-500/10 rounded-lg border border-red-500/20">
                <AlertTriangle className="w-5 h-5 text-red-500" />
              </div>
              <h2 className="text-xl font-bold text-white tracking-tight">Confirm Action</h2>
            </div>
            
            <div className="bg-gray-950 border border-gray-800 rounded-xl p-4 mb-6">
              <p className="text-sm text-gray-300 leading-relaxed">
                {confirmAction.message}
              </p>
              <p className="text-sm text-red-400 font-semibold mt-3">
                This action cannot be undone.
              </p>
            </div>

            <div className="flex items-center gap-3">
              <button 
                onClick={() => setConfirmAction(null)} 
                className="w-full bg-gray-800 hover:bg-gray-700 text-gray-300 hover:text-white font-semibold py-3 rounded-xl flex items-center justify-center gap-2 transition-all active:scale-[0.98] border border-gray-700"
              >
                Cancel
              </button>
              <button 
                onClick={executeAdminAction} 
                className="w-full bg-red-600 hover:bg-red-500 text-white font-semibold py-3 rounded-xl flex items-center justify-center gap-2 transition-all shadow-md hover:shadow-red-500/20 active:scale-[0.98]"
              >
                <Trash2 className="w-4 h-4" /> Confirm
              </button>
            </div>
          </div>
        </div>
      )}
      
      {/* View User Projects Modal */}
      {selectedUser && !selectedProject && (
        <div className="absolute inset-0 z-40 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4 animate-in fade-in duration-200">
          <div className="bg-gray-900 border border-gray-800 rounded-2xl w-full max-w-3xl shadow-2xl relative animate-in zoom-in-95 slide-in-from-bottom-4 duration-300 flex flex-col max-h-[85vh]">
            <div className="p-6 border-b border-gray-800 flex items-center justify-between shrink-0 bg-gray-900/50 rounded-t-2xl">
              <div className="flex items-center gap-3">
                <div className="p-2.5 bg-blue-500/10 rounded-xl border border-blue-500/20"><FolderOpen className="w-5 h-5 text-blue-400" /></div>
                <div>
                  <h2 className="text-xl font-bold text-white tracking-tight flex items-center gap-2">
                    User Projects 
                    <span className="text-xs bg-gray-800 px-2 py-0.5 rounded text-gray-400 font-mono">
                      {selectedUser.email || selectedUser.userId} 
                    </span>
                  </h2>
                  <p className="text-xs text-gray-400 mt-1">{selectedUser.projectCount} total workspaces generated</p>
                </div>
              </div>
              <button onClick={() => setSelectedUser(null)} className="p-2 text-gray-500 hover:bg-gray-800 hover:text-white rounded-xl transition-all"><X className="w-5 h-5" /></button>
            </div>
            
            <div className="p-4 overflow-y-auto flex-1 custom-scrollbar">
              {selectedUser.projects.length === 0 ? (
                <div className="text-center text-gray-500 p-10">No projects found for this user.</div>
              ) : (
                <div className="space-y-3">
                  {selectedUser.projects.map(proj => (
                    <div key={proj.id} className="flex items-center justify-between p-4 bg-gray-950 border border-gray-800 rounded-xl hover:border-blue-500/50 transition-colors group">
                      <div className="flex items-center gap-4 flex-1 overflow-hidden">
                        <div className="p-2 bg-gray-800 rounded-lg group-hover:bg-blue-600/20 transition-colors"><Box className="w-4 h-4 text-gray-400 group-hover:text-blue-400" /></div>
                        <div className="truncate">
                          <h3 className="text-sm font-bold text-gray-200 group-hover:text-white truncate">{proj.title}</h3>
                          <div className="flex items-center gap-2 text-xs text-gray-500 mt-1">
                            <span className="capitalize">{proj.framework.replace('-', ' ')}</span>
                            <span>•</span>
                            <span>{new Date(proj.timestamp).toLocaleString()}</span>
                            {proj.isDeleted && <span className="text-red-400 bg-red-500/10 px-1.5 rounded uppercase tracking-wider text-[10px] font-bold">In Trash</span>}
                          </div>
                        </div>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        <button onClick={() => setSelectedProject(proj)} className="px-3 py-1.5 bg-gray-800 hover:bg-blue-600 hover:text-white text-xs font-semibold rounded-lg transition-colors flex items-center gap-1">
                          <MessageSquare size={14} /> Read Chat
                        </button>
                        <button onClick={() => hardDeleteUserProject(proj.id, selectedUser.userId)} className="p-1.5 text-gray-500 hover:text-red-400 hover:bg-red-500/10 rounded-lg transition-colors" title="Force Delete">
                          <Trash2 size={16} />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* View Project Chat Modal */}
      {selectedProject && (
        <div className="absolute inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4 animate-in fade-in duration-200">
          <div className="bg-gray-900 border border-gray-800 rounded-2xl w-full max-w-4xl shadow-2xl relative animate-in zoom-in-95 duration-300 flex flex-col h-[90vh]">
            <div className="p-4 border-b border-gray-800 flex items-center justify-between shrink-0 bg-gray-900/80 backdrop-blur rounded-t-2xl">
              <div className="flex items-center gap-3">
                <button onClick={() => setSelectedProject(null)} className="p-2 text-gray-400 hover:text-white hover:bg-gray-800 rounded-lg transition-all"><ArrowLeft size={18} /></button>
                <div>
                  <h2 className="text-lg font-bold text-white tracking-tight truncate max-w-md">{selectedProject.title}</h2>
                  <p className="text-xs text-gray-500">Read-Only Chat Log</p>
                </div>
              </div>
              <button onClick={() => { setSelectedProject(null); setSelectedUser(null); }} className="p-2 text-gray-500 hover:bg-gray-800 hover:text-white rounded-xl transition-all"><X className="w-5 h-5" /></button>
            </div>
            
            <div className="p-6 overflow-y-auto flex-1 custom-scrollbar space-y-6 bg-[#0a0a0a]">
              {selectedProject.messages && selectedProject.messages.length > 0 ? (
                selectedProject.messages.map((msg, i) => (
                  <div key={i} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                    {msg.role === 'assistant' && (
                       <div className="w-8 h-8 rounded-full bg-blue-900/30 flex items-center justify-center border border-blue-800/50 shrink-0 mr-3 mt-1"><Bot size={16} className="text-blue-400" /></div>
                    )}
                    <div className={`p-4 max-w-[85%] text-sm shadow-md leading-relaxed whitespace-pre-wrap flex flex-col gap-2 ${
                      msg.role === 'user' ? 'bg-gray-800 text-white rounded-2xl rounded-tr-sm' : 'bg-gray-900 text-gray-300 border border-gray-800 rounded-2xl rounded-tl-sm'
                    }`}>
                      {msg.role === 'assistant' ? renderMessage(msg.content) : msg.content}
                    </div>
                  </div>
                ))
              ) : (
                <div className="text-center text-gray-500 mt-20">No chat history available for this project.</div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Add Rule Modal */}
      {isCreateModalOpen && (
        <div className="absolute inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4 animate-in fade-in duration-200">
          <div className="bg-gray-900 border border-gray-800 p-6 rounded-2xl w-full max-w-lg shadow-2xl relative animate-in zoom-in-95 slide-in-from-bottom-4 duration-300">
            <button onClick={() => setIsCreateModalOpen(false)} className="absolute top-4 right-4 text-gray-500 hover:text-white transition-colors"><X className="w-5 h-5" /></button>
            <div className="flex items-center gap-3 mb-6">
              <div className="p-2 bg-yellow-500/10 rounded-lg border border-yellow-500/20"><Zap className="w-5 h-5 text-yellow-500" /></div>
              <div>
                <h2 className="text-xl font-bold text-white tracking-tight">Inject Master Rule</h2>
                <p className="text-xs text-gray-400">Manually wire a permanent instruction into the AI.</p>
              </div>
            </div>
            <div className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">Category / Tag</label>
                <select value={newRuleCategory} onChange={(e) => setNewRuleCategory(e.target.value)} className="w-full bg-gray-950 border border-gray-800 rounded-xl px-4 py-3 text-sm text-white focus:ring-2 focus:ring-blue-500 outline-none transition-all appearance-none cursor-pointer">
                  <option value="manual-injection">manual-injection (General)</option>
                  <option value="architecture">architecture</option>
                  <option value="ui-ux">ui-ux</option>
                  <option value="security">security</option>
                  <option value="performance">performance</option>
                </select>
              </div>
              <div>
                <label className="block text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">Rule Directive</label>
                <textarea value={newRuleContent} onChange={(e) => setNewRuleContent(e.target.value)} placeholder="e.g., 'Always use Lucide-React for icons instead of HeroIcons.'" className="w-full bg-gray-950 border border-gray-800 rounded-xl px-4 py-3 text-sm text-white focus:ring-2 focus:ring-blue-500 outline-none transition-all resize-y min-h-[120px] custom-scrollbar" />
              </div>
              <div className="pt-2">
                <button onClick={handleCreateRule} disabled={!newRuleContent.trim() || isCreating} className="w-full bg-yellow-600 hover:bg-yellow-500 text-white font-semibold py-3.5 rounded-xl flex items-center justify-center gap-2 transition-all shadow-lg shadow-yellow-600/20 active:scale-[0.98] disabled:opacity-50 disabled:active:scale-100">
                  {isCreating ? <Loader2 className="w-4 h-4 animate-spin" /> : <Zap className="w-4 h-4 fill-current" />}
                  {isCreating ? "Embedding Vector..." : "Wire into Hive Mind"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Manage Admins Modal */}
      {isManageAdminsOpen && authStatus.isCurrentUserPrimary && (
        <div className="absolute inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4 animate-in fade-in duration-200">
          <div className="bg-gray-900 border border-gray-800 p-6 rounded-2xl w-full max-w-lg shadow-2xl relative animate-in zoom-in-95 slide-in-from-bottom-4 duration-300">
            <button onClick={() => setIsManageAdminsOpen(false)} className="absolute top-4 right-4 text-gray-500 hover:text-white transition-colors"><X className="w-5 h-5" /></button>
            <div className="flex items-center gap-3 mb-6">
              <div className="p-2 bg-indigo-500/10 rounded-lg border border-indigo-500/20"><Users className="w-5 h-5 text-indigo-400" /></div>
              <div>
                <h2 className="text-xl font-bold text-white tracking-tight">Manage Team Access</h2>
                <p className="text-xs text-gray-400">Add or remove secondary administrators.</p>
              </div>
            </div>
            <div className="space-y-4 mb-6">
              <label className="block text-xs font-semibold text-gray-400 uppercase tracking-wider">Invite New Admin</label>
              <div className="flex gap-2">
                <input type="email" value={newAdminEmail} onChange={(e) => setNewAdminEmail(e.target.value)} placeholder="developer@gmail.com" className="flex-1 bg-gray-950 border border-gray-800 rounded-xl px-4 py-2.5 text-sm text-white focus:ring-2 focus:ring-blue-500 outline-none transition-all" />
                <button onClick={handleAddAdmin} disabled={!newAdminEmail || isAddingAdmin} className="bg-indigo-600 hover:bg-indigo-500 text-white font-semibold px-4 rounded-xl flex items-center gap-2 transition-all disabled:opacity-50">
                  {isAddingAdmin ? <Loader2 className="w-4 h-4 animate-spin" /> : "Invite"}
                </button>
              </div>
            </div>
            <div className="border border-gray-800 rounded-xl overflow-hidden bg-gray-950">
              <div className="p-3 border-b border-gray-800 bg-gray-900/50 text-xs font-bold text-gray-400 uppercase tracking-wider">Current Admins</div>
              <div className="divide-y divide-gray-800/60 max-h-60 overflow-y-auto">
                {authStatus.admins.map((admin) => (
                  <div key={admin._id} className="flex items-center justify-between p-3 px-4 hover:bg-gray-800/30 transition-colors">
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded-full bg-blue-900/30 border border-blue-500/20 flex items-center justify-center text-blue-400 font-bold text-xs uppercase">{admin.email.substring(0, 2)}</div>
                      <div>
                        <p className="text-sm font-medium text-white">{admin.email}</p>
                        {admin.isPrimary ? <span className="text-[10px] text-yellow-500 font-bold uppercase tracking-wider">Primary Admin</span> : <span className="text-[10px] text-gray-500 uppercase tracking-wider">Secondary</span>}
                      </div>
                    </div>
                    {!admin.isPrimary && <button onClick={() => handleRemoveAdmin(admin._id)} className="p-2 text-gray-500 hover:text-red-400 hover:bg-red-500/10 rounded-lg transition-all"><Trash2 size={16} /></button>}
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ADMIN HEADER */}
      <div className="sticky top-0 z-10 bg-gray-900/80 backdrop-blur-md border-b border-gray-800 p-6 flex flex-col sm:flex-row justify-between items-center gap-4 animate-in slide-in-from-top-4 duration-500">
        <div className="flex items-center gap-4 w-full sm:w-auto">
          <Link href="/" className="p-2 bg-gray-800 hover:bg-gray-700 rounded-xl transition-all text-gray-400 hover:text-white hover:scale-105 active:scale-95">
            <ArrowLeft className="w-5 h-5" />
          </Link>
          <div className="flex items-center gap-3">
            <div className="p-2.5 bg-blue-600/20 border border-blue-500/30 rounded-xl shadow-[0_0_15px_rgba(37,99,235,0.3)]">
              {adminTab === 'rules' ? <BrainCircuit className="w-6 h-6 text-blue-400" /> : <Users className="w-6 h-6 text-blue-400" />}
            </div>
            <div>
              <h1 className="text-2xl font-extrabold tracking-tight">Enterprise Control</h1>
              <p className="text-xs text-gray-400 font-medium tracking-wide">Logged in as {user?.emailAddresses[0]?.emailAddress}</p>
            </div>
          </div>
        </div>

        {/* TAB SWITCHER & ACTION BUTTONS */}
        <div className="flex items-center gap-3 w-full sm:w-auto justify-end">
          
          <div className="flex bg-gray-950 border border-gray-800 rounded-xl p-1 shrink-0 shadow-inner mr-2">
            <button 
              onClick={() => setAdminTab('rules')}
              className={`px-4 py-1.5 text-xs font-bold rounded-lg transition-all flex items-center gap-2 ${adminTab === 'rules' ? 'bg-gray-800 text-white shadow-sm' : 'text-gray-500 hover:text-gray-300'}`}
            >
              <LayoutDashboard size={14}/> Hive Mind
            </button>
            <button 
              onClick={() => setAdminTab('users')}
              className={`px-4 py-1.5 text-xs font-bold rounded-lg transition-all flex items-center gap-2 ${adminTab === 'users' ? 'bg-gray-800 text-white shadow-sm' : 'text-gray-500 hover:text-gray-300'}`}
            >
              <UserCircle size={14}/> Users
            </button>
          </div>

          <div className="relative w-full sm:w-48 lg:w-64 hidden md:block">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
            <input type="text" placeholder="Search..." value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} className="w-full bg-gray-950 border border-gray-800 rounded-xl pl-9 pr-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-600 transition-all" />
          </div>
          
          {authStatus.isCurrentUserPrimary && (
            <button onClick={() => setIsManageAdminsOpen(true)} className="p-2.5 bg-gray-800 text-gray-300 hover:text-white hover:bg-gray-700 rounded-xl transition-all shadow-md active:scale-95" title="Manage Admins"><ShieldCheck size={16} /></button>
          )}
          {adminTab === 'rules' && (
            <button onClick={() => setIsCreateModalOpen(true)} className="flex items-center gap-2 bg-white text-black font-bold px-4 py-2.5 rounded-xl transition-all hover:bg-gray-200 hover:scale-105 active:scale-95 shadow-md whitespace-nowrap text-sm"><Plus size={16} className="stroke-[3px]" /> Inject Rule</button>
          )}
        </div>
      </div>

      {/* MAIN CONTENT AREA */}
      <div className="max-w-6xl mx-auto p-6 mt-4 pb-32">
        
        {/* 🧠 TAB 1: RULES ENGINE */}
        {adminTab === 'rules' && (
          <div className="animate-in fade-in slide-in-from-bottom-4 duration-500">
            {/* Stats Row */}
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4 mb-8">
              <div onClick={() => setActiveFilter('all')} className={`bg-gray-900 border rounded-2xl p-5 flex items-center justify-between transition-all hover:-translate-y-1 duration-300 shadow-lg cursor-pointer ${activeFilter === 'all' ? 'border-blue-500 ring-1 ring-blue-500/50 bg-gray-800' : 'border-gray-800 hover:border-gray-700'}`}>
                <div>
                  <p className={`text-sm font-medium mb-1 ${activeFilter === 'all' ? 'text-blue-400' : 'text-gray-400'}`}>Total Rules</p>
                  <h2 className="text-3xl font-bold">{rules.filter(r => !r.isDeleted).length}</h2>
                </div>
                <div className={`p-3 rounded-xl transition-colors ${activeFilter === 'all' ? 'bg-blue-500/20 text-blue-400' : 'bg-gray-800 text-gray-400'}`}><BrainCircuit size={24}/></div>
              </div>
              <div onClick={() => setActiveFilter('active')} className={`bg-gray-900 border rounded-2xl p-5 flex items-center justify-between transition-all hover:-translate-y-1 duration-300 shadow-lg cursor-pointer ${activeFilter === 'active' ? 'border-green-500 ring-1 ring-green-500/50 bg-gray-800' : 'border-green-900/30 hover:border-green-900/50'}`}>
                <div>
                  <p className={`text-sm font-medium mb-1 ${activeFilter === 'active' ? 'text-green-400' : 'text-green-400/80'}`}>Active</p>
                  <h2 className="text-3xl font-bold text-green-400">{rules.filter(r => !r.isDeleted && r.isActive).length}</h2>
                </div>
                <div className={`p-3 rounded-xl transition-colors ${activeFilter === 'active' ? 'bg-green-500/20 text-green-400' : 'bg-green-500/10 text-green-500'}`}><CheckCircle2 size={24}/></div>
              </div>
              <div onClick={() => setActiveFilter('disabled')} className={`bg-gray-900 border rounded-2xl p-5 flex items-center justify-between transition-all hover:-translate-y-1 duration-300 shadow-lg cursor-pointer ${activeFilter === 'disabled' ? 'border-yellow-500 ring-1 ring-yellow-500/50 bg-gray-800' : 'border-yellow-900/30 hover:border-yellow-900/50'}`}>
                <div>
                  <p className={`text-sm font-medium mb-1 ${activeFilter === 'disabled' ? 'text-yellow-400' : 'text-yellow-400/80'}`}>Disabled</p>
                  <h2 className="text-3xl font-bold text-yellow-400">{rules.filter(r => !r.isDeleted && !r.isActive).length}</h2>
                </div>
                <div className={`p-3 rounded-xl transition-colors ${activeFilter === 'disabled' ? 'bg-yellow-500/20 text-yellow-400' : 'bg-yellow-500/10 text-yellow-500'}`}><PowerOff size={24}/></div>
              </div>
              <div onClick={() => setActiveFilter('trash')} className={`bg-gray-900 border rounded-2xl p-5 flex items-center justify-between transition-all hover:-translate-y-1 duration-300 shadow-lg cursor-pointer ${activeFilter === 'trash' ? 'border-red-500 ring-1 ring-red-500/50 bg-gray-800' : 'border-red-900/30 hover:border-red-900/50'}`}>
                <div>
                  <p className={`text-sm font-medium mb-1 ${activeFilter === 'trash' ? 'text-red-400' : 'text-red-400/80'}`}>Trash Bin</p>
                  <h2 className="text-3xl font-bold text-red-400">{rules.filter(r => r.isDeleted).length}</h2>
                </div>
                <div className={`p-3 rounded-xl transition-colors ${activeFilter === 'trash' ? 'bg-red-500/20 text-red-400' : 'bg-red-500/10 text-red-500'}`}><Trash2 size={24}/></div>
              </div>
            </div>

            {error && <div className="mb-6 p-4 bg-red-500/10 border border-red-500/20 text-red-400 rounded-xl animate-in slide-in-from-top-2">{error}</div>}

            <div className="bg-gray-900 border border-gray-800 rounded-2xl overflow-hidden shadow-2xl">
              <div className="p-5 border-b border-gray-800 bg-gray-900/50 flex justify-between items-center">
                <div className="flex items-center gap-3">
                  <h2 className="text-lg font-bold">{activeFilter === 'trash' ? 'Deleted Vectors' : 'Learned Memory Vectors'}</h2>
                  {activeFilter !== 'all' && <span className="text-xs bg-gray-800 text-gray-300 px-2 py-1 rounded-md border border-gray-700 uppercase tracking-wider font-semibold">Showing: {activeFilter}</span>}
                  
                  {activeFilter === 'trash' && filteredRules.length > 0 && (
                    <button 
                      onClick={emptyRuleTrash} 
                      className="ml-2 text-xs bg-red-500/10 text-red-400 hover:bg-red-500/20 px-3 py-1.5 rounded-lg border border-red-500/20 font-semibold flex items-center gap-1.5 transition-colors active:scale-95"
                    >
                      <Trash2 size={14} /> Empty Trash
                    </button>
                  )}
                </div>
                <button onClick={fetchRules} className="text-xs text-blue-400 hover:text-blue-300 font-semibold flex items-center gap-1 transition-colors"><RefreshCw size={12} className={loadingRules ? "animate-spin" : ""} /> Refresh</button>
              </div>

              {loadingRules ? (
                <div className="flex justify-center items-center p-20"><Loader2 className="w-8 h-8 text-blue-500 animate-spin" /></div>
              ) : filteredRules.length === 0 ? (
                <div className="flex flex-col items-center justify-center p-20 text-gray-500 text-center animate-in fade-in duration-500">
                  {activeFilter === 'trash' ? <Trash2 className="w-12 h-12 mb-4 opacity-20" /> : <BrainCircuit className="w-12 h-12 mb-4 opacity-20" />}
                  <h3 className="text-lg font-semibold text-gray-400 mb-1">{activeFilter === 'trash' ? 'Trash is empty' : 'No rules found'}</h3>
                  <p className="text-sm">No rules match your current search or filter criteria.</p>
                  {activeFilter !== 'all' && <button onClick={() => setActiveFilter('all')} className="mt-4 text-blue-400 hover:text-blue-300 text-sm font-medium">Clear Filters</button>}
                </div>
              ) : (
                <div className="divide-y divide-gray-800/60 max-h-[600px] overflow-y-auto custom-scrollbar">
                  {filteredRules.map((rule, index) => (
                    <div key={rule._id} className={`p-5 transition-colors hover:bg-gray-800/30 animate-in fade-in slide-in-from-bottom-2 ${(!rule.isActive || rule.isDeleted) ? 'opacity-60 grayscale-[50%]' : ''}`} style={{ animationDelay: `${index * 50}ms`, animationFillMode: 'both' }}>
                      <div className="flex gap-4 items-start justify-between group">
                        <div className="flex-1">
                          <div className="flex items-center gap-3 mb-2">
                            <span className={`text-[10px] uppercase tracking-wider font-bold px-2 py-1 rounded border ${rule.category === 'auto-learned' ? 'bg-purple-500/10 border-purple-500/20 text-purple-400' : rule.category === 'manual-injection' ? 'bg-yellow-500/10 border-yellow-500/20 text-yellow-500' : 'bg-blue-500/10 border-blue-500/20 text-blue-400'}`}>
                              {rule.category === 'manual-injection' ? <Zap size={10} className="inline mr-1" /> : null}{rule.category}
                            </span>
                            <span className="flex items-center gap-1 text-xs text-gray-500 font-mono"><Clock size={12} /> {new Date(rule.createdAt).toLocaleString()}</span>
                            {rule.isDeleted ? <span className="text-[10px] uppercase tracking-wider font-bold px-2 py-1 rounded bg-red-500/10 border border-red-500/20 text-red-400">In Trash</span> : !rule.isActive && <span className="text-[10px] uppercase tracking-wider font-bold px-2 py-1 rounded bg-yellow-500/10 border border-yellow-500/20 text-yellow-500">Disabled</span>}
                          </div>
                          <p className={`text-sm leading-relaxed font-medium ${rule.isDeleted ? 'text-gray-400 line-through' : 'text-gray-200'}`}>{rule.content}</p>
                        </div>
                        <div className="flex items-center gap-2 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity duration-200">
                          {rule.isDeleted ? (
                            <>
                              <button onClick={() => restoreRule(rule._id)} className="p-2 rounded-xl border bg-gray-800 border-gray-700 text-blue-400 hover:bg-gray-700 hover:text-blue-300 hover:border-blue-500/30 transition-all hover:scale-105 active:scale-95" title="Restore Rule"><RotateCcw size={18} /></button>
                              <button onClick={() => hardDeleteRule(rule._id)} className="p-2 rounded-xl bg-gray-800 border border-gray-700 text-red-500 hover:bg-red-500/20 hover:text-red-400 hover:border-red-500/50 transition-all hover:scale-105 active:scale-95" title="Permanently Delete"><Trash2 size={18} /></button>
                            </>
                          ) : (
                            <>
                              <button onClick={() => toggleRuleStatus(rule._id, rule.isActive)} className={`p-2 rounded-xl border transition-all hover:scale-105 active:scale-95 ${rule.isActive ? 'bg-gray-800 border-gray-700 text-green-400 hover:bg-gray-700 hover:text-green-300 hover:border-green-500/30' : 'bg-gray-800 border-gray-700 text-gray-500 hover:bg-gray-700 hover:text-green-400'}`} title={rule.isActive ? "Disable Rule" : "Enable Rule"}>{rule.isActive ? <Power size={18} /> : <PowerOff size={18} />}</button>
                              <button onClick={() => softDeleteRule(rule._id)} className="p-2 rounded-xl bg-gray-800 border border-gray-700 text-gray-500 hover:bg-red-500/10 hover:text-red-400 hover:border-red-500/30 transition-all hover:scale-105 active:scale-95" title="Move to Trash"><Trash2 size={18} /></button>
                            </>
                          )}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        {/* 👥 TAB 2: USER MANAGEMENT */}
        {adminTab === 'users' && (
          <div className="animate-in fade-in slide-in-from-right-4 duration-500">
            {error && <div className="mb-6 p-4 bg-red-500/10 border border-red-500/20 text-red-400 rounded-xl">{error}</div>}
            
            <div className="bg-gray-900 border border-gray-800 rounded-2xl overflow-hidden shadow-2xl">
              <div className="p-5 border-b border-gray-800 bg-gray-900/50 flex justify-between items-center">
                <h2 className="text-lg font-bold flex items-center gap-2"><UserCircle className="w-5 h-5 text-blue-400"/> System Users</h2>
                <button onClick={fetchUsers} className="text-xs text-blue-400 hover:text-blue-300 font-semibold flex items-center gap-1 transition-colors">
                  <RefreshCw size={12} className={loadingUsers ? "animate-spin" : ""} /> Refresh
                </button>
              </div>

              {loadingUsers ? (
                <div className="flex justify-center items-center p-20"><Loader2 className="w-8 h-8 text-blue-500 animate-spin" /></div>
              ) : filteredUsers.length === 0 ? (
                <div className="flex flex-col items-center justify-center p-20 text-gray-500 text-center">
                  <Users className="w-12 h-12 mb-4 opacity-20" />
                  <h3 className="text-lg font-semibold text-gray-400 mb-1">No users found</h3>
                  <p className="text-sm">No users have saved projects to the cloud yet.</p>
                </div>
              ) : (
                <div className="divide-y divide-gray-800/60 max-h-[600px] overflow-y-auto custom-scrollbar">
                  {filteredUsers.map((u, index) => (
                    <div key={u.userId} className="p-5 hover:bg-gray-800/30 transition-colors animate-in fade-in slide-in-from-bottom-2 flex items-center justify-between" style={{ animationDelay: `${index * 50}ms`, animationFillMode: 'both' }}>
                      <div className="flex items-center gap-4">
                        <div className="w-10 h-10 rounded-full bg-blue-900/30 border border-blue-500/20 flex items-center justify-center text-blue-400 font-bold uppercase">
                          {u.email ? u.email.substring(0, 2) : <UserCircle className="w-6 h-6" />}
                        </div>
                        <div>
                          <p className="text-sm font-bold text-white tracking-wide">
                            {u.email || u.userId}
                          </p>
                          <div className="flex items-center gap-1.5 mt-1.5">
                            <Clock size={12} className="text-blue-400/70 shrink-0" />
                            <p className="text-[10px] text-gray-500 font-semibold uppercase tracking-widest">
                              Active: <span className="text-gray-300 font-mono normal-case tracking-normal ml-1">{new Date(u.lastActive).toLocaleString()}</span>
                            </p>
                          </div>
                          {!u.email && <p className="text-[10px] text-gray-600 mt-1">ID: {u.userId}</p>}
                        </div>
                      </div>
                      
                      <div className="flex items-center gap-4">
                        <div className="text-right mr-4 hidden sm:block">
                          <p className="text-xs text-gray-500 uppercase tracking-wider font-bold">Projects</p>
                          <p className="text-lg font-bold text-blue-400">{u.projectCount}</p>
                        </div>
                        <button 
                          onClick={() => setSelectedUser(u)} 
                          className="flex items-center gap-2 bg-gray-800 hover:bg-gray-700 text-white text-sm font-semibold px-4 py-2 rounded-xl transition-all"
                        >
                          View <ChevronRight size={16} className="text-gray-400" />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

      </div>

      {/* 🚀 FLOATING OVERSEER AI BUTTON */}
      <button
        onClick={() => setIsOverseerOpen(true)}
        className={`fixed bottom-8 right-8 z-40 p-4 bg-purple-600 hover:bg-purple-500 text-white rounded-full shadow-[0_0_20px_rgba(168,85,247,0.4)] hover:shadow-[0_0_30px_rgba(168,85,247,0.6)] transition-all duration-300 hover:scale-110 active:scale-95 ${isOverseerOpen ? 'opacity-0 pointer-events-none scale-75' : 'opacity-100 scale-100'}`}
        title="Open Overseer AI"
      >
        <Bot size={28} />
      </button>

      {/* 🚀 FLOATING OVERSEER CHAT WIDGET */}
      <div 
        className={`fixed bottom-8 right-8 z-50 w-96 h-[600px] max-h-[85vh] max-w-[calc(100vw-2rem)] bg-[#0A0C10] border border-gray-800 rounded-2xl shadow-2xl flex flex-col transition-all duration-300 origin-bottom-right ${isOverseerOpen ? 'scale-100 opacity-100 pointer-events-auto' : 'scale-50 opacity-0 pointer-events-none'}`}
      >
        {/* Header */}
        <div className="p-4 border-b border-gray-800 bg-[#0B0D11] flex items-center justify-between rounded-t-2xl shrink-0">
          <div className="flex items-center gap-3">
            <div className="p-1.5 bg-purple-500/20 rounded-lg border border-purple-500/30">
              <ShieldCheck className="text-purple-400 w-4 h-4" />
            </div>
            <div>
              <h2 className="text-sm font-bold text-white tracking-tight">Hive Mind Overseer</h2>
            </div>
          </div>
          <button 
            onClick={() => setIsOverseerOpen(false)} 
            className="p-1 text-gray-400 hover:text-white hover:bg-gray-800 rounded-lg transition-colors"
            title="Minimize"
          >
            <Minus size={18} strokeWidth={2.5} />
          </button>
        </div>

        {/* Chat Log */}
        <div className="flex-1 overflow-y-auto p-4 space-y-4 custom-scrollbar bg-[#0a0a0a]">
          {overseerMessages.map((msg, i) => (
            <div key={i} className={`flex gap-3 max-w-[90%] ${msg.role === 'user' ? 'ml-auto flex-row-reverse' : ''}`}>
              <div className={`w-7 h-7 rounded-lg flex items-center justify-center shrink-0 mt-1 ${msg.role === 'user' ? 'bg-blue-600' : 'bg-purple-600/20 border border-purple-500/30'}`}>
                {msg.role === 'user' ? <ShieldAlert size={14} className="text-white" /> : <Bot size={14} className="text-purple-400" />}
              </div>
              <div className={`p-3 text-[13px] leading-relaxed rounded-2xl ${msg.role === 'user' ? 'bg-blue-600 text-white rounded-tr-sm' : 'bg-[#13151A] border border-gray-800 text-gray-300 rounded-tl-sm shadow-sm'}`}>
                <div dangerouslySetInnerHTML={{ __html: msg.content.replace(/\*\*(.*?)\*\*/g, '<strong class="text-white font-bold">$1</strong>').replace(/\n/g, '<br/>') }} />
              </div>
            </div>
          ))}
          {isOverseerLoading && (
            <div className="flex gap-3 max-w-[80%] animate-in fade-in">
              <div className="w-7 h-7 rounded-lg bg-purple-600/20 border border-purple-500/30 flex items-center justify-center shrink-0">
                <Loader2 size={14} className="text-purple-400 animate-spin" />
              </div>
              <div className="p-3 bg-[#13151A] border border-gray-800 rounded-2xl rounded-tl-sm flex items-center gap-2">
                <div className="w-1.5 h-1.5 bg-purple-400 rounded-full animate-bounce"></div>
                <div className="w-1.5 h-1.5 bg-purple-400 rounded-full animate-bounce" style={{ animationDelay: '0.15s' }}></div>
                <div className="w-1.5 h-1.5 bg-purple-400 rounded-full animate-bounce" style={{ animationDelay: '0.3s' }}></div>
              </div>
            </div>
          )}
          <div ref={chatEndRef} className="h-2" />
        </div>

        {/* Input Area */}
        <div className="p-4 bg-gradient-to-t from-[#0B0D11] to-[#0A0C10] border-t border-gray-800 rounded-b-2xl shrink-0">
          <div className="relative flex items-center bg-gray-900 border border-gray-700 focus-within:border-purple-500 rounded-xl overflow-hidden transition-all shadow-lg focus-within:shadow-[0_0_20px_rgba(168,85,247,0.15)]">
            <input 
              type="text"
              value={overseerInput}
              onChange={(e) => setOverseerInput(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleSendOverseerMessage()}
              placeholder="Scan for duplicate rules..."
              className="flex-1 bg-transparent px-3 py-2.5 text-[13px] text-white outline-none placeholder:text-gray-500"
            />
            <button 
              onClick={handleSendOverseerMessage}
              disabled={!overseerInput.trim() || isOverseerLoading}
              className="px-3 text-purple-400 hover:text-purple-300 disabled:opacity-50 transition-colors"
            >
              <Send size={16} />
            </button>
          </div>
        </div>
      </div>

    </div>
  );
}

export default function AdminDashboardPage() {
  return (
    <Suspense fallback={<div className="flex h-screen bg-gray-950 items-center justify-center"><Loader2 className="w-10 h-10 text-blue-500 animate-spin" /></div>}>
      <AdminDashboardContent />
    </Suspense>
  );
}