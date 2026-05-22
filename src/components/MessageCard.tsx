import React, { useState } from "react";
import { DiscordMessage, DiscordAttachment } from "../types";
import { 
  Download, 
  FileText, 
  Image as ImageIcon, 
  Music, 
  Play, 
  Video, 
  Maximize2, 
  ExternalLink,
  Trash2,
  Edit3,
  Palette,
  Check,
  X,
  Calendar,
  Sparkles,
  User,
  Clock
} from "lucide-react";
import { motion, AnimatePresence } from "motion/react";

interface MessageCardProps {
  message: DiscordMessage;
  isAdmin?: boolean;
  isFullAdmin?: boolean;
  onDelete?: (id: string) => Promise<boolean>;
  onUpdate?: (id: string, updatedData: Partial<DiscordMessage>) => Promise<boolean>;
}

export function parseDiscordMarkdown(content: string): string {
  if (!content) return "";
  
  // XSS protection and sanitizer
  let text = content
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");

  // Bold-Italic (***text*** or ___text___)
  text = text.replace(/\*\*\*([^*]+)\*\*\*/g, "<strong><em>$1</em></strong>");
  text = text.replace(/___([^_]+)___/g, "<strong><em>$1</em></strong>");

  // Bold (**text** or __text__)
  text = text.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");
  text = text.replace(/__([^_]+)__/g, "<strong>$1</strong>");

  // Italics (*text* or _text_)
  text = text.replace(/\*([^*]+)\*/g, "<em>$1</em>");
  text = text.replace(/_([^_]+)_/g, "<em>$1</em>");

  // Strikethrough (~~text~~)
  text = text.replace(/~~([^~]+)~~/g, "<del>$1</del>");

  // Multiline code blocks (```lang ... ```)
  text = text.replace(/```(?:[a-zA-Z]+)?\n([\s\S]+?)\n```/g, '<pre class="bg-[#1e1f22] text-[#e3e5e8] p-3 rounded-md font-mono text-xs overflow-x-auto my-2 border border-black/20 whitespace-pre"><code>$1</code></pre>');

  // Inline code block (`code`)
  text = text.replace(/`([^`]+)`/g, '<code class="bg-black/10 dark:bg-black/20 text-[#e06c75] px-1.5 py-0.5 rounded font-mono text-xs">$1</code>');

  // Quote block (starts with >)
  const lines = text.split("\n");
  const parsedLines = lines.map(line => {
    if (line.startsWith("&gt; ")) {
      return `<blockquote class="border-l-4 border-amber-400 pl-3 italic text-amber-200/80 my-1 bg-amber-500/10 py-0.5 rounded-r">${line.substring(5)}</blockquote>`;
    }
    return line;
  });
  text = parsedLines.join("<br />");

  // Clickable links
  const urlRegex = /(https?:\/\/[^\s]+)/g;
  text = text.replace(urlRegex, '<a href="$1" target="_blank" rel="noopener noreferrer" class="text-amber-400 hover:text-amber-300 hover:underline inline-flex items-center gap-0.5 font-bold">$1 <span class="text-[10px]">↗</span></a>');

  return text;
}

export function formatBytes(bytes: number): string {
  if (bytes === 0) return "0 Bytes";
  const k = 1024;
  const sizes = ["Bytes", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + " " + sizes[i];
}

export const MessageCard: React.FC<MessageCardProps> = ({ message, isAdmin, isFullAdmin, onDelete, onUpdate }) => {
  const [lightboxImage, setLightboxImage] = useState<string | null>(null);

  // Editing state controls
  const [showEditModal, setShowEditModal] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [editAuthorName, setEditAuthorName] = useState(message.authorName);
  const [editAuthorAvatar, setEditAuthorAvatar] = useState(message.authorAvatar || "");
  const [editAuthorTag, setEditAuthorTag] = useState(message.authorTag);
  const [editCreatedAt, setEditCreatedAt] = useState(() => {
    try {
      // Format as local datetime-local string (YYYY-MM-DDThh:mm)
      const d = new Date(message.createdAt);
      const year = d.getFullYear();
      const month = String(d.getMonth() + 1).padStart(2, "0");
      const day = String(d.getDate()).padStart(2, "0");
      const hours = String(d.getHours()).padStart(2, "0");
      const minutes = String(d.getMinutes()).padStart(2, "0");
      return `${year}-${month}-${day}T${hours}:${minutes}`;
    } catch (e) {
      return "";
    }
  });
  const [editContent, setEditContent] = useState(message.content);
  const [editBoxColor, setEditBoxColor] = useState(message.customBoxColor || "default");
  const [editGlow, setEditGlow] = useState(!!message.customGlow);
  const [isSaving, setIsSaving] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");

  // Sync state with message changes
  React.useEffect(() => {
    setEditAuthorName(message.authorName);
    setEditAuthorAvatar(message.authorAvatar || "");
    setEditAuthorTag(message.authorTag);
    setEditContent(message.content);
    setEditBoxColor(message.customBoxColor || "default");
    setEditGlow(!!message.customGlow);
    try {
      const d = new Date(message.createdAt);
      const year = d.getFullYear();
      const month = String(d.getMonth() + 1).padStart(2, "0");
      const day = String(d.getDate()).padStart(2, "0");
      const hours = String(d.getHours()).padStart(2, "0");
      const minutes = String(d.getMinutes()).padStart(2, "0");
      setEditCreatedAt(`${year}-${month}-${day}T${hours}:${minutes}`);
    } catch (e) {
      // skip
    }
  }, [message]);

  // Helper to categorize attachments
  const categorizeAttachment = (att: DiscordAttachment) => {
    const type = att.contentType?.toLowerCase() || "";
    const ext = att.name.split(".").pop()?.toLowerCase() || "";
    
    if (type.startsWith("image/") || ["jpg", "jpeg", "png", "gif", "webp", "svg"].includes(ext)) {
      return "image";
    }
    if (type.startsWith("video/") || ["mp4", "webm", "ogg", "mov"].includes(ext)) {
      return "video";
    }
    if (type.startsWith("audio/") || ["mp3", "wav", "ogg", "m4a", "flac"].includes(ext)) {
      return "audio";
    }
    return "document";
  };

  const formattedTime = new Date(message.createdAt).toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit"
  });

  const formattedDate = new Date(message.createdAt).toLocaleDateString([], {
    month: "short",
    day: "numeric",
    year: "numeric"
  });

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editAuthorName.trim()) {
      setErrorMessage("Sender name cannot be empty");
      return;
    }
    setIsSaving(true);
    setErrorMessage("");
    try {
      if (onUpdate) {
        const success = await onUpdate(message.id, {
          authorName: editAuthorName.trim(),
          authorAvatar: editAuthorAvatar.trim() || null,
          authorTag: editAuthorTag.trim(),
          createdAt: new Date(editCreatedAt).toISOString(),
          content: editContent,
          customBoxColor: editBoxColor,
          customGlow: editGlow
        });
        if (success) {
          setShowEditModal(false);
        } else {
          setErrorMessage("Failed to save changes. Verify admin credentials.");
        }
      }
    } catch (err) {
      setErrorMessage("Error occurred during saving procedure.");
    } finally {
      setIsSaving(false);
    }
  };

  const handleDelete = async () => {
    setIsSaving(true);
    try {
      if (onDelete) {
        const success = await onDelete(message.id);
        if (success) {
          setShowEditModal(false);
          setShowDeleteConfirm(false);
        } else {
          setErrorMessage("Failed to delete. Verify admin credentials.");
        }
      }
    } catch (err) {
      setErrorMessage("Error during deletion.");
    } finally {
      setIsSaving(false);
    }
  };

  const getCardStyle = () => {
    let baseStyles = "group relative flex gap-4 p-5 rounded-2xl transition-all duration-300 ";
    
    const colors: Record<string, { bgBorderClass: string, glow: string }> = {
      default: {
        bgBorderClass: "liquid-glass-card",
        glow: "shadow-[0_0_22px_rgba(251,191,36,0.22)] border-amber-400"
      },
      emerald: {
        bgBorderClass: "bg-[#04200c]/82 backdrop-blur-xl border border-emerald-500/25 shadow-lg",
        glow: "shadow-[0_0_24px_rgba(16,185,129,0.3)] border-emerald-500/50"
      },
      crimson: {
        bgBorderClass: "bg-[#200606]/82 backdrop-blur-xl border border-red-500/25 shadow-lg",
        glow: "shadow-[0_0_24px_rgba(239,68,68,0.3)] border-red-500/50"
      },
      cyan: {
        bgBorderClass: "bg-[#061820]/82 backdrop-blur-xl border border-cyan-500/25 shadow-lg",
        glow: "shadow-[0_0_24px_rgba(6,182,212,0.3)] border-cyan-500/50"
      },
      purple: {
        bgBorderClass: "bg-[#140620]/82 backdrop-blur-xl border border-purple-500/25 shadow-lg",
        glow: "shadow-[0_0_24px_rgba(168,85,247,0.3)] border-purple-500/50"
      },
      gold: {
        bgBorderClass: "bg-[#1f1604]/82 backdrop-blur-xl border border-amber-500/35 shadow-lg",
        glow: "shadow-[0_0_25px_rgba(245,158,11,0.35)] border-amber-500/50"
      }
    };

    const scheme = colors[message.customBoxColor || "default"] || colors.default;

    if (message.customBoxColor && colors[message.customBoxColor]) {
      baseStyles += scheme.bgBorderClass;
    } else {
      baseStyles += "liquid-glass-card";
    }

    if (message.customGlow) {
      baseStyles += ` ${scheme.glow}`;
    }

    return baseStyles;
  };

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 15 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -15 }}
      className={getCardStyle()}
      id={`msg-card-${message.id}`}
    >


      {/* User Avatar */}
      <div className="flex-shrink-0">
        {message.authorAvatar ? (
          <img
            src={message.authorAvatar}
            alt={message.authorName}
            referrerPolicy="no-referrer"
            className="w-12 h-12 rounded-full object-cover ring-2 ring-amber-200 bg-amber-50 shadow-sm"
          />
        ) : (
          <div className="w-12 h-12 rounded-full bg-amber-100 text-amber-700 font-bold flex items-center justify-center ring-2 ring-amber-200 shadow-sm">
            {message.authorName.charAt(0).toUpperCase()}
          </div>
        )}
      </div>

      {/* Message Content */}
      <div className="flex-1 min-w-0">
        <div className="flex items-baseline gap-2 mb-1">
          <span className="font-extrabold text-yellow-300 text-sm hover:underline cursor-pointer uppercase tracking-wide drop-shadow-[0_0_10px_rgba(253,224,71,0.85)]">
            {message.authorName}
          </span>
          <span className="text-[10px] text-amber-200/50 font-mono hidden sm:inline">
            @{message.authorTag}
          </span>
          <span className="text-[11px] text-amber-200/40 font-medium ml-1">
            {formattedDate} • {formattedTime}
          </span>
        </div>

        {/* Text Area */}
        {message.content && (
          <div
            className="text-amber-50/90 text-sm leading-relaxed whitespace-pre-wrap break-words"
            dangerouslySetInnerHTML={{ __html: parseDiscordMarkdown(message.content) }}
          />
        )}

        {/* Media elements */}
        {message.attachments.length > 0 && (
          <div className="mt-3 grid gap-3 max-w-full sm:max-w-2xl">
            {message.attachments.map((att) => {
              const type = categorizeAttachment(att);

              if (type === "image") {
                return (
                  <div key={att.id} className="relative group/media max-w-lg mt-1 overflow-hidden rounded-lg border border-slate-100 bg-slate-50 shadow-xs">
                    <img
                      src={att.url}
                      alt={att.name}
                      referrerPolicy="no-referrer"
                      className="w-full max-h-96 object-contain hover:scale-102 transition-transform duration-500 cursor-zoom-in"
                      onClick={() => setLightboxImage(att.url)}
                    />
                    <div className="absolute top-2 right-2 flex gap-1 opacity-100 sm:opacity-0 group-hover/media:opacity-100 transition-opacity duration-200">
                      <button
                        onClick={() => setLightboxImage(att.url)}
                        title="Zoom Image"
                        className="bg-black/65 backdrop-blur-xs text-white p-1.5 rounded hover:bg-black/80 shadow-xs"
                      >
                        <Maximize2 className="w-3.5 h-3.5" />
                      </button>
                      <a
                        href={att.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        download={att.name}
                        title="Download Source"
                        className="bg-black/65 backdrop-blur-xs text-white p-1.5 rounded hover:bg-black/80 shadow-xs"
                      >
                        <Download className="w-3.5 h-3.5" />
                      </a>
                    </div>
                    <div className="p-2 bg-[#121212] border-t border-amber-500/10 text-[11px] text-amber-200/60 font-mono truncate flex items-center gap-1.5">
                      <ImageIcon className="w-3.5 h-3.5 text-amber-500/80" />
                      <span>{att.name}</span>
                      <span className="text-amber-550/30">•</span>
                      <span>{formatBytes(att.size)}</span>
                    </div>
                  </div>
                );
              }

              if (type === "video") {
                return (
                  <div key={att.id} className="w-full max-w-lg mt-1 overflow-hidden rounded-lg border border-amber-200/30 shadow-xs bg-slate-950">
                    <video
                      src={att.url}
                      controls
                      preload="metadata"
                      referrerPolicy="no-referrer"
                      className="w-full max-h-[350px] object-contain block focus:outline-hidden"
                    />
                    <div className="p-2 bg-slate-900 border-t border-slate-850 text-[11px] text-slate-400 font-mono truncate flex items-center gap-1.5">
                      <Video className="w-3.5 h-3.5 text-amber-500" />
                      <span className="text-slate-200">{att.name}</span>
                      <span className="text-slate-755">•</span>
                      <span>{formatBytes(att.size)}</span>
                    </div>
                  </div>
                );
              }

              if (type === "audio") {
                return (
                  <div key={att.id} className="w-full max-w-lg mt-1 p-3 rounded-lg border border-amber-500/10 bg-white/5 flex flex-col gap-2 shadow-xs">
                    <div className="flex items-center gap-2 text-xs font-mono text-amber-200/80 truncate">
                      <Music className="w-4 h-4 text-amber-400 flex-shrink-0 animate-pulse" />
                      <span className="font-semibold truncate">{att.name}</span>
                      <span className="text-amber-500/40">•</span>
                      <span>{formatBytes(att.size)}</span>
                    </div>
                    <audio src={att.url} controls referrerPolicy="no-referrer" className="w-full h-8 block focus:outline-hidden opacity-90 brightness-95" />
                  </div>
                );
              }

              // Default standard binary/doc binary downloader card
              return (
                <div
                  key={att.id}
                  className="w-full max-w-md mt-1 p-3 rounded-lg border border-amber-500/10 bg-[#121212]/60 shadow-xs hover:border-amber-400/30 hover:bg-[#121212]/90 transition-colors flex items-center gap-3"
                >
                  <div className="w-10 h-10 rounded-lg bg-white/5 flex items-center justify-center flex-shrink-0 border border-amber-500/15">
                    <FileText className="w-5 h-5 text-amber-500/80" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-xs font-mono font-medium text-amber-100 truncate" title={att.name}>
                      {att.name}
                    </p>
                    <p className="text-[10px] text-amber-400/50 font-mono">
                      {formatBytes(att.size)} • {att.contentType || "Binary File"}
                    </p>
                  </div>
                  <div className="flex gap-1 flex-shrink-0">
                    <a
                      href={att.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="p-1.5 rounded-lg hover:bg-amber-400/10 text-amber-400/70 hover:text-amber-200 transition-colors"
                      title="Open Link"
                    >
                      <ExternalLink className="w-4 h-4" />
                    </a>
                    <a
                      href={att.url}
                      download={att.name}
                      className="p-1.5 rounded-lg hover:bg-amber-400/10 text-amber-400/70 hover:text-amber-200 transition-colors"
                      title="Download File"
                    >
                      <Download className="w-4 h-4" />
                    </a>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Admin Action Menu Overlay */}
      {isAdmin && (
        <div className="absolute top-4 right-4 flex items-center gap-1.5 opacity-0 group-hover:opacity-100 focus-within:opacity-100 transition-opacity duration-200 z-10 bg-black/80 backdrop-blur-md p-1 px-1.5 rounded-lg border border-amber-500/20 shadow-lg">
          {isFullAdmin && (
            <>
              <button
                onClick={() => setShowEditModal(true)}
                className="p-1 px-1.5 text-amber-300 hover:text-amber-100 hover:bg-white/5 rounded transition-all flex items-center gap-1 text-[10px] font-bold cursor-pointer"
                title="Edit sender name, profile, timestamps, styling, etc."
              >
                <Edit3 className="w-3 h-3 text-amber-400" />
                <span className="hidden sm:inline">Modify</span>
              </button>
              <div className="w-[1px] h-3 bg-white/10" />
            </>
          )}
          <button
            onClick={() => setShowDeleteConfirm(true)}
            className="p-1 px-1.5 text-red-400 hover:text-red-305 hover:bg-red-952/20 rounded transition-all flex items-center gap-1 text-[10px] font-bold cursor-pointer"
            title="Delete this message individually"
          >
            <Trash2 className="w-3 h-3 text-red-400" />
            <span className="hidden sm:inline">Delete</span>
          </button>
        </div>
      )}

      {/* Individual Message Customizer Modal overlay */}
      <AnimatePresence>
        {showEditModal && (
          <div className="fixed inset-0 z-50 bg-black/75 backdrop-blur-md flex items-center justify-center p-4">
            <motion.div
              initial={{ scale: 0.95, opacity: 0, y: 10 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.95, opacity: 0, y: 10 }}
              className="bg-neutral-900 border border-amber-500/20 w-full max-w-lg rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]"
              onClick={(e) => e.stopPropagation()}
            >
              {/* Modal Header */}
              <div className="p-4 border-b border-amber-500/10 flex items-center justify-between bg-black/40">
                <div className="flex items-center gap-2">
                  <Palette className="w-4.5 h-4.5 text-amber-500 animate-pulse" />
                  <span className="text-sm font-black font-display tracking-widest text-amber-300">CUSTOMIZE MESSAGE NODE</span>
                </div>
                <button
                  onClick={() => setShowEditModal(false)}
                  className="text-amber-200/50 hover:text-white p-1 rounded-lg hover:bg-white/5 transition cursor-pointer"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              {/* Modal Body */}
              <form onSubmit={handleSave} className="p-5 space-y-4 overflow-y-auto max-h-[70vh]">
                {errorMessage && (
                  <div className="p-3 bg-red-950/40 border border-red-900/40 text-[11px] text-red-400 rounded-lg font-medium">
                    {errorMessage}
                  </div>
                )}

                {/* Sender Profile block */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <label className="text-[10px] font-black text-amber-400/80 uppercase tracking-wider flex items-center gap-1.5">
                      <User className="w-3 h-3" />
                      Sender Full Name
                    </label>
                    <input
                      type="text"
                      value={editAuthorName}
                      onChange={(e) => setEditAuthorName(e.target.value)}
                      placeholder="e.g. Sarah_Explorer"
                      className="w-full text-xs font-sans px-3 py-2.5 bg-black/45 border border-amber-500/15 rounded-lg outline-none focus:border-amber-400 focus:bg-black/80 transition-all text-white placeholder-amber-100/20"
                    />
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-[10px] font-black text-amber-400/80 uppercase tracking-wider flex items-center gap-1.5">
                      <Sparkles className="w-3 h-3" />
                      Custom User Tag
                    </label>
                    <input
                      type="text"
                      value={editAuthorTag}
                      onChange={(e) => setEditAuthorTag(e.target.value)}
                      placeholder="e.g. Sarah#4423"
                      className="w-full text-xs font-sans px-3 py-2.5 bg-black/45 border border-amber-500/15 rounded-lg outline-none focus:border-amber-400 focus:bg-black/80 transition-all text-white placeholder-amber-100/20"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <label className="text-[10px] font-black text-amber-400/80 uppercase tracking-wider flex items-center gap-1.5">
                      <ImageIcon className="w-3 h-3" />
                      Profile Avatar URL
                    </label>
                    <input
                      type="text"
                      value={editAuthorAvatar}
                      onChange={(e) => setEditAuthorAvatar(e.target.value)}
                      placeholder="Preloaded image or link URL..."
                      className="w-full text-xs font-sans px-3 py-2.5 bg-black/45 border border-amber-500/15 rounded-lg outline-none focus:border-amber-400 focus:bg-black/80 transition-all text-white placeholder-amber-100/20"
                    />
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-[10px] font-black text-amber-400/80 uppercase tracking-wider flex items-center gap-1.5">
                      <Clock className="w-3 h-3" />
                      Adjust Date &amp; Time
                    </label>
                    <input
                      type="datetime-local"
                      value={editCreatedAt}
                      onChange={(e) => setEditCreatedAt(e.target.value)}
                      className="w-full text-xs font-sans px-3 py-2.5 bg-black/45 border border-amber-500/15 rounded-lg outline-none focus:border-amber-400 focus:bg-black/80 transition-all text-white [color-scheme:dark]"
                    />
                  </div>
                </div>

                {/* Content Block */}
                <div className="space-y-1.5">
                  <label className="text-[10px] font-black text-amber-400/80 uppercase tracking-wider">
                    Message Content Text (supports bold/italics/underlines)
                  </label>
                  <textarea
                    rows={3}
                    value={editContent}
                    onChange={(e) => setEditContent(e.target.value)}
                    placeholder="Message text payload..."
                    className="w-full text-xs font-sans px-3 py-2.5 bg-black/45 border border-amber-500/15 rounded-lg outline-none focus:border-amber-400 focus:bg-black/80 transition-all text-white placeholder-amber-100/20 resize-none font-sans"
                  />
                </div>

                {/* Aesthetic Theme Chooser */}
                <div className="space-y-2">
                  <span className="text-[10px] font-black text-amber-400/80 uppercase tracking-wider block">
                    Message Box Aesthetics Color &amp; Glow
                  </span>
                  
                  {/* Color pills */}
                  <div className="flex flex-wrap gap-2">
                    {[
                      { id: "default", label: "Transparent Dark Glass", bg: "bg-neutral-900/60", hoverText: "hover:text-amber-300", colorDot: "bg-amber-400 shadow-amber-400/50" },
                      { id: "emerald", label: "Emerald Matrix Tech", bg: "bg-emerald-950/20 border-emerald-500/30", hoverText: "hover:text-emerald-300", colorDot: "bg-emerald-500 shadow-emerald-500/50" },
                      { id: "crimson", label: "Crimson Eclipse Shadow", bg: "bg-red-950/20 border-red-500/30", hoverText: "hover:text-red-300", colorDot: "bg-red-500 shadow-red-500/50" },
                      { id: "cyan", label: "Retro Cyberpunk Cyan", bg: "bg-cyan-950/20 border-cyan-500/30", hoverText: "hover:text-cyan-300", colorDot: "bg-cyan-400 shadow-cyan-400/50" },
                      { id: "purple", label: "Cyber Amethyst Glow", bg: "bg-purple-950/20 border-purple-500/30", hoverText: "hover:text-purple-300", colorDot: "bg-purple-500 shadow-purple-500/50" },
                      { id: "gold", label: "Immersive Solid Gold", bg: "bg-amber-950/30 border-amber-500/40", hoverText: "hover:text-yellow-300", colorDot: "bg-yellow-400 shadow-yellow-400/50" }
                    ].map((theme) => (
                      <button
                        type="button"
                        key={theme.id}
                        onClick={() => setEditBoxColor(theme.id)}
                        className={`py-1.5 px-2.5 rounded-lg text-[10px] font-medium border flex items-center gap-1.5 transition-all cursor-pointer ${
                          editBoxColor === theme.id 
                            ? "border-amber-400 bg-amber-400/10 text-amber-300 font-bold shadow-xs" 
                            : `border-white/5 bg-transparent text-amber-200/50 ${theme.hoverText} hover:bg-white/5`
                        }`}
                      >
                        <span className={`w-2 h-2 rounded-full inline-block ${theme.colorDot} shadow-[0_0_5px_currentColor]`} />
                        {editBoxColor === theme.id && <Check className="w-3 h-3 text-amber-400" />}
                        <span>{theme.label}</span>
                      </button>
                    ))}
                  </div>

                  {/* Glow toggle */}
                  <div className="pt-2">
                    <label className="inline-flex items-center gap-2.5 cursor-pointer select-none">
                      <input
                        type="checkbox"
                        checked={editGlow}
                        onChange={(e) => setEditGlow(e.target.checked)}
                        className="sr-only peer"
                      />
                      <div className="w-9 h-5 bg-black/60 rounded-full peer peer-checked:after:translate-x-full after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-amber-400 after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-amber-500/30 relative"></div>
                      <span className="text-[11px] font-bold text-amber-200/80 flex items-center gap-1.5">
                        <Sparkles className={`w-3.5 h-3.5 text-amber-400 ${editGlow ? "animate-pulse" : ""}`} />
                        <span>Enable ambient border glow outline</span>
                      </span>
                    </label>
                  </div>
                </div>

                {/* Footer Controls */}
                <div className="flex gap-2 pt-4 border-t border-amber-500/10">
                  <button
                    type="button"
                    onClick={() => {
                      setShowDeleteConfirm(true);
                    }}
                    disabled={isSaving}
                    className="px-3.5 py-2.5 bg-red-950/20 border border-red-500/20 hover:bg-red-950/40 text-red-400 text-xs font-semibold rounded-xl transition cursor-pointer flex items-center gap-1"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                    <span>Delete</span>
                  </button>
                  
                  <div className="flex-1" />

                  <button
                    type="button"
                    onClick={() => setShowEditModal(false)}
                    disabled={isSaving}
                    className="px-4 py-2.5 bg-transparent border border-white/10 hover:bg-white/5 text-amber-200/80 text-xs font-semibold rounded-xl transition cursor-pointer"
                  >
                    Cancel
                  </button>

                  <button
                    type="submit"
                    disabled={isSaving}
                    className="btn-gel-primary px-4 py-2.5 bg-amber-400 text-amber-950 text-xs font-black rounded-xl transition cursor-pointer flex items-center gap-1.5"
                  >
                    {isSaving ? "Saving..." : "Save Settings"}
                  </button>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Lightbox full-view Modal overlay */}
      <AnimatePresence>
        {lightboxImage && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 bg-black/90 backdrop-blur-xs flex items-center justify-center p-4 cursor-zoom-out"
            onClick={() => setLightboxImage(null)}
          >
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              transition={{ type: "spring", damping: 25, stiffness: 350 }}
              className="relative max-w-7xl max-h-full flex flex-col items-center justify-center"
              onClick={(e) => e.stopPropagation()}
            >
              <img
                src={lightboxImage}
                alt="Enlarged gallery view"
                referrerPolicy="no-referrer"
                className="max-w-full max-h-[85vh] object-contain rounded-lg shadow-2xl"
              />
              <div className="mt-4 flex gap-4 text-white">
                <a
                  href={lightboxImage}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="btn-gel-primary transition px-4 py-2 rounded-lg text-xs font-bold flex items-center gap-1.5 shadow-md"
                >
                  <ExternalLink className="w-3.5 h-3.5" />
                  <span>Open in New Tab</span>
                </a>
                <button
                  onClick={() => setLightboxImage(null)}
                  className="bg-zinc-800 hover:bg-zinc-700 transition px-4 py-2 rounded-lg text-xs font-semibold shadow-md border border-zinc-700"
                >
                  Close
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Safe Iframe-Ready Delete Confirmation Overlay Modal */}
      <AnimatePresence>
        {showDeleteConfirm && (
          <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-md flex items-center justify-center p-4">
            <motion.div
              initial={{ scale: 0.95, opacity: 0, y: 10 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.95, opacity: 0, y: 10 }}
              className="bg-zinc-900 border border-red-500/30 rounded-2xl p-6 max-w-sm w-full space-y-4 shadow-2xl relative"
            >
              <div className="flex items-center gap-3 text-red-400">
                <div className="w-10 h-10 rounded-full bg-red-500/10 border border-red-500/20 flex items-center justify-center">
                  <Trash2 className="w-5 h-5 text-red-400" />
                </div>
                <div>
                  <h4 className="font-black text-sm text-red-200 uppercase tracking-wide">
                    Confirm Deletion
                  </h4>
                  <p className="text-[10px] text-zinc-400 font-mono">
                    MESSAGE REF ID: {message.id}
                  </p>
                </div>
              </div>

              <div className="text-xs text-zinc-300 leading-relaxed space-y-2">
                <p>
                  Are you sure you want to delete this synchronized message individually from the live board?
                </p>
                {message.content && (
                  <div className="bg-black/40 p-2.5 rounded-lg border border-white/5 font-sans italic text-zinc-400 max-h-16 overflow-y-auto truncate">
                    "{message.content}"
                  </div>
                )}
              </div>

              <div className="flex gap-2 pt-2 border-t border-white/5">
                <button
                  type="button"
                  onClick={() => setShowDeleteConfirm(false)}
                  className="flex-1 py-2.5 bg-transparent border border-white/10 hover:bg-white/5 text-zinc-300 text-xs font-semibold rounded-xl transition cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleDelete}
                  disabled={isSaving}
                  className="flex-1 py-2.5 bg-red-800 hover:bg-red-700 border border-red-500/30 text-white text-xs font-black rounded-xl transition cursor-pointer flex items-center justify-center gap-1.5"
                >
                  {isSaving ? (
                    <>
                      <div className="h-3 w-3 animate-spin rounded-full border-2 border-white border-t-transparent" />
                      <span>Deleting...</span>
                    </>
                  ) : (
                    <>
                      <Trash2 className="w-3.5 h-3.5" />
                      <span>Confirm Delete</span>
                    </>
                  )}
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </motion.div>
  );
};
