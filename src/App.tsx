import React, { useState, useEffect } from "react";
import { BotConfig, BotStatus, DiscordMessage, LogEntry, RealtimePayload } from "./types";
import { BotSetup } from "./components/BotSetup";
import { MessageCard } from "./components/MessageCard";
import { LogConsole } from "./components/LogConsole";
import { MreDispatchPortal } from "./components/MreDispatchPortal";
import {
  MessageSquare,
  Bot,
  Trash2,
  Volume2,
  VolumeX,
  Search,
  Hash,
  Sparkles,
  RefreshCw,
  Image as ImageIcon,
  FileText,
  Radio,
  ExternalLink,
  Lock,
  Unlock,
  LogOut,
  ShieldCheck,
  ShieldAlert,
  User,
  Settings
} from "lucide-react";
import { motion, AnimatePresence } from "motion/react";

// Synthetic electronic chime sound to play when messages are received in real-time
function playSoundChime() {
  try {
    const playState = localStorage.getItem("msg_board_sound");
    if (playState === "false") return;

    const ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
    const osc1 = ctx.createOscillator();
    const osc2 = ctx.createOscillator();
    const gainNode = ctx.createGain();

    osc1.type = "sine";
    osc1.frequency.setValueAtTime(587.33, ctx.currentTime); // D5
    osc1.frequency.exponentialRampToValueAtTime(880, ctx.currentTime + 0.08); // A5

    osc2.type = "triangle";
    osc2.frequency.setValueAtTime(293.66, ctx.currentTime); // D4
    osc2.frequency.exponentialRampToValueAtTime(440, ctx.currentTime + 0.08); // A4

    gainNode.gain.setValueAtTime(0.06, ctx.currentTime);
    gainNode.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.15);

    osc1.connect(gainNode);
    osc2.connect(gainNode);
    gainNode.connect(ctx.destination);

    osc1.start();
    osc2.start();
    osc1.stop(ctx.currentTime + 0.15);
    osc2.stop(ctx.currentTime + 0.15);
  } catch (err) {
    // Sound skipped or context blocked
  }
}

