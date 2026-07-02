import React, { useState, useEffect, useRef } from "react";
import { Send, CheckCircle2, Package, Clock, Search, ImagePlus, X, Trash2, Pencil, Loader2, Paperclip, ChevronLeft } from "lucide-react";

// ---- CONFIG -----------------------------------------------------------
const API_BASE = "https://asbab-backend-production.up.railway.app";

const CLOUDINARY_CLOUD_NAME = "esxxmwyz";
const CLOUDINARY_UPLOAD_PRESET = "ml_default";

// The three "groups" — shown on the home screen like Telegram chats.
// What each one actually does/means is still to be decided; this just
// wires up the navigation + separate feeds.
const GROUPS = [
  { id: "pending", title: "Pending Group Of Asbab", initials: "PG", color: "#b8935a" },
  { id: "all_order", title: "All Order Group Of Asbab", initials: "AO", color: "#7a9db8" },
  { id: "making", title: "Making Of Asbab", initials: "MK", color: "#8ab87a" },
];
// ------------------------------------------------------------------------

async function uploadImageToCloudinary(file) {
  const formData = new FormData();
  formData.append("file", file);
  formData.append("upload_preset", CLOUDINARY_UPLOAD_PRESET);

  const res = await fetch(
    `https://api.cloudinary.com/v1_1/${CLOUDINARY_CLOUD_NAME}/image/upload`,
    { method: "POST", body: formData }
  );
  if (!res.ok) throw new Error("Image upload failed");
  const data = await res.json();
  return data.secure_url;
}

function formatTime(iso) {
  if (!iso) return "";
  const d = new Date(iso);
  const now = new Date();
  const sameDay = d.toDateString() === now.toDateString();
  if (sameDay) return d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
  return d.toLocaleDateString("en-GB", { day: "numeric", month: "short" });
}

