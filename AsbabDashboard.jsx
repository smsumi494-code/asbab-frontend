import React, { useState, useEffect } from "react";
import { Send, CheckCircle2, Package, Clock, Search, ImagePlus, X, Trash2, Pencil, Loader2 } from "lucide-react";

// ---- CONFIG -----------------------------------------------------------
const API_BASE = "https://asbab-backend-production.up.railway.app";

// Cloudinary details (Cloud Name is public/safe to keep here;
// NEVER put API Secret in frontend code).
const CLOUDINARY_CLOUD_NAME = "esxxmwyz";
const CLOUDINARY_UPLOAD_PRESET = "ml_default";
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

// Simple form: an image + the raw message, exactly as the moderator would
// type or paste it in Telegram. Nothing else. Claude reads this message in
// the background (on the backend) only when "Send to Courier" is pressed.
function EntryForm({ initial, onCancel, onSave, saving }) {
  const [rawText, setRawText] = useState(initial?.rawText || "");
  const [moderator, setModerator] = useState(initial?.moderator || "");
  const [imageFile, setImageFile] = useState(null);
  const [imagePreview, setImagePreview] = useState(initial?.imageUrl || null);

  const handleFile = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    setImageFile(file);
    setImagePreview(URL.createObjectURL(file));
  };

  return (
    <div className="space-y-3">
      <div>
        <label className="text-[11px] text-[#8a7a5c] mb-1 block">প্রোডাক্ট ছবি</label>
        <label className="flex items-center justify-center h-48 rounded-lg border border-dashed border-[#3a3226] bg-[#0f0d0a] cursor-pointer overflow-hidden">
          {imagePreview ? (
            <img src={imagePreview} alt="preview" className="w-full h-full object-cover" />
          ) : (
            <div className="flex flex-col items-center gap-1 text-[#5c5342]">
              <ImagePlus size={22} />
              <span className="text-xs">ছবি সিলেক্ট করুন</span>
            </div>
          )}
          <input type="file" accept="image/*" onChange={handleFile} className="hidden" />
        </label>
      </div>

      <div>
        <label className="text-[11px] text-[#8a7a5c] mb-1 block">
          মেসেজ লিখুন / পেস্ট করুন
        </label>
        <textarea
          value={rawText}
          onChange={(e) => setRawText(e.target.value)}
          rows={8}
          placeholder={"7419\nHata:-26\nLong=52\nফুল সেট\n\nরায়হান\nলাকসাম কুমিল্লা\n01886600494\nবিল ২১০০ টাকা"}
          className="w-full bg-[#0f0d0a] border border-[#3a3226] rounded-lg px-3 py-2.5 text-sm text-[#f2ede4] placeholder-[#5c5342] focus:outline-none focus:ring-1 focus:ring-[#b8935a] resize-none"
        />
      </div>

      <div>
        <label className="text-[11px] text-[#8a7a5c] mb-1 block">মডারেটর</label>
        <input
          value={moderator}
          onChange={(e) => setModerator(e.target.value)}
          placeholder="Ayesha"
          className="w-full bg-[#0f0d0a] border border-[#3a3226] rounded-lg px-3 py-2.5 text-sm text-[#f2ede4] placeholder-[#5c5342] focus:outline-none focus:ring-1 focus:ring-[#b8935a]"
        />
      </div>

      <div className="flex gap-2 pt-2">
        <button
          onClick={onCancel}
          className="flex-1 bg-[#1c1913] border border-[#3a3226] text-[#8a7a5c] font-medium text-sm py-3 rounded-xl"
        >
          বাতিল
        </button>
        <button
          onClick={() => onSave({ rawText, moderator }, imageFile)}
          disabled={saving || !rawText.trim()}
          className="flex-1 flex items-center justify-center gap-2 bg-[#b8935a] hover:bg-[#c9a56d] disabled:opacity-60 text-[#0f0d0a] font-medium text-sm py-3 rounded-xl transition-colors"
        >
          {saving ? <Loader2 size={16} className="animate-spin" /> : null}
          সেভ করুন
        </button>
      </div>
    </div>
  );
}

function Modal({ title, onClose, children }) {
  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/70 backdrop-blur-sm">
      <div className="w-full sm:max-w-sm max-h-[90vh] overflow-y-auto bg-[#1a1712] border border-[#3a3226] rounded-t-2xl sm:rounded-2xl">
        <div className="flex items-center justify-between px-5 pt-5 pb-3 border-b border-[#2a251d] sticky top-0 bg-[#1a1712]">
          <h3 className="font-serif text-lg text-[#f2ede4]">{title}</h3>
          <button onClick={onClose} className="text-[#8a7a5c] hover:text-[#f2ede4]">
            <X size={20} />
          </button>
        </div>
        <div className="px-5 py-4">{children}</div>
      </div>
    </div>
  );
}