export default function App() {
  // Config & Status states
  const [config, setConfig] = useState<BotConfig & { hasToken: boolean }>({
    botToken: "",
    hasToken: false,
    channelId: "",
  });
  const [status, setStatus] = useState<BotStatus>({
    connected: false,
    status: "offline",
    botName: null,
    botAvatarUrl: null,
    error: null,
    monitoredChannel: null,
  });

  // Data states
  const [messages, setMessages] = useState<DiscordMessage[]>([]);
  const [logs, setLogs] = useState<LogEntry[]>([]);
  
  // Interactive Controls states
  const [searchTerm, setSearchTerm] = useState("");
  const [categoryFilter, setCategoryFilter] = useState<"all" | "media" | "text">("all");
  const [isSoundOn, setIsSoundOn] = useState(true);
  const [activeTab, setActiveTab] = useState<"feed" | "setup">("feed");
  const [isLoading, setIsLoading] = useState(true);
  const [streamError, setStreamError] = useState(false);

  // Authentication State Variables
  const [adminToken, setAdminToken] = useState<string | null>(() => localStorage.getItem("admin_session_token"));
  const [isAdmin, setIsAdmin] = useState<boolean>(false);
  const [userRole, setUserRole] = useState<"admin" | "mod" | null>(null);
  const [currentUsername, setCurrentUsername] = useState<string | null>(null);
  const [showLoginModal, setShowLoginModal] = useState(false);
  const [loginUsername, setLoginUsername] = useState("");
  const [loginPassword, setLoginPassword] = useState("");
  const [loginError, setLoginError] = useState("");
  const [showAuthRequiredAlert, setShowAuthRequiredAlert] = useState(false);

  // Initialize and subscribe to web-sockets SSE endpoint
  useEffect(() => {
    // Check local storage for sound setting
    const savedSound = localStorage.getItem("msg_board_sound");
    if (savedSound !== null) {
      setIsSoundOn(savedSound === "true");
    }

    // Fetch initial parameters and load messages from API safely
    const fetchInitials = async () => {
      try {
        const token = localStorage.getItem("admin_session_token");
        let verifiedAdmin = false;
        let verifiedRole: "admin" | "mod" | null = null;
        let verifiedUsername: string | null = null;

        if (token) {
          try {
            const verifyRes = await fetch("/api/verify-token", {
              headers: { "x-admin-token": token }
            });
            const verifyData = await verifyRes.json();
            if (verifyData.success) {
              verifiedAdmin = true;
              verifiedRole = verifyData.role;
              verifiedUsername = verifyData.username;
              setAdminToken(token);
              setIsAdmin(true);
              setUserRole(verifyData.role);
              setCurrentUsername(verifyData.username);
            } else {
              localStorage.removeItem("admin_session_token");
              setAdminToken(null);
              setIsAdmin(false);
              setUserRole(null);
              setCurrentUsername(null);
            }
          } catch (e) {
            console.error("Token verification offline:", e);
          }
        }

        const headers: Record<string, string> = {};
        if (verifiedAdmin && token) {
          headers["x-admin-token"] = token;
        }

        // Fetch messages (always public)
        const messagesRes = await fetch("/api/messages");
        const msgs = await messagesRes.json();
        setMessages(msgs);

        // Fetch protected panels only if authenticated as master admin "mrzadmin"
        if (verifiedAdmin && token && verifiedUsername?.toLowerCase() === "mrzadmin") {
          const statusRes = await fetch("/api/status", { headers });
          if (statusRes.ok) {
            setStatus(await statusRes.json());
          }

          const [configRes, logsRes] = await Promise.all([
            fetch("/api/config", { headers }),
            fetch("/api/logs", { headers }),
          ]);
          if (configRes.ok) {
            setConfig(await configRes.json());
          }
          if (logsRes.ok) {
            setLogs(await logsRes.json());
          }
        }
      } catch (err) {
        console.error("Failed to load initial data fields:", err);
      } finally {
        setIsLoading(false);
      }
    };

    fetchInitials();

    // Establish real-time EventSource connection
    let eventSource: EventSource | null = null;
    let reconnectTimeout: any = null;

    const connectToEventStream = () => {
      if (eventSource) {
        eventSource.close();
      }

      const streamUrl = adminToken
        ? `/api/stream?token=${encodeURIComponent(adminToken)}`
        : "/api/stream";

      eventSource = new EventSource(streamUrl);

      eventSource.onopen = () => {
        setStreamError(false);
        console.log("Real-time SSE channel established successfully!");
      };

      eventSource.onmessage = (event) => {
        try {
          const payload: RealtimePayload = JSON.parse(event.data);

          switch (payload.type) {
            case "messages_init":
              setMessages(payload.data);
              break;
              
            case "message":
              setMessages((prev) => {
                // Ensure idempotency: avoid inserting duplicates
                if (prev.some((m) => m.id === payload.data.id)) return prev;
                playSoundChime();
                return [payload.data, ...prev];
              });
              break;

            case "message_delete":
              setMessages((prev) => prev.filter((m) => m.id !== payload.data));
              break;

            case "message_update":
              setMessages((prev) => prev.map((m) => m.id === payload.data.id ? { ...m, ...payload.data } : m));
              break;

            case "status":
              setStatus(payload.data);
              break;

            case "log":
              setLogs((prev) => {
                const updated = [payload.data, ...prev];
                return updated.slice(0, 100);
              });
              break;

            default:
              break;
          }
        } catch (parseErr) {
          console.error("Payload decoding failure:", parseErr);
        }
      };

      eventSource.onerror = (e) => {
        console.error("Stream disrupted. Retrying connection in 5 seconds...", e);
        setStreamError(true);
        if (eventSource) {
          eventSource.close();
          eventSource = null;
        }
        reconnectTimeout = setTimeout(connectToEventStream, 5000);
      };
    };

    connectToEventStream();

    return () => {
      if (eventSource) {
        eventSource.close();
      }
      if (reconnectTimeout) {
        clearTimeout(reconnectTimeout);
      }
    };
  }, [adminToken]);

  const handleSaveConfig = async (token: string, channelId: string) => {
    try {
      const headers: Record<string, string> = { "Content-Type": "application/json" };
      if (adminToken) {
        headers["x-admin-token"] = adminToken;
      }
      const response = await fetch("/api/config", {
        method: "POST",
        headers,
        body: JSON.stringify({ botToken: token, channelId }),
      });
      const data = await response.json();
      if (data.success) {
        // Refresh local parameters
        const updatedConfigRes = await fetch("/api/config", { headers });
        const updatedConfig = await updatedConfigRes.json();
        setConfig(updatedConfig);
        return true;
      }
      return false;
    } catch (err) {
      console.error(err);
      return false;
    }
  };

  const handleClearBoard = async () => {
    if (!isAdmin) {
      setShowAuthRequiredAlert(true);
      return;
    }
    try {
      const headers: Record<string, string> = { "Content-Type": "application/json" };
      let url = "/api/clear";
      if (adminToken) {
        headers["x-admin-token"] = adminToken;
        url += `?token=${encodeURIComponent(adminToken)}`;
      }
      await fetch(url, { 
        method: "POST", 
        headers,
        body: JSON.stringify({ token: adminToken })
      });
    } catch (err) {
      console.error(err);
    }
  };

  const handleDeleteMessage = async (id: string): Promise<boolean> => {
    try {
      const headers: Record<string, string> = {};
      let url = `/api/messages/${encodeURIComponent(id)}`;
      if (adminToken) {
        headers["x-admin-token"] = adminToken;
        url += `?token=${encodeURIComponent(adminToken)}`;
      }
      const response = await fetch(url, {
        method: "DELETE",
        headers,
      });
      const data = await response.json();
      return !!data.success;
    } catch (err) {
      console.error("Failed to delete message individually:", err);
      return false;
    }
  };

  const handleUpdateMessage = async (id: string, updatedData: Partial<DiscordMessage>): Promise<boolean> => {
    try {
      const headers: Record<string, string> = { "Content-Type": "application/json" };
      let url = `/api/messages/${encodeURIComponent(id)}`;
      if (adminToken) {
        headers["x-admin-token"] = adminToken;
        url += `?token=${encodeURIComponent(adminToken)}`;
      }
      const response = await fetch(url, {
        method: "PATCH",
        headers,
        body: JSON.stringify({ ...updatedData, token: adminToken }),
      });
      const data = await response.json();
      return !!data.success;
    } catch (err) {
      console.error("Failed to update message individually:", err);
      return false;
    }
  };

  const handleSendCustomMessage = async (payload: {
    authorName: string;
    authorTag: string;
    authorAvatar: string | null;
    content: string;
    attachments: any[];
    customBoxColor?: string;
    customGlow?: boolean;
  }): Promise<boolean> => {
    try {
      const headers: Record<string, string> = { "Content-Type": "application/json" };
      let url = "/api/custom-message";
      if (adminToken) {
        headers["x-admin-token"] = adminToken;
        url += `?token=${encodeURIComponent(adminToken)}`;
      }
      const response = await fetch(url, {
        method: "POST",
        headers,
        body: JSON.stringify({ ...payload, token: adminToken }),
      });
      const data = await response.json();
      return !!data.success;
    } catch (err) {
      console.error("Failed to broadcast custom message:", err);
      return false;
    }
  };

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoginError("");
    try {
      const response = await fetch("/api/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ 
          username: loginUsername.trim(), 
          password: loginPassword.trim() 
        }),
      });
      
      const data = await response.json();
      if (response.ok && data.success) {
        localStorage.setItem("admin_session_token", data.token);
        setAdminToken(data.token);
        setIsAdmin(true);
        setUserRole(data.role);
        setCurrentUsername(data.username);
        setShowLoginModal(false);
        setLoginUsername("");
        setLoginPassword("");
        
        // Fetch protected panels according to role - only master admin "mrzadmin" can access
        if (data.username?.toLowerCase() === "mrzadmin") {
          const headers = { "x-admin-token": data.token };
          
          const statusRes = await fetch("/api/status", { headers });
          if (statusRes.ok) setStatus(await statusRes.json());

          const [configRes, logsRes] = await Promise.all([
            fetch("/api/config", { headers }),
            fetch("/api/logs", { headers }),
          ]);
          if (configRes.ok) setConfig(await configRes.json());
          if (logsRes.ok) setLogs(await logsRes.json());
        }
      } else {
        setLoginError(data.error || "Credentials authorization rejected.");
      }
    } catch (err) {
      console.error(err);
      setLoginError("Verification server offline. Try again later.");
    }
  };

  const handleLogout = async () => {
    try {
      if (adminToken) {
        await fetch("/api/logout", {
          method: "POST",
          headers: { "x-admin-token": adminToken }
        });
      }
    } catch (e) {
      console.error("Logout request failure:", e);
    }
    localStorage.removeItem("admin_session_token");
    setAdminToken(null);
    setIsAdmin(false);
    setUserRole(null);
    setCurrentUsername(null);
    
    // Purge cached configurations and panels to hide sensitive outputs from other web viewers
    setConfig({ botToken: "", hasToken: false, channelId: "" });
    setStatus({
      connected: false,
      status: "offline",
      botName: null,
      botAvatarUrl: null,
      error: null,
      monitoredChannel: null,
    });
    setLogs([]);
  };

  const toggleSound = () => {
    const newState = !isSoundOn;
    setIsSoundOn(newState);
    localStorage.setItem("msg_board_sound", String(newState));
  };

  // Filter computation logic
  const filteredMessages = messages.filter((msg) => {
    // 1. Text Query Filter
    const matchesQuery =
      msg.content.toLowerCase().includes(searchTerm.toLowerCase()) ||
      msg.authorName.toLowerCase().includes(searchTerm.toLowerCase()) ||
      msg.authorTag.toLowerCase().includes(searchTerm.toLowerCase());

    if (!matchesQuery) return false;

    // 2. Category Filter
    if (categoryFilter === "media") {
      return msg.attachments && msg.attachments.length > 0;
    }
    if (categoryFilter === "text") {
      return !msg.attachments || msg.attachments.length === 0;
    }

    return true;
  });

  return (
    <div className="min-h-screen bg-black text-amber-50/90 font-sans relative overflow-x-hidden min-w-[320px]" id="discord-sync-app">
      {/* Dynamic Liquid Glass Ambient Background Orbs */}
      <div className="fluid-orb-1" />
      <div className="fluid-orb-2" />
      <div className="fluid-orb-3" />

      {/* Top Navigation Hub Bar in Yellow Liquid Glass styling */}
      <nav className="liquid-glass-navbar sticky top-0 z-40">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between h-16">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl overflow-hidden border border-amber-300 shadow-md shadow-amber-200/50 hover:scale-105 transition-transform duration-350">
                <img 
                  src="https://i.imgur.com/uL8SqeX.jpeg" 
                  alt="MRZ GALLERY Logo" 
                  className="w-full h-full object-cover" 
                  referrerPolicy="no-referrer" 
                />
              </div>
              <div>
                <h1 className="text-sm font-black font-display tracking-widest text-amber-400 flex items-center gap-1.5 leading-none sm:text-base">
                  <span>MRZ GALLERY</span>
                </h1>
                <p className="text-[10px] sm:text-[11px] text-amber-200/50 font-medium mt-0.5 flex items-center gap-1.5 select-none">
                  <span className={`inline-block w-2 h-2 rounded-full ${streamError ? "bg-red-500 animate-ping" : "bg-amber-500 animate-pulse-gold shadow-xs shadow-amber-405"}`} />
                  <span>{streamError ? "Reconnecting..." : "Active stream synced"}</span>
                </p>
              </div>
            </div>

            {/* Device-adaptive Layout tab indicators */}
            <div className="flex items-center gap-2">
              <button
                onClick={toggleSound}
                className={`p-2 rounded-lg transition-colors cursor-pointer ${isSoundOn ? "bg-amber-405/20 text-amber-300 hover:bg-amber-400/30" : "bg-white/5 hover:bg-white/10 text-amber-500/50"}`}
                title={isSoundOn ? "Mute notification chime" : "Unmute notification chime"}
              >
                {isSoundOn ? <Volume2 className="w-4 h-4" /> : <VolumeX className="w-4 h-4" />}
              </button>

              {isAdmin && (
                <>
                  <button
                    onClick={handleClearBoard}
                    className="p-2 text-amber-300/40 hover:text-red-500 bg-white/5 hover:bg-red-950/30 rounded-lg transition-all cursor-pointer"
                    title="Clear Web Feed list"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>

                  <a
                    href="https://discord.com/developers/applications"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="hidden sm:inline-flex items-center gap-1.5 text-xs font-semibold text-amber-200/80 bg-amber-400/10 py-2 px-3 rounded-lg hover:bg-amber-400/20 transition border border-amber-300/20"
                  >
                    <span>Discord Portal</span>
                    <ExternalLink className="w-3.5 h-3.5" />
                  </a>
                </>
              )}

              {/* Login Action Area */}
              <div className="border-l border-amber-200/20 pl-2.5 ml-1.5 flex items-center">
                {isAdmin ? (
                  <div className="flex items-center gap-2">
                    <span className="hidden sm:inline-flex items-center gap-1 px-2.5 py-1.5 bg-amber-400/10 text-amber-300 border border-amber-400/20 rounded-lg text-xs font-semibold select-none transition">
                      <ShieldCheck className="w-3.5 h-3.5 text-amber-400" />
                      <span>Admin Status</span>
                    </span>
                    <button
                      onClick={handleLogout}
                      className="p-2 text-amber-400/60 hover:text-red-500 bg-white/5 hover:bg-red-950/30 rounded-lg transition-all cursor-pointer"
                      title="Log Out of Admin"
                    >
                      <LogOut className="w-4 h-4" />
                    </button>
                  </div>
                ) : (
                  <button
                    onClick={() => {
                      setShowLoginModal(true);
                      setLoginError("");
                    }}
                    className="inline-flex items-center gap-1.5 text-xs font-bold text-amber-100 bg-amber-500/20 border border-amber-400/40 hover:bg-amber-500/30 hover:border-amber-400/80 py-2 px-3 rounded-lg transition-all cursor-pointer shadow-3xs"
                  >
                    <Lock className="w-3.5 h-3.5 text-amber-300" />
                    <span>Admin</span>
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>
      </nav>

      {/* Primary Container Body */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
        {/* Loading Handshake block */}
        {isLoading ? (
          <div className="flex flex-col items-center justify-center py-20 gap-4" id="loading-state">
            <RefreshCw className="w-8 h-8 text-amber-500 animate-spin" />
            <p className="text-sm text-amber-200/70 font-medium">Linking database and establishing event source stream...</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
            
            {/* Left side: Setup configurations panel - Restricted to authenticated operators */}
            {isAdmin && (
              <section className="lg:col-span-4 space-y-6" id="dashboard-setup-pane">
                {/* Manual MSG & POV Dispatch Portal (Accessible to both admins and mods) */}
                <MreDispatchPortal
                  token={adminToken}
                  pageLogo="https://i.imgur.com/uL8SqeX.jpeg"
                  onSendCustomMessage={handleSendCustomMessage}
                />

                {currentUsername?.toLowerCase() === "mrzadmin" && (
                  <>
                    <div className="liquid-glass-yellow-card rounded-xl p-5 space-y-4">
                      <div className="flex items-center gap-2 pb-2 border-b border-amber-200/50">
                        <Bot className="w-4.5 h-4.5 text-amber-400" />
                        <h3 className="text-xs font-bold font-mono tracking-wider uppercase text-amber-300">
                          System Gateway Node
                        </h3>
                      </div>
     
                      {/* Active Bio Panel */}
                      <div className="flex items-center gap-3.5 p-1">
                        <div className="w-14 h-14 rounded-full bg-white/5 flex items-center justify-center border border-amber-400/20 shadow-sm text-emerald-400">
                          <span className="flex h-2.5 w-2.5 rounded-full bg-emerald-500 animate-pulse" />
                        </div>
                        <div className="min-w-0">
                          <h4 className="font-bold text-amber-100 text-sm truncate">
                            Web Dispatch Server
                          </h4>
                          <p className="text-[10px] font-bold uppercase mt-1 inline-flex items-center px-2 py-0.5 rounded-full bg-emerald-400/20 text-emerald-300">
                            ONLINE
                          </p>
                        </div>
                      </div>
                    </div>

                    {/* BotSetup Component for forms and Sandbox Simulator */}
                    <BotSetup
                      config={config}
                      status={status}
                      onSaveConfig={handleSaveConfig}
                      onClearBoard={handleClearBoard}
                    />

                    {/* LogConsole Component for live dev outputs */}
                    <LogConsole logs={logs} />
                  </>
                )}
              </section>
            )}

            {/* Right side: Core interactive synced message Board */}
            <section className={isAdmin ? "lg:col-span-8 space-y-5" : "lg:col-span-12 max-w-3xl mx-auto w-full space-y-5"} id="dashboard-feed-pane">
              {/* Header search / configuration panel */}
              <div className="liquid-glass-card p-4 rounded-xl flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                
                {/* Search Bar filter */}
                <div className="relative flex-1 max-w-md">
                  <Search className="w-4 h-4 text-amber-400/60 absolute left-3 top-1/2 -translate-y-1/2" />
                  <input
                    type="text"
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    placeholder="Search synced messages, tags, or usernames..."
                    className="w-full text-xs font-sans pl-9.5 pr-4 py-2.5 bg-white/5 border border-amber-400/20 rounded-lg outline-none focus:border-amber-400/50 focus:bg-white/10 transition-all text-white placeholder-amber-100/30 font-medium"
                  />
                  {searchTerm && (
                    <button
                      onClick={() => setSearchTerm("")}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-[10px] text-amber-400 hover:text-amber-200 font-extrabold cursor-pointer"
                    >
                      Clear
                    </button>
                  )}
                </div>

                {/* Category filtration pills */}
                <div className="flex gap-1.5 flex-shrink-0 bg-amber-400/10 p-1 rounded-lg border border-amber-400/20">
                  <button
                    onClick={() => setCategoryFilter("all")}
                    className={`py-1.5 px-3 rounded-md text-[11px] font-bold transition-all cursor-pointer ${categoryFilter === "all" ? "bg-amber-400 text-amber-950 shadow-2xs font-black" : "text-amber-400/60 hover:text-amber-300"}`}
                  >
                    All Posts
                  </button>
                  <button
                    onClick={() => setCategoryFilter("media")}
                    className={`py-1.5 px-3 rounded-md text-[11px] font-bold transition-all cursor-pointer flex items-center gap-1 ${categoryFilter === "media" ? "bg-amber-400 text-amber-950 shadow-2xs font-black" : "text-amber-400/60 hover:text-amber-300"}`}
                  >
                    <ImageIcon className={`w-3 h-3 ${categoryFilter === "media" ? "text-amber-950" : "text-amber-400/65"}`} />
                    <span>Media Only</span>
                  </button>
                  <button
                    onClick={() => setCategoryFilter("text")}
                    className={`py-1.5 px-3 rounded-md text-[11px] font-bold transition-all cursor-pointer flex items-center gap-1 ${categoryFilter === "text" ? "bg-amber-400 text-amber-950 shadow-2xs font-black" : "text-amber-400/60 hover:text-amber-300"}`}
                  >
                    <FileText className={`w-3 h-3 ${categoryFilter === "text" ? "text-amber-950" : "text-amber-400/65"}`} />
                    <span>Chat Only</span>
                  </button>
                </div>
              </div>

              {/* Feed lists */}
              <div className="space-y-4">
                <AnimatePresence mode="popLayout">
                  {filteredMessages.length === 0 ? (
                    <motion.div
                      initial={{ opacity: 0, scale: 0.95 }}
                      animate={{ opacity: 1, scale: 1 }}
                      exit={{ opacity: 0 }}
                      className="liquid-glass-card p-12 rounded-xl text-center space-y-3.5"
                    >
                      <div className="w-14 h-14 rounded-full bg-amber-400/10 border border-amber-400/20 flex items-center justify-center mx-auto text-amber-400">
                        <MessageSquare className="w-6 h-6 text-amber-400" />
                      </div>
                      <div className="max-w-md mx-auto">
                        <h4 className="text-sm font-semibold text-amber-100 font-display">
                          No Synced Content Found
                        </h4>
                        <p className="text-xs text-amber-200/60 leading-relaxed mt-1">
                          {searchTerm || categoryFilter !== "all"
                            ? "Adjust your search inputs or classification categories to display messages."
                            : "This board is currently empty. Authenticate as Admin to configure bot sync and view logs."}
                        </p>
                      </div>
                    </motion.div>
                  ) : (
                    filteredMessages.map((message) => (
                      <MessageCard 
                        key={message.id} 
                        message={message} 
                        isAdmin={isAdmin}
                        isFullAdmin={currentUsername?.toLowerCase() === "mrzadmin"}
                        onDelete={handleDeleteMessage}
                        onUpdate={handleUpdateMessage}
                      />
                    ))
                  )}
                </AnimatePresence>
              </div>
            </section>

          </div>
        )}
      </main>

      {/* Admin Login Modal Backdrop Overlay */}
      <AnimatePresence>
        {showLoginModal && (
          <div className="fixed inset-0 bg-black/60 backdrop-blur-md z-50 flex items-center justify-center p-4" id="login-modal-overlay">
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 15 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 15 }}
              className="bg-neutral-900/95 backdrop-blur-xl rounded-2xl border border-amber-400/20 shadow-2xl max-w-sm w-full p-6 space-y-5 relative"
            >
              <div className="text-center space-y-2">
                <div className="w-12 h-12 rounded-xl bg-amber-400/10 border border-amber-400/20 flex items-center justify-center mx-auto text-amber-400">
                  <Lock className="w-5.5 h-5.5" />
                </div>
                <h3 className="text-base font-black font-display text-amber-100">
                  Admin Access
                </h3>
                <p className="text-xs text-amber-200/60 font-medium">
                  Authenticate credentials to link nodes, read console outputs, and regulate server parameters.
                </p>
              </div>

              <form onSubmit={handleLogin} className="space-y-4">
                <div className="space-y-1.5">
                  <label className="text-[11px] font-bold text-amber-400/80 uppercase tracking-wider block">
                    Username
                  </label>
                  <input
                    type="text"
                    required
                    value={loginUsername}
                    onChange={(e) => setLoginUsername(e.target.value)}
                    placeholder="Enter login username..."
                    className="w-full text-xs font-sans px-3 py-2.5 bg-black/60 border border-amber-450/20 rounded-lg outline-none focus:border-amber-400 focus:bg-black/80 transition-all text-white placeholder-amber-100/20 font-medium"
                  />
                </div>

                <div className="space-y-1.5">
                  <div className="flex justify-between items-center">
                    <label className="text-[11px] font-bold text-amber-400/80 uppercase tracking-wider block">
                      Password
                    </label>
                  </div>
                  <input
                    type="password"
                    required
                    value={loginPassword}
                    onChange={(e) => setLoginPassword(e.target.value)}
                    placeholder="Enter secret password..."
                    className="w-full text-xs font-sans px-3 py-2.5 bg-black/60 border border-amber-450/20 rounded-lg outline-none focus:border-amber-400 focus:bg-black/80 transition-all text-white placeholder-amber-100/20 font-medium"
                  />
                </div>

                {loginError && (
                  <div className="p-3 bg-red-950/40 border border-red-900/40 text-[11px] text-red-400 rounded-lg font-medium flex items-center gap-1.5 leading-snug">
                    <ShieldAlert className="w-4 h-4 flex-shrink-0" />
                    <span>{loginError}</span>
                  </div>
                )}

                <div className="flex gap-2.5 pt-2">
                  <button
                    type="button"
                    onClick={() => setShowLoginModal(false)}
                    className="flex-1 cursor-pointer py-2.5 px-4 border border-amber-400/20 hover:bg-white/5 rounded-xl text-amber-300 text-xs font-semibold transition bg-transparent"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className="flex-1 cursor-pointer py-2.5 px-4 btn-gel-primary rounded-xl text-xs font-bold transition"
                  >
                    Sign In
                  </button>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Auth required notification banner */}
      <AnimatePresence>
        {showAuthRequiredAlert && (
          <motion.div
            initial={{ opacity: 0, y: 50, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 50, scale: 0.95 }}
            className="fixed bottom-6 right-6 z-50 max-w-sm bg-white rounded-xl border border-red-100 shadow-xl p-4 flex gap-3 items-start"
          >
            <div className="p-2 rounded-lg bg-red-50 text-red-600">
              <Lock className="w-4.5 h-4.5" />
            </div>
            <div className="flex-1">
              <h4 className="text-xs font-bold text-slate-900 leading-none">Authentication Required</h4>
              <p className="text-[11px] text-slate-500 mt-1 leading-snug">
                Only authorized administrators can override gateway configs or clear information feeds.
              </p>
              <div className="mt-3 flex gap-2">
                <button
                  onClick={() => {
                    setShowAuthRequiredAlert(false);
                    setShowLoginModal(true);
                    setLoginError("");
                  }}
                  className="text-[11px] font-bold text-indigo-600 hover:text-indigo-700 cursor-pointer"
                >
                  Sign In Now
                </button>
                <button
                  onClick={() => setShowAuthRequiredAlert(false)}
                  className="text-[11px] font-bold text-slate-400 hover:text-slate-500 cursor-pointer"
                >
                  Dismiss
                </button>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

    </div>
  );
}
