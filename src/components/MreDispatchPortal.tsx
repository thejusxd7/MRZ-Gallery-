import React, { useState, useRef } from "react";
import { 
  Send, 
  Image as ImageIcon, 
  Upload, 
  User, 
  Video, 
  Music, 
  FileText, 
  Sparkles, 
  Trash2, 
  CheckCircle,
  AlertTriangle,
  FileSpreadsheet,
  Layers,
  MessageSquare,
  Sparkle
} from "lucide-react";
import { motion, AnimatePresence } from "motion/react";
import { DiscordAttachment } from "../types";

interface MreDispatchPortalProps {
  token: string | null;
  pageLogo: string;
  onSendCustomMessage: (payload: {
    authorName: string;
    authorTag: string;
    authorAvatar: string | null;
    content: string;
    attachments: DiscordAttachment[];
    customBoxColor?: string;
    customGlow?: boolean;
  }) => Promise<boolean>;
}

export const MreDispatchPortal: React.FC<MreDispatchPortalProps> = ({ 
  token, 
  pageLogo, 
  onSendCustomMessage 
}) => {
  // Section Navigation Tab State
  const [activeTab, setActiveTab] = useState<"message" | "pov">("message");

  // SECTION 1: SENT A MESSAGE - Independent form states
  const [msgSenderName, setMsgSenderName] = useState("MRZ Admin");
  const [msgSenderTag, setMsgSenderTag] = useState("MRZ#1234");
  const [msgUsePageLogo, setMsgUsePageLogo] = useState(true);
  const [msgCustomAvatar, setMsgCustomAvatar] = useState("");
  const [msgContentText, setMsgContentText] = useState("");
  const [msgThemeColor, setMsgThemeColor] = useState("default");
  const [msgGlowEffect, setMsgGlowEffect] = useState(true);
  const [msgBroadcasting, setMsgBroadcasting] = useState(false);
  const [msgSuccess, setMsgSuccess] = useState(false);
  const [msgError, setMsgError] = useState("");

  // SECTION 2: UPLOAD YOUR POV - Independent form states
  const [povSenderName, setPovSenderName] = useState("MRZ Admin");
  const [povSenderTag, setPovSenderTag] = useState("MRZ#1234");
  const [povUsePageLogo, setPovUsePageLogo] = useState(true);
  const [povCustomAvatar, setPovCustomAvatar] = useState("");
  const [povCaptionText, setPovCaptionText] = useState("");
  const [povThemeColor, setPovThemeColor] = useState("default");
  const [povGlowEffect, setPovGlowEffect] = useState(true);
  const [povBroadcasting, setPovBroadcasting] = useState(false);
  const [povSuccess, setPovSuccess] = useState(false);
  const [povError, setPovError] = useState("");

  // POV Drag-Drop & Upload stream controls
  const [isUploading, setIsUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [uploadBytesTransferred, setUploadBytesTransferred] = useState(0);
  const [uploadTotalBytes, setUploadTotalBytes] = useState(0);
  const [uploadedAttachment, setUploadedAttachment] = useState<DiscordAttachment | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const [dragActive, setDragActive] = useState(false);

  // Constants
  const CHUNK_SIZE = 8 * 1024 * 1024; // 8MB chunk slices
  const MAX_FILE_SIZE_LIMIT = 3 * 1024 * 1024 * 1024; // 3GB strict upper ceiling

  // Drag and drop event handlers
  const handleDrag = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === "dragenter" || e.type === "dragover") {
      setDragActive(true);
    } else if (e.type === "dragleave") {
      setDragActive(false);
    }
  };

  const handleDrop = async (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);

    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      await processChunkedAttachmentUpload(e.dataTransfer.files[0]);
    }
  };

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      await processChunkedAttachmentUpload(e.target.files[0]);
    }
  };

  // Safe chunked pipeline to upload up to 3GB
  const processChunkedAttachmentUpload = async (file: File) => {
    setIsUploading(true);
    setPovError("");
    setUploadProgress(0);
    setUploadBytesTransferred(0);
    setUploadTotalBytes(file.size);

    if (file.size > MAX_FILE_SIZE_LIMIT) {
      setPovError("File exceeds the strict 3 GB physical storage allocation ceiling.");
      setIsUploading(false);
      return;
    }

    const uploadId = "chunk_id_" + Math.random().toString(36).substring(2, 12) + Date.now().toString(36);
    const totalChunks = Math.ceil(file.size / CHUNK_SIZE);
    let currentChunk = 0;

    const transferNextChunkOfBytes = () => {
      if (currentChunk >= totalChunks) return;

      const byteStart = currentChunk * CHUNK_SIZE;
      const byteEnd = Math.min(byteStart + CHUNK_SIZE, file.size);
      const fileBlobSlice = file.slice(byteStart, byteEnd);

      const fileSegmentReader = new FileReader();
      fileSegmentReader.onload = async () => {
        const rawBase64Segment = fileSegmentReader.result as string;
        try {
          const res = await fetch("/api/upload-chunked", {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "x-admin-token": token || ""
            },
            body: JSON.stringify({
              fileName: file.name,
              fileType: file.type || "application/octet-stream",
              chunkIndex: currentChunk,
              totalChunks: totalChunks,
              uploadId: uploadId,
              data: rawBase64Segment
            })
          });

          const resJson = await res.json();
          if (res.ok && resJson.success) {
            if (resJson.completed) {
              setUploadedAttachment({
                id: "att_upload_" + Date.now() + "_" + Math.floor(Math.random() * 100),
                name: file.name,
                url: resJson.url,
                contentType: file.type || "application/octet-stream",
                size: file.size
              });
              setUploadBytesTransferred(file.size);
              setUploadProgress(100);
              setIsUploading(false);
            } else {
              currentChunk++;
              const actualSent = Math.min(currentChunk * CHUNK_SIZE, file.size);
              setUploadBytesTransferred(actualSent);
              setUploadProgress(Math.round((actualSent / file.size) * 100));
              transferNextChunkOfBytes();
            }
          } else {
            setPovError(resJson.error || "Chunk transfer denied. Verify authorization states.");
            setIsUploading(false);
          }
        } catch (connectionError) {
          setPovError("Network transit failure during chunk delegation.");
          setIsUploading(false);
        }
      };

      fileSegmentReader.onerror = () => {
        setPovError("Buffer reader triggered filesystem access error.");
        setIsUploading(false);
      };

      fileSegmentReader.readAsDataURL(fileBlobSlice);
    };

    // Instantiate first thread
    transferNextChunkOfBytes();
  };

  const clearAttachmentBuffer = () => {
    setUploadedAttachment(null);
    setUploadProgress(0);
    setUploadBytesTransferred(0);
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  };

  // Submit Handler: Message Section
  const handleMessageSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setMsgError("");

    if (!msgContentText.trim()) {
      setMsgError("Please write message content text payload to dispatch.");
      return;
    }

    setMsgBroadcasting(true);
    const resolvedAvatar = msgUsePageLogo ? pageLogo : (msgCustomAvatar.trim() || null);

    try {
      const success = await onSendCustomMessage({
        authorName: msgSenderName.trim() || "MRZ Admin",
        authorTag: msgSenderTag.trim() || "MRZ#1234",
        authorAvatar: resolvedAvatar,
        content: msgContentText,
        attachments: [],
        customBoxColor: msgThemeColor,
        customGlow: msgGlowEffect
      });

      if (success) {
        setMsgSuccess(true);
        setMsgContentText("");
        setTimeout(() => setMsgSuccess(false), 3000);
      } else {
        setMsgError("Payload transmission was blacklisted by operator gateways.");
      }
    } catch {
      setMsgError("Express communication gateway unreachable.");
    } finally {
      setMsgBroadcasting(false);
    }
  };

  // Submit Handler: POV Section
  const handlePovSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setPovError("");

    if (!uploadedAttachment) {
      setPovError("Please upload a file / POV first before broadcasting.");
      return;
    }

    setPovBroadcasting(true);
    const resolvedAvatar = povUsePageLogo ? pageLogo : (povCustomAvatar.trim() || null);

    try {
      const success = await onSendCustomMessage({
        authorName: povSenderName.trim() || "MRZ Admin",
        authorTag: povSenderTag.trim() || "MRZ#1234",
        authorAvatar: resolvedAvatar,
        content: povCaptionText,
        attachments: [uploadedAttachment],
        customBoxColor: povThemeColor,
        customGlow: povGlowEffect
      });

      if (success) {
        setPovSuccess(true);
        setPovCaptionText("");
        clearAttachmentBuffer();
        setTimeout(() => setPovSuccess(false), 3000);
      } else {
        setPovError("Broadcasting custom POV failed on server filters.");
      }
    } catch {
      setPovError("Transit pathway was disrupted on broadcast execution.");
    } finally {
      setPovBroadcasting(false);
    }
  };

  const bytesToStringLabel = (bytes: number) => {
    if (bytes === 0) return "0 Bytes";
    const k = 1024;
    const sizes = ["Bytes", "KB", "MB", "GB"];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + " " + sizes[i];
  };

  const getFilePreviewIcon = (mime: string | null) => {
    const term = mime?.toLowerCase() || "";
    if (term.startsWith("image/")) return <ImageIcon className="w-5 h-5 text-amber-400" />;
    if (term.startsWith("video/")) return <Video className="w-5 h-5 text-indigo-400 animate-pulse" />;
    if (term.startsWith("audio/")) return <Music className="w-5 h-5 text-emerald-400" />;
    return <FileSpreadsheet className="w-5 h-5 text-teal-400" />;
  };

  return (
    <div className="liquid-glass-yellow-card rounded-xl p-5 space-y-4" id="mrz-split-sectional-portal">
      {/* Mini Title Banner */}
      <div className="flex items-center gap-2 pb-1.5 border-b border-amber-200/50">
        <Sparkles className="w-4.5 h-4.5 text-amber-500 animate-pulse" />
        <h3 className="text-xs font-black font-mono tracking-wider uppercase text-amber-950">
          MRZ Live Dispatch Panel
        </h3>
      </div>

      {/* SECTION NAV TABS */}
      <div className="grid grid-cols-2 gap-1.5 p-1 bg-amber-950/5 border border-amber-500/10 rounded-xl" id="dispatch-sections-tabbar">
        <button
          type="button"
          onClick={() => setActiveTab("message")}
          className={`py-2 px-2.5 rounded-lg text-[11px] font-black tracking-wider uppercase flex items-center justify-center gap-1.5 transition-all cursor-pointer ${
            activeTab === "message"
              ? "bg-amber-400 text-amber-950 shadow-inner"
              : "text-amber-850 hover:bg-amber-500/10"
          }`}
          title="Send a text message / system alert instantly"
        >
          <MessageSquare className="w-3.5 h-3.5" />
          <span>Sent A Message</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab("pov")}
          className={`py-2 px-2.5 rounded-lg text-[11px] font-black tracking-wider uppercase flex items-center justify-center gap-1.5 transition-all cursor-pointer ${
            activeTab === "pov"
              ? "bg-amber-400 text-amber-950 shadow-inner"
              : "text-amber-850 hover:bg-amber-500/10"
          }`}
          title="Upload large video file POV up to 3GB"
        >
          <Video className="w-3.5 h-3.5" />
          <span>Upload Your POV</span>
        </button>
      </div>

      <AnimatePresence mode="wait">
        {/* TAB 1: SENT A MESSAGE */}
        {activeTab === "message" && (
          <motion.div
            key="section-msg"
            initial={{ opacity: 0, y: 5 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -5 }}
            transition={{ duration: 0.15 }}
            className="space-y-4"
          >
            <div className="flex items-center gap-1">
              <Sparkle className="w-3 h-3 text-amber-500" />
              <h4 className="text-[10px] font-mono font-black text-amber-900 tracking-widest uppercase">
                Section: SENT A MESSAGE
              </h4>
            </div>

            <form onSubmit={handleMessageSubmit} className="space-y-4">
              {/* Sender Details */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="text-[10px] font-extrabold text-amber-950 uppercase tracking-wider block">
                    Custom Username
                  </label>
                  <div className="relative">
                    <User className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-amber-700/60" />
                    <input
                      type="text"
                      value={msgSenderName}
                      onChange={(e) => setMsgSenderName(e.target.value)}
                      placeholder="e.g. MRZ Admin"
                      className="w-full text-xs font-sans pl-7.5 pr-2.5 py-1.5 border border-amber-300 rounded-lg bg-white/70 outline-none focus:border-amber-500 transition-all font-medium text-slate-800"
                    />
                  </div>
                </div>

                <div className="space-y-1">
                  <label className="text-[10px] font-extrabold text-amber-950 uppercase tracking-wider block">
                    Discriminator / Tag
                  </label>
                  <input
                    type="text"
                    value={msgSenderTag}
                    onChange={(e) => setMsgSenderTag(e.target.value)}
                    placeholder="e.g. MRZ#1234"
                    className="w-full text-xs font-mono px-2.5 py-1.5 border border-amber-300 rounded-lg bg-white/70 outline-none focus:border-amber-500 transition-all font-medium text-slate-800"
                  />
                </div>
              </div>

              {/* Profile Logo Switch */}
              <div className="p-2.5 bg-amber-400/5 border border-amber-300/35 rounded-lg space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-[10px] font-extrabold text-amber-950 flex items-center gap-1 select-none">
                    PROILED AVATAR LINKING
                  </span>
                  <label className="relative inline-flex items-center cursor-pointer">
                    <input 
                      type="checkbox" 
                      checked={msgUsePageLogo} 
                      onChange={(e) => setMsgUsePageLogo(e.target.checked)}
                      className="sr-only peer" 
                    />
                    <div className="w-8 h-4.5 bg-amber-700/15 rounded-full peer peer-checked:after:translate-x-3.5 after:content-[''] after:absolute after:top-0.5 after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-3.5 after:w-3.5 after:transition-all peer-checked:bg-amber-500"></div>
                  </label>
                </div>

                {msgUsePageLogo ? (
                  <div className="flex items-center gap-2 pt-0.5">
                    <img 
                      src={pageLogo} 
                      alt="Avatar synced" 
                      className="w-7 h-7 rounded-full border border-amber-400 object-cover"
                      referrerPolicy="no-referrer"
                    />
                    <span className="text-[9px] text-amber-900/80 font-bold">
                      Synced with official gallery profile
                    </span>
                  </div>
                ) : (
                  <div className="space-y-1 pt-0.5">
                    <input
                      type="url"
                      value={msgCustomAvatar}
                      onChange={(e) => setMsgCustomAvatar(e.target.value)}
                      placeholder="https://i.imgur.com/custom_avatar.png"
                      className="w-full text-[10px] font-mono px-2 py-1.5 border border-amber-200 rounded-lg bg-white/70 outline-none focus:border-amber-500 transition-all text-slate-800"
                    />
                  </div>
                )}
              </div>

              {/* Message Input */}
              <div className="space-y-1">
                <label className="text-[10px] font-extrabold text-amber-950 uppercase tracking-wider block">
                  Message Content Payload
                </label>
                <textarea
                  value={msgContentText}
                  onChange={(e) => setMsgContentText(e.target.value)}
                  rows={3}
                  placeholder="Type your real-time text broadcast..."
                  className="w-full text-xs font-sans px-3 py-2 border border-amber-300 rounded-lg bg-white/70 outline-none focus:border-amber-500 transition-all font-medium text-slate-800 placeholder-slate-400"
                />
              </div>

              {/* Theme Settings row */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
                <div className="space-y-1">
                  <label className="text-[10px] font-extrabold text-amber-950 block">
                    Style Theme
                  </label>
                  <select
                    value={msgThemeColor}
                    onChange={(e) => setMsgThemeColor(e.target.value)}
                    className="w-full text-xs font-sans px-2 py-1.5 border border-amber-300 rounded-l-md bg-white/70 outline-none text-slate-800 font-semibold"
                  >
                    <option value="default">Liquid Glass (Amber Preset)</option>
                    <option value="emerald">Matrix Tech Emerald</option>
                    <option value="crimson">Crimson Eclipse Dark</option>
                    <option value="cyan">Cyberpunk Cyan Glare</option>
                    <option value="purple">Cosmic Nebulae Purple</option>
                    <option value="gold">Luxury Imperial Gold</option>
                  </select>
                </div>

                <div className="flex items-center justify-between px-2.5 py-1.5 border border-amber-300 rounded-lg bg-white/50 h-[34px] self-end shadow-3xs hover:bg-white/70 transition-colors">
                  <span className="text-[10px] font-extrabold text-amber-950 uppercase flex items-center gap-1">
                    <Layers className="w-3 h-3 text-amber-500" />
                    <span>Neon Glow</span>
                  </span>
                  <input
                    type="checkbox"
                    checked={msgGlowEffect}
                    onChange={(e) => setMsgGlowEffect(e.target.checked)}
                    className="rounded text-amber-500 focus:ring-amber-400 w-3.5 h-3.5 cursor-pointer"
                  />
                </div>
              </div>

              {/* Error block */}
              {msgError && (
                <div className="p-2.5 bg-red-50 text-red-700 rounded-lg border border-red-200 text-[11px] font-bold font-sans flex items-start gap-1.5">
                  <AlertTriangle className="w-4 h-4 flex-shrink-0 text-red-500" />
                  <span>{msgError}</span>
                </div>
              )}

              {/* Buttons */}
              <button
                type="submit"
                disabled={msgBroadcasting}
                className="w-full btn-gel-primary text-xs font-black py-2.5 rounded-xl transition-all flex items-center justify-center gap-1.5 cursor-pointer disabled:opacity-60"
              >
                {msgBroadcasting ? (
                  <>
                    <div className="animate-spin h-3.5 w-3.5 border-2 border-white border-t-transparent rounded-full" />
                    <span>Sending broadcast thread...</span>
                  </>
                ) : msgSuccess ? (
                  <>
                    <CheckCircle className="w-4 h-4 text-white" />
                    <span>Dispatched Synchronously!</span>
                  </>
                ) : (
                  <>
                    <Send className="w-3.5 h-3.5" />
                    <span>Publish Text Message</span>
                  </>
                )}
              </button>
            </form>
          </motion.div>
        )}

        {/* TAB 2: UPLOAD YOUR POV */}
        {activeTab === "pov" && (
          <motion.div
            key="section-pov"
            initial={{ opacity: 0, y: 5 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -5 }}
            transition={{ duration: 0.15 }}
            className="space-y-4"
          >
            <div className="flex items-center gap-1">
              <Sparkle className="w-3 h-3 text-amber-500" />
              <h4 className="text-[10px] font-mono font-black text-amber-900 tracking-widest uppercase">
                Section: UPLOAD YOUR POV
              </h4>
            </div>

            <form onSubmit={handlePovSubmit} className="space-y-4">
              {/* Creator Metadata */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="text-[10px] font-extrabold text-amber-950 uppercase tracking-wider block">
                    Custom Username
                  </label>
                  <div className="relative">
                    <User className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-amber-700/60" />
                    <input
                      type="text"
                      value={povSenderName}
                      onChange={(e) => setPovSenderName(e.target.value)}
                      placeholder="e.g. MRZ Admin"
                      className="w-full text-xs font-sans pl-7.5 pr-2.5 py-1.5 border border-amber-300 rounded-lg bg-white/70 outline-none focus:border-amber-500 transition-all font-medium text-slate-800"
                    />
                  </div>
                </div>

                <div className="space-y-1">
                  <label className="text-[10px] font-extrabold text-amber-950 uppercase tracking-wider block">
                    Discriminator / Tag
                  </label>
                  <input
                    type="text"
                    value={povSenderTag}
                    onChange={(e) => setPovSenderTag(e.target.value)}
                    placeholder="e.g. MRZ#1234"
                    className="w-full text-xs font-mono px-2.5 py-1.5 border border-amber-300 rounded-lg bg-white/70 outline-none focus:border-amber-500 transition-all font-medium text-slate-800"
                  />
                </div>
              </div>

              {/* Profile Logo Switch */}
              <div className="p-2.5 bg-amber-400/5 border border-amber-300/35 rounded-lg space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-[10px] font-extrabold text-amber-950 flex items-center gap-1 select-none">
                    PROILED AVATAR LINKING
                  </span>
                  <label className="relative inline-flex items-center cursor-pointer">
                    <input 
                      type="checkbox" 
                      checked={povUsePageLogo} 
                      onChange={(e) => setPovUsePageLogo(e.target.checked)}
                      className="sr-only peer" 
                    />
                    <div className="w-8 h-4.5 bg-amber-700/15 rounded-full peer peer-checked:after:translate-x-3.5 after:content-[''] after:absolute after:top-0.5 after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-3.5 after:w-3.5 after:transition-all peer-checked:bg-amber-500"></div>
                  </label>
                </div>

                {povUsePageLogo ? (
                  <div className="flex items-center gap-2 pt-0.5">
                    <img 
                      src={pageLogo} 
                      alt="Avatar synced" 
                      className="w-7 h-7 rounded-full border border-amber-400 object-cover"
                      referrerPolicy="no-referrer"
                    />
                    <span className="text-[9px] text-amber-900/80 font-bold">
                      Synced with official gallery profile
                    </span>
                  </div>
                ) : (
                  <div className="space-y-1 pt-0.5">
                    <input
                      type="url"
                      value={povCustomAvatar}
                      onChange={(e) => setPovCustomAvatar(e.target.value)}
                      placeholder="https://i.imgur.com/custom_avatar.png"
                      className="w-full text-[10px] font-mono px-2 py-1.5 border border-amber-200 rounded-lg bg-white/70 outline-none focus:border-amber-500 transition-all text-slate-800"
                    />
                  </div>
                )}
              </div>

              {/* Captions accompanying POV */}
              <div className="space-y-1">
                <label className="text-[10px] font-extrabold text-amber-950 uppercase tracking-wider block">
                  Captions/Notes to accompany POV
                </label>
                <input
                  type="text"
                  value={povCaptionText}
                  onChange={(e) => setPovCaptionText(e.target.value)}
                  placeholder="Add description of the file being displayed..."
                  className="w-full text-xs font-sans px-3 py-1.5 border border-amber-300 rounded-lg bg-white/70 outline-none focus:border-amber-500 transition-all font-medium text-slate-800 placeholder-slate-400"
                />
              </div>

              {/* Video / File Drag Area */}
              <div className="space-y-1">
                <label className="text-[10px] font-extrabold text-amber-950 uppercase tracking-wider block">
                  Select Video or POV File (Max size 3 GB)
                </label>

                <div
                  onDragEnter={handleDrag}
                  onDragOver={handleDrag}
                  onDragLeave={handleDrag}
                  onDrop={handleDrop}
                  onClick={() => !isUploading && fileInputRef.current?.click()}
                  className={`border-2 border-dashed rounded-xl p-3 text-center transition-all duration-200 flex flex-col items-center justify-center gap-1.5 ${
                    isUploading ? "border-amber-300 bg-amber-400/5 cursor-not-allowed opacity-80" :
                    dragActive 
                      ? "border-amber-500 bg-amber-400/20 scale-[0.98] cursor-pointer" 
                      : "border-amber-300/50 bg-white/40 hover:border-amber-500 hover:bg-white/60 cursor-pointer"
                  }`}
                >
                  <input
                    type="file"
                    ref={fileInputRef}
                    onChange={handleFileSelect}
                    disabled={isUploading}
                    className="hidden"
                  />
                  
                  <div className="w-8 h-8 rounded-full bg-amber-500/15 flex items-center justify-center text-amber-800 border border-amber-400/10">
                    <Upload className="w-4.5 h-4.5" />
                  </div>
                  <div>
                    <h5 className="text-[11px] font-black text-amber-950">
                      Drag &amp; drop file or click to choose
                    </h5>
                    <p className="text-[9px] text-amber-900/60 mt-0.5">
                      Accepts Videos (MP4, WEBM, MOV), Photos, Audio or Archives up to 3 GB size.
                    </p>
                  </div>
                </div>
              </div>

              {/* Upload Tracking Progress */}
              <AnimatePresence>
                {isUploading && (
                  <motion.div
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: "auto", opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    className="space-y-2 p-2.5 bg-amber-900/5 border border-amber-300/30 rounded-xl"
                  >
                    <div className="flex items-center justify-between text-[10px] font-black text-amber-950 uppercase">
                      <span className="flex items-center gap-1.5">
                        <span className="h-3 w-3 animate-spin rounded-full border border-amber-800 border-t-transparent" />
                        <span>Uploading byte packets ...</span>
                      </span>
                      <span>{uploadProgress}%</span>
                    </div>
                    {/* Visual Progress Bar */}
                    <div className="w-full bg-amber-700/10 rounded-full h-2 overflow-hidden border border-amber-500/10">
                      <div 
                        className="bg-amber-400 h-full rounded-full transition-all duration-300 shadow-[0_0_8px_rgba(251,191,36,0.6)]" 
                        style={{ width: `${uploadProgress}%` }} 
                      />
                    </div>
                    <div className="text-[9px] font-mono text-amber-900/70 flex justify-between">
                      <span>Uploaded {bytesToStringLabel(uploadBytesTransferred)}</span>
                      <span>Total {bytesToStringLabel(uploadTotalBytes)}</span>
                    </div>
                  </motion.div>
                )}

                {uploadedAttachment && (
                  <motion.div
                    initial={{ height: 0, opacity: 0, scale: 0.95 }}
                    animate={{ height: "auto", opacity: 1, scale: 1 }}
                    exit={{ height: 0, opacity: 0, scale: 0.95 }}
                    className="bg-white/80 border border-amber-300/50 p-2.5 rounded-xl flex items-center justify-between gap-3 shadow-xs"
                  >
                    <div className="flex items-center gap-2.5 min-w-0">
                      {getFilePreviewIcon(uploadedAttachment.contentType)}
                      <div className="min-w-0">
                        <p className="text-xs font-bold text-slate-800 truncate" title={uploadedAttachment.name}>
                          {uploadedAttachment.name}
                        </p>
                        <p className="text-[9px] text-slate-400 font-mono">
                          {bytesToStringLabel(uploadedAttachment.size)} • {uploadedAttachment.contentType || "file"}
                        </p>
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={clearAttachmentBuffer}
                      className="p-1 hover:bg-red-50 text-slate-400 hover:text-red-500 rounded-lg transition-colors cursor-pointer"
                      title="Clear from broadcast buffer"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </motion.div>
                )}
              </AnimatePresence>

              {/* Theme Settings row */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
                <div className="space-y-1">
                  <label className="text-[10px] font-extrabold text-amber-950 block">
                    Style Theme
                  </label>
                  <select
                    value={povThemeColor}
                    onChange={(e) => setPovThemeColor(e.target.value)}
                    className="w-full text-xs font-sans px-2 py-1.5 border border-amber-300 rounded-l-md bg-white/70 outline-none text-slate-800 font-semibold"
                  >
                    <option value="default">Liquid Glass (Amber Preset)</option>
                    <option value="emerald">Matrix Tech Emerald</option>
                    <option value="crimson">Crimson Eclipse Dark</option>
                    <option value="cyan">Cyberpunk Cyan Glare</option>
                    <option value="purple">Cosmic Nebulae Purple</option>
                    <option value="gold">Luxury Imperial Gold</option>
                  </select>
                </div>

                <div className="flex items-center justify-between px-2.5 py-1.5 border border-amber-300 rounded-lg bg-white/50 h-[34px] self-end shadow-3xs hover:bg-white/70 transition-colors">
                  <span className="text-[10px] font-extrabold text-amber-950 uppercase flex items-center gap-1">
                    <Layers className="w-3 h-3 text-amber-500" />
                    <span>Neon Glow</span>
                  </span>
                  <input
                    type="checkbox"
                    checked={povGlowEffect}
                    onChange={(e) => setPovGlowEffect(e.target.checked)}
                    className="rounded text-amber-500 focus:ring-amber-400 w-3.5 h-3.5 cursor-pointer"
                  />
                </div>
              </div>

              {/* Error block */}
              {povError && (
                <div className="p-2.5 bg-red-50 text-red-700 rounded-lg border border-red-200 text-[11px] font-bold font-sans flex items-start gap-1.5">
                  <AlertTriangle className="w-4 h-4 flex-shrink-0 text-red-500" />
                  <span>{povError}</span>
                </div>
              )}

              {/* Buttons */}
              <button
                type="submit"
                disabled={povBroadcasting || isUploading || !uploadedAttachment}
                className="w-full btn-gel-primary text-xs font-black py-2.5 rounded-xl transition-all flex items-center justify-center gap-1.5 cursor-pointer disabled:opacity-60 disabled:cursor-not-allowed"
              >
                {povBroadcasting ? (
                  <>
                    <div className="animate-spin h-3.5 w-3.5 border-2 border-white border-t-transparent rounded-full" />
                    <span>Dispatching POV file ...</span>
                  </>
                ) : povSuccess ? (
                  <>
                    <CheckCircle className="w-4 h-4 text-white animate-bounce" />
                    <span>POV Broadcasted Live!</span>
                  </>
                ) : (
                  <>
                    <Video className="w-3.5 h-3.5" />
                    <span>Broadcast POV Media File</span>
                  </>
                )}
              </button>
            </form>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};