export default function AsbabDashboard() {
  const [entries, setEntries] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [showNew, setShowNew] = useState(false);
  const [editEntry, setEditEntry] = useState(null);
  const [sendingId, setSendingId] = useState(null);
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState(null);
  const [search, setSearch] = useState("");

  const showToast = (msg) => {
    setToast(msg);
    setTimeout(() => setToast(null), 3000);
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

  const handleCreate = async (form, imageFile) => {
    setSaving(true);
    try {
      let imageUrl = null;
      if (imageFile) imageUrl = await uploadImageToCloudinary(imageFile);
      const res = await fetch(`${API_BASE}/api/entries`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...form, imageUrl }),
      });
      if (!res.ok) throw new Error();
      const created = await res.json();
      setEntries((prev) => [created, ...prev]);
      setShowNew(false);
      showToast("নতুন এন্ট্রি যোগ হয়েছে");
    } catch {
      showToast("এন্ট্রি সেভ করা যায়নি");
    } finally {
      setSaving(false);
    }
  };

  const handleEditSave = async (form, imageFile) => {
    setSaving(true);
    try {
      let imageUrl = editEntry.imageUrl;
      if (imageFile) imageUrl = await uploadImageToCloudinary(imageFile);
      const res = await fetch(`${API_BASE}/api/entries/${editEntry.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...form, imageUrl }),
      });
      if (!res.ok) throw new Error();
      const updated = await res.json();
      setEntries((prev) => prev.map((e) => (e.id === updated.id ? updated : e)));
      setEditEntry(null);
      showToast("এন্ট্রি আপডেট হয়েছে");
    } catch {
      showToast("আপডেট করা যায়নি");
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id) => {
    try {
      const res = await fetch(`${API_BASE}/api/entries/${id}`, { method: "DELETE" });
      if (!res.ok) throw new Error();
      setEntries((prev) => prev.filter((e) => e.id !== id));
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
      setEntries((prev) => prev.map((e) => (e.id === entry.id ? data : e)));
      showToast(`#${data.productCode || entry.id} কুরিয়ারে পাঠানো হয়েছে`);
    } catch (err) {
      showToast(err.message || "কুরিয়ারে পাঠানো যায়নি");
    } finally {
      setSendingId(null);
    }
  };

  const filtered = entries.filter((e) =>
    (e.rawText || "").toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="min-h-screen bg-[#0f0d0a] text-[#f2ede4]" style={{ fontFamily: "'Inter', sans-serif" }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Cormorant+Garamond:wght@500;600&family=Inter:wght@400;500;600&display=swap');
        .font-serif { font-family: 'Cormorant Garamond', serif; }
      `}</style>

      <header className="sticky top-0 z-30 bg-[#0f0d0a]/95 backdrop-blur border-b border-[#241f17]">
        <div className="max-w-lg mx-auto px-5 pt-5 pb-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-[10px] uppercase tracking-[0.25em] text-[#8a7a5c]">Moderator Panel</p>
              <h1 className="font-serif text-[26px] leading-none mt-1 text-[#f2ede4]">
                Asbab <span className="text-[#b8935a] italic">Abaya</span>
              </h1>
            </div>
            <button
              onClick={loadEntries}
              className="w-9 h-9 rounded-full bg-[#2a2419] border border-[#3a3226] flex items-center justify-center text-xs font-medium text-[#d9b877]"
            >
              ↻
            </button>
          </div>
          <div className="mt-4 flex items-center gap-2 bg-[#17140f] border border-[#241f17] rounded-lg px-3 py-2">
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

      <main className="max-w-lg mx-auto px-5 py-5 space-y-5 pb-28">
        {loading && (
          <div className="flex items-center justify-center py-16 text-[#5c5342] gap-2">
            <Loader2 size={18} className="animate-spin" /> লোড হচ্ছে...
          </div>
        )}

        {error && <div className="text-center py-10 text-[#d9877e] text-sm">{error}</div>}

        {!loading && !error && filtered.length === 0 && (
          <div className="text-center py-16 text-[#5c5342] text-sm">
            কোনো এন্ট্রি নেই। নিচের + বাটনে ক্লিক করে প্রথম এন্ট্রি যোগ করুন।
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
                  <button onClick={() => setEditEntry(entry)} className="text-[#6b6152] hover:text-[#d9b877]">
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

      <button
        onClick={() => setShowNew(true)}
        className="fixed bottom-6 right-6 w-14 h-14 rounded-full bg-[#b8935a] hover:bg-[#c9a56d] flex items-center justify-center shadow-lg shadow-black/40 transition-colors"
      >
        <ImagePlus size={22} className="text-[#0f0d0a]" strokeWidth={2.5} />
      </button>

      {showNew && (
        <Modal title="নতুন এন্ট্রি" onClose={() => setShowNew(false)}>
          <EntryForm onCancel={() => setShowNew(false)} onSave={handleCreate} saving={saving} />
        </Modal>
      )}

      {editEntry && (
        <Modal title={`এডিট #${editEntry.id}`} onClose={() => setEditEntry(null)}>
          <EntryForm initial={editEntry} onCancel={() => setEditEntry(null)} onSave={handleEditSave} saving={saving} />
        </Modal>
      )}

      {toast && (
        <div className="fixed bottom-24 left-1/2 -translate-x-1/2 bg-[#1c1913] border border-[#3a3226] rounded-full px-4 py-2.5 flex items-center gap-2 text-sm shadow-lg">
          <CheckCircle2 size={15} className="text-emerald-400" />
          {toast}
        </div>
      )}
    </div>
  );
}