function StatusPill({ status }) {
  if (status === "sent") {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-900/30 border border-emerald-700/40 px-2.5 py-1 text-[11px] font-medium text-emerald-300">
        <CheckCircle2 size={12} strokeWidth={2.5} />
        কুরিয়ারে পাঠানো হয়েছে
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full bg-[#3a2f1f] border border-[#5c4a2a] px-2.5 py-1 text-[11px] font-medium text-[#d9b877]">
      <Clock size={12} strokeWidth={2.5} />
      পাঠানো বাকি
    </span>
  );
}

// ---- HOME SCREEN: list of the 3 groups, Telegram-chat-list style --------
function HomeScreen({ entries, onOpenGroup }) {
  const rows = GROUPS.map((g) => {
    const groupEntries = entries.filter((e) => e.group === g.id);
    const last = groupEntries[0]; // entries are newest-first
    return { ...g, count: groupEntries.length, last };
  });

  return (
    <div className="min-h-screen bg-[#0f0d0a] text-[#f2ede4]" style={{ fontFamily: "'Inter', sans-serif" }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Cormorant+Garamond:wght@500;600&family=Inter:wght@400;500;600&display=swap');
        .font-serif { font-family: 'Cormorant Garamond', serif; }
      `}</style>
      <header className="px-5 pt-6 pb-4 border-b border-[#241f17]">
        <p className="text-[10px] uppercase tracking-[0.25em] text-[#8a7a5c]">Moderator Panel</p>
        <h1 className="font-serif text-[28px] leading-none mt-1">
          Asbab <span className="text-[#b8935a] italic">Abaya</span>
        </h1>
      </header>

      <div className="divide-y divide-[#1c1913]">
        {rows.map((g) => (
          <button
            key={g.id}
            onClick={() => onOpenGroup(g.id)}
            className="w-full flex items-center gap-3 px-5 py-4 text-left active:bg-[#161310]"
          >
            <div
              className="w-12 h-12 rounded-full flex items-center justify-center text-sm font-semibold text-[#0f0d0a] shrink-0"
              style={{ backgroundColor: g.color }}
            >
              {g.initials}
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center justify-between">
                <span className="font-medium text-[15px] text-[#f2ede4] truncate">{g.title}</span>
                <span className="text-[11px] text-[#6b6152] shrink-0 ml-2">
                  {g.last ? formatTime(g.last.createdAt) : ""}
                </span>
              </div>
              <p className="text-[13px] text-[#6b6152] truncate mt-0.5">
                {g.last ? (g.last.rawText || "").split("\n")[0] : "কোনো এন্ট্রি নেই"}
              </p>
            </div>
            {g.count > 0 && (
              <span className="shrink-0 min-w-[20px] h-5 px-1.5 rounded-full bg-[#b8935a] text-[#0f0d0a] text-[11px] font-semibold flex items-center justify-center">
                {g.count}
              </span>
            )}
          </button>
        ))}
      </div>
    </div>
  );
}

// ---- GROUP SCREEN: the feed + Telegram-style compose bar for one group --
function GroupScreen({ groupId, entries, onBack, refreshEntries, moderator, promptForModerator }) {
  const group = GROUPS.find((g) => g.id === groupId);
  const [sendingId, setSendingId] = useState(null);
  const [toast, setToast] = useState(null);
  const [search, setSearch] = useState("");

  const [text, setText] = useState("");
  const [imageFile, setImageFile] = useState(null);
  const [imagePreview, setImagePreview] = useState(null);
  const [sending, setSending] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const textareaRef = useRef(null);
  const fileInputRef = useRef(null);

  const showToast = (msg) => {
    setToast(msg);
    setTimeout(() => setToast(null), 3000);
  };

  const handleFile = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    setImageFile(file);
    setImagePreview(URL.createObjectURL(file));
  };

  const clearImage = () => {
    setImageFile(null);
    setImagePreview(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const autosize = (e) => {
    setText(e.target.value);
    const el = e.target;
    el.style.height = "auto";
    el.style.height = Math.min(el.scrollHeight, 160) + "px";
  };

  const startEdit = (entry) => {
    setEditingId(entry.id);
    setText(entry.rawText || "");
    setImagePreview(entry.imageUrl || null);
    setImageFile(null);
    setTimeout(() => textareaRef.current?.focus(), 100);
  };

  const cancelEdit = () => {
    setEditingId(null);
    setText("");
    clearImage();
  };

  const handleSend = async () => {
    if (!text.trim() || sending) return;
    if (!moderator) promptForModerator();
    setSending(true);
    try {
      let imageUrl = imagePreview && !imageFile ? imagePreview : null;
      if (imageFile) imageUrl = await uploadImageToCloudinary(imageFile);

      if (editingId) {
        const res = await fetch(`${API_BASE}/api/entries/${editingId}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ rawText: text, imageUrl, moderator }),
        });
        if (!res.ok) throw new Error();
        showToast("এন্ট্রি আপডেট হয়েছে");
      } else {
        const res = await fetch(`${API_BASE}/api/entries`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ rawText: text, imageUrl, moderator, group: groupId }),
        });
        if (!res.ok) throw new Error();
        showToast("নতুন এন্ট্রি যোগ হয়েছে");
      }
      await refreshEntries();
      setText("");
      clearImage();
      setEditingId(null);
      if (textareaRef.current) textareaRef.current.style.height = "auto";
    } catch {
      showToast("সেভ করা যায়নি");
    } finally {
      setSending(false);
    }
  };

  const handleDelete = async (id) => {
    try {
      const res = await fetch(`${API_BASE}/api/entries/${id}`, { method: "DELETE" });
      if (!res.ok) throw new Error();
      await refreshEntries();
      showToast("এন্ট্রি ডিলিট হয়েছে (শুধু অ্যাপ থেকে)");
    } catch {
      showToast("ডিলিট করা যায়নি");
    }
  };

  const handleSendToCourier = async (entry) => {
    setSendingId(entry.id);
    try {
      const res = await fetch(`${API_BASE}/api/entries/${entry.id}/send-to-courier`, {
        method: "POST",
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed");
      await refreshEntries();
      showToast(`#${data.productCode || entry.id} কুরিয়ারে পাঠানো হয়েছে`);
    } catch (err) {
      showToast(err.message || "কুরিয়ারে পাঠানো যায়নি");
    } finally {
      setSendingId(null);
    }
  };

  const groupEntries = entries.filter((e) => e.group === groupId);
  const filtered = groupEntries.filter((e) =>
    (e.rawText || "").toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="min-h-screen bg-[#0f0d0a] text-[#f2ede4] flex flex-col" style={{ fontFamily: "'Inter', sans-serif" }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Cormorant+Garamond:wght@500;600&family=Inter:wght@400;500;600&display=swap');
        .font-serif { font-family: 'Cormorant Garamond', serif; }
      `}</style>

      <header className="sticky top-0 z-30 bg-[#0f0d0a]/95 backdrop-blur border-b border-[#241f17]">
        <div className="max-w-lg mx-auto px-3 pt-4 pb-3 flex items-center gap-2">
          <button onClick={onBack} className="text-[#8a7a5c] hover:text-[#f2ede4] p-1">
            <ChevronLeft size={22} />
          </button>
          <div
            className="w-8 h-8 rounded-full flex items-center justify-center text-[11px] font-semibold text-[#0f0d0a] shrink-0"
            style={{ backgroundColor: group.color }}
          >
            {group.initials}
          </div>
          <h1 className="font-medium text-[15px] flex-1 truncate">{group.title}</h1>
        </div>
        <div className="max-w-lg mx-auto px-3 pb-3">
          <div className="flex items-center gap-2 bg-[#17140f] border border-[#241f17] rounded-lg px-3 py-2">
            <Search size={14} className="text-[#5c5342]" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="মেসেজে খুঁজুন..."
              className="bg-transparent text-sm placeholder-[#5c5342] focus:outline-none flex-1"
            />
          </div>
        </div>
      </header>

      <main className="flex-1 max-w-lg mx-auto w-full px-5 py-5 space-y-5">
        {filtered.length === 0 && (
          <div className="text-center py-16 text-[#5c5342] text-sm">
            কোনো এন্ট্রি নেই। নিচে ছবি ও মেসেজ দিয়ে প্রথম এন্ট্রি পাঠান।
          </div>
        )}

        {filtered.map((entry) => (
          <article key={entry.id} className="rounded-2xl overflow-hidden border border-[#241f17] bg-[#161310]">
            <div className="relative">
              {entry.imageUrl ? (
                <img src={entry.imageUrl} alt="" className="w-full h-72 object-cover" />
              ) : (
                <div className="w-full h-40 flex items-center justify-center bg-[#17140f] text-[#3a3226]">
                  <ImagePlus size={28} />
                </div>
              )}
              <div className="absolute top-3 left-3">
                <span className="bg-black/60 backdrop-blur px-2.5 py-1 rounded-md text-[11px] font-medium tracking-wide">
                  #{entry.productCode || entry.id}
                </span>
              </div>
              <div className="absolute top-3 right-3">
                <StatusPill status={entry.status} />
              </div>
            </div>

            <div className="px-4 pt-4 pb-4">
              <div className="flex items-center justify-between mb-3">
                <span className="text-[11px] text-[#6b6152]">{entry.moderator}</span>
                <div className="flex items-center gap-3">
                  <button onClick={() => startEdit(entry)} className="text-[#6b6152] hover:text-[#d9b877]">
                    <Pencil size={14} />
                  </button>
                  <button onClick={() => handleDelete(entry.id)} className="text-[#6b6152] hover:text-red-400">
                    <Trash2 size={14} />
                  </button>
                </div>
              </div>

              <pre className="whitespace-pre-wrap font-sans text-sm text-[#c9bfa8] mb-4 leading-relaxed">
                {entry.rawText}
              </pre>

              {entry.status === "sent" && (
                <div className="text-[11px] text-[#8a7a5c] mb-3 space-y-0.5">
                  <div>{entry.customerName} · {entry.customerPhone}</div>
                  <div>{entry.customerAddress}</div>
                  <div>Consignment: {entry.consignmentId}</div>
                </div>
              )}

              {entry.status === "pending" ? (
                <button
                  onClick={() => handleSendToCourier(entry)}
                  disabled={sendingId === entry.id}
                  className="w-full flex items-center justify-center gap-2 bg-[#b8935a] hover:bg-[#c9a56d] disabled:opacity-60 text-[#0f0d0a] font-medium text-sm py-3 rounded-xl transition-colors"
                >
                  {sendingId === entry.id ? (
                    <Loader2 size={15} className="animate-spin" />
                  ) : (
                    <Send size={15} strokeWidth={2.5} />
                  )}
                  {sendingId === entry.id ? "AI পড়ছে..." : "Send to Courier"}
                </button>
              ) : (
                <button className="w-full flex items-center justify-center gap-2 bg-[#1c1913] border border-[#3a3226] text-[#8a7a5c] font-medium text-sm py-3 rounded-xl cursor-default">
                  <Package size={15} strokeWidth={2.5} />
                  এন্ট্রি সম্পন্ন হয়েছে
                </button>
              )}
            </div>
          </article>
        ))}
      </main>

      <div className="sticky bottom-0 bg-[#0f0d0a]/95 backdrop-blur border-t border-[#241f17]">
        <div className="max-w-lg mx-auto px-3 py-3">
          {editingId && (
            <div className="flex items-center justify-between text-[11px] text-[#b8935a] mb-1.5 px-1">
              <span>এডিট করছেন #{editingId}</span>
              <button onClick={cancelEdit} className="underline">বাতিল</button>
            </div>
          )}
          {imagePreview && (
            <div className="relative inline-block mb-2">
              <img src={imagePreview} alt="" className="h-16 w-16 object-cover rounded-lg border border-[#3a3226]" />
              <button
                onClick={clearImage}
                className="absolute -top-1.5 -right-1.5 bg-black rounded-full p-0.5 border border-[#3a3226]"
              >
                <X size={11} />
              </button>
            </div>
          )}
          <div className="flex items-end gap-2">
            <label className="shrink-0 w-10 h-10 rounded-full bg-[#241f17] border border-[#3a3226] flex items-center justify-center cursor-pointer text-[#8a7a5c] hover:text-[#d9b877]">
              <Paperclip size={17} />
              <input ref={fileInputRef} type="file" accept="image/*" onChange={handleFile} className="hidden" />
            </label>
            <textarea
              ref={textareaRef}
              value={text}
              onChange={autosize}
              rows={1}
              placeholder="মেসেজ লিখুন বা পেস্ট করুন..."
              className="flex-1 resize-none bg-[#17140f] border border-[#3a3226] rounded-2xl px-4 py-2.5 text-sm text-[#f2ede4] placeholder-[#5c5342] focus:outline-none focus:ring-1 focus:ring-[#b8935a] max-h-40"
              style={{ minHeight: "42px" }}
            />
            <button
              onClick={handleSend}
              disabled={!text.trim() || sending}
              className="shrink-0 w-10 h-10 rounded-full bg-[#b8935a] hover:bg-[#c9a56d] disabled:opacity-40 flex items-center justify-center text-[#0f0d0a] transition-colors"
            >
              {sending ? <Loader2 size={16} className="animate-spin" /> : <Send size={16} />}
            </button>
          </div>
        </div>
      </div>

      {toast && (
        <div className="fixed bottom-24 left-1/2 -translate-x-1/2 bg-[#1c1913] border border-[#3a3226] rounded-full px-4 py-2.5 flex items-center gap-2 text-sm shadow-lg z-40">
          <CheckCircle2 size={15} className="text-emerald-400" />
          {toast}
        </div>
      )}
    </div>
  );
}

export default function AsbabDashboard() {
  const [entries, setEntries] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [view, setView] = useState("home"); // "home" | groupId
  const [moderator, setModerator] = useState(
    () => localStorage.getItem("asbab_moderator") || ""
  );

  const promptForModerator = () => {
    const name = window.prompt("আপনার নাম লিখুন (একবারই লাগবে):", moderator);
    if (name && name.trim()) {
      setModerator(name.trim());
      localStorage.setItem("asbab_moderator", name.trim());
    }
  };

  const loadEntries = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`${API_BASE}/api/entries`);
      if (!res.ok) throw new Error("Failed to load");
      setEntries(await res.json());
    } catch (err) {
      setError("এন্ট্রি লোড করা যায়নি। Backend URL ঠিক আছে কিনা দেখুন।");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadEntries();
  }, []);

  if (loading) {
    return (
      <div className="min-h-screen bg-[#0f0d0a] flex items-center justify-center text-[#5c5342] gap-2">
        <Loader2 size={18} className="animate-spin" /> লোড হচ্ছে...
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-[#0f0d0a] flex items-center justify-center text-[#d9877e] text-sm px-6 text-center">
        {error}
      </div>
    );
  }

  if (view === "home") {
    return <HomeScreen entries={entries} onOpenGroup={(id) => setView(id)} />;
  }

  return (
    <GroupScreen
      groupId={view}
      entries={entries}
      onBack={() => setView("home")}
      refreshEntries={loadEntries}
      moderator={moderator}
      promptForModerator={promptForModerator}
    />
  );
}
