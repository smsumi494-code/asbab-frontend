import React, { useState, useEffect, useRef } from "react";
import {
  Send, CheckCircle2, Package, Clock, Search, ImagePlus, X, Trash2, Pencil,
  Loader2, Paperclip, ChevronLeft, Menu, LogOut, UserPlus, Key, Shield,
} from "lucide-react";

// ---- CONFIG -----------------------------------------------------------
const API_BASE = "https://asbab-backend-production.up.railway.app";

const CLOUDINARY_CLOUD_NAME = "esxxmwyz";
const CLOUDINARY_UPLOAD_PRESET = "ml_default";

const GROUPS = [
  { id: "pending", title: "Pending Group Of Asbab", initials: "PG", color: "#b8935a" },
  { id: "all_order", title: "All Order Group Of Asbab", initials: "AO", color: "#7a9db8" },
  { id: "making", title: "Making Of Asbab", initials: "MK", color: "#8ab87a" },
];
// ------------------------------------------------------------------------

// Shrinks the photo in the browser before upload (mobile camera photos are
// often 3-5MB — this brings them down to a few hundred KB, which is why
// posting used to feel slow on mobile data).
function compressImage(file, maxWidth = 1000, quality = 0.65) {
  return new Promise((resolve) => {
    const img = new Image();
    const reader = new FileReader();
    reader.onload = (e) => {
      img.onload = () => {
        let { width, height } = img;
        if (width > maxWidth) {
          height = Math.round((height * maxWidth) / width);
          width = maxWidth;
        }
        const canvas = document.createElement("canvas");
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext("2d");
        ctx.drawImage(img, 0, 0, width, height);
        canvas.toBlob(
          (blob) => {
            if (blob) resolve(new File([blob], file.name, { type: "image/jpeg" }));
            else resolve(file); // fall back to the original if compression fails
          },
          "image/jpeg",
          quality
        );
      };
      img.onerror = () => resolve(file);
      img.src = e.target.result;
    };
    reader.onerror = () => resolve(file);
    reader.readAsDataURL(file);
  });
}

async function uploadImageToCloudinary(file) {
  const compressed = await compressImage(file);
  const formData = new FormData();
  formData.append("file", compressed);
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

// Converts Bangla digits (০-৯) to normal digits so search works no matter
// which digit script the moderator types.
function toEnglishDigits(str) {
  const map = { "০": "0", "১": "1", "২": "2", "৩": "3", "৪": "4", "৫": "5", "৬": "6", "৭": "7", "৮": "8", "৯": "9" };
  return String(str || "").replace(/[০-৯]/g, (d) => map[d]);
}

function StatusPill({ status, isMaking }) {
  if (status === "sent") {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-900/30 border border-emerald-700/40 px-2.5 py-1 text-[11px] font-medium text-emerald-300">
        <CheckCircle2 size={12} strokeWidth={2.5} />
        {isMaking ? "মেকিং সম্পন্ন" : "কুরিয়ারে পাঠানো হয়েছে"}
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

const globalStyle = `
  @import url('https://fonts.googleapis.com/css2?family=Cormorant+Garamond:wght@500;600&family=Inter:wght@400;500;600&display=swap');
  .font-serif { font-family: 'Cormorant Garamond', serif; }
`;

// Converts the VAPID public key (base64url) into the Uint8Array format the
// browser's Push API expects.
function urlBase64ToUint8Array(base64String) {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const rawData = atob(base64);
  return Uint8Array.from([...rawData].map((c) => c.charCodeAt(0)));
}

// Asks for notification permission and subscribes this device so it
// receives a push the moment anyone posts a new entry. Silently does
// nothing if the browser doesn't support push, or permission is denied.
async function subscribeToPush(token, apiBase) {
  try {
    if (!("serviceWorker" in navigator) || !("PushManager" in window)) return;

    const permission = await Notification.requestPermission();
    if (permission !== "granted") return;

    const reg = await navigator.serviceWorker.ready;
    const existing = await reg.pushManager.getSubscription();
    const sub =
      existing ||
      (await (async () => {
        const keyRes = await fetch(`${apiBase}/api/push/public-key`);
        const { publicKey } = await keyRes.json();
        return reg.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: urlBase64ToUint8Array(publicKey),
        });
      })());

    await fetch(`${apiBase}/api/push/subscribe`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify(sub.toJSON()),
    });
  } catch (err) {
    console.error("Push subscribe failed:", err);
  }
}

// ---- LOGIN SCREEN -------------------------------------------------------
function LoginScreen({ onLogin }) {
  const [phone, setPhone] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const submit = async () => {
    if (!phone.trim() || !password.trim()) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`${API_BASE}/api/auth/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phone: phone.trim(), password }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "লগইন ব্যর্থ হয়েছে");
      onLogin(data);
    } catch (err) {
      setError(err.message || "লগইন ব্যর্থ হয়েছে");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#0f0d0a] text-[#f2ede4] flex flex-col justify-center px-6" style={{ fontFamily: "'Inter', sans-serif" }}>
      <style>{globalStyle}</style>
      <div className="max-w-sm mx-auto w-full">
        <p className="text-[10px] uppercase tracking-[0.25em] text-[#8a7a5c] text-center">Moderator Panel</p>
        <h1 className="font-serif text-[32px] leading-none mt-1 text-center mb-10">
          Asbab <span className="text-[#b8935a] italic">Abaya</span>
        </h1>

        <div className="space-y-3">
          <div>
            <label className="text-[11px] text-[#8a7a5c] mb-1 block">ফোন নাম্বার</label>
            <input
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="01XXXXXXXXX"
              className="w-full bg-[#17140f] border border-[#3a3226] rounded-lg px-3 py-2.5 text-sm text-[#f2ede4] placeholder-[#5c5342] focus:outline-none focus:ring-1 focus:ring-[#b8935a]"
            />
          </div>
          <div>
            <label className="text-[11px] text-[#8a7a5c] mb-1 block">পাসওয়ার্ড</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && submit()}
              placeholder="••••••••"
              className="w-full bg-[#17140f] border border-[#3a3226] rounded-lg px-3 py-2.5 text-sm text-[#f2ede4] placeholder-[#5c5342] focus:outline-none focus:ring-1 focus:ring-[#b8935a]"
            />
          </div>

          {error && <p className="text-[12px] text-[#d9877e]">{error}</p>}

          <button
            onClick={submit}
            disabled={loading || !phone.trim() || !password.trim()}
            className="w-full flex items-center justify-center gap-2 bg-[#b8935a] hover:bg-[#c9a56d] disabled:opacity-60 text-[#0f0d0a] font-medium text-sm py-3 rounded-xl transition-colors mt-2"
          >
            {loading ? <Loader2 size={16} className="animate-spin" /> : null}
            লগইন করুন
          </button>
        </div>
      </div>
    </div>
  );
}

// ---- SIDE DRAWER: user + settings management (Admin only sections) ------
function SideDrawer({ open, onClose, auth, onLogout, authedFetch }) {
  const [users, setUsers] = useState([]);
  const [creds, setCreds] = useState([]);
  const [loadingUsers, setLoadingUsers] = useState(false);
  const [loadingCreds, setLoadingCreds] = useState(false);

  const [newPhone, setNewPhone] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [newName, setNewName] = useState("");
  const [newRole, setNewRole] = useState("moderator");
  const [savingUser, setSavingUser] = useState(false);

  const [courierKey, setCourierKey] = useState("");
  const [courierSecret, setCourierSecret] = useState("");
  const [savingCourier, setSavingCourier] = useState(false);

  const [aiProvider, setAiProvider] = useState("anthropic");
  const [aiKey, setAiKey] = useState("");
  const [savingAi, setSavingAi] = useState(false);

  const isAdmin = auth.role === "admin";

  const loadUsers = async () => {
    setLoadingUsers(true);
    try {
      const res = await authedFetch(`${API_BASE}/api/users`);
      if (res.ok) setUsers(await res.json());
    } finally {
      setLoadingUsers(false);
    }
  };

  const loadCreds = async () => {
    setLoadingCreds(true);
    try {
      const res = await authedFetch(`${API_BASE}/api/settings`);
      if (res.ok) setCreds(await res.json());
    } finally {
      setLoadingCreds(false);
    }
  };

  useEffect(() => {
    if (open && isAdmin) {
      loadUsers();
      loadCreds();
    }
  }, [open]);

  const addUser = async () => {
    if (!newPhone.trim() || !newPassword.trim()) return;
    setSavingUser(true);
    try {
      const res = await authedFetch(`${API_BASE}/api/users`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          phone: newPhone.trim(),
          password: newPassword,
          name: newName.trim(),
          role: newRole,
        }),
      });
      if (res.ok) {
        setNewPhone("");
        setNewPassword("");
        setNewName("");
        setNewRole("moderator");
        loadUsers();
      }
    } finally {
      setSavingUser(false);
    }
  };

  const toggleUserActive = async (user) => {
    await authedFetch(`${API_BASE}/api/users/${user.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ active: !user.active }),
    });
    loadUsers();
  };

  const deleteUser = async (user) => {
    if (!window.confirm(`${user.phone} কে সরিয়ে দিতে চান?`)) return;
    await authedFetch(`${API_BASE}/api/users/${user.id}`, { method: "DELETE" });
    loadUsers();
  };

  const saveCourierKey = async () => {
    if (!courierKey.trim() || !courierSecret.trim()) return;
    setSavingCourier(true);
    try {
      const res = await authedFetch(`${API_BASE}/api/settings`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type: "courier",
          provider: "steadfast",
          apiKey: courierKey.trim(),
          secretKey: courierSecret.trim(),
        }),
      });
      if (res.ok) {
        setCourierKey("");
        setCourierSecret("");
        loadCreds();
      }
    } finally {
      setSavingCourier(false);
    }
  };

  const saveAiKey = async () => {
    if (!aiKey.trim()) return;
    setSavingAi(true);
    try {
      const res = await authedFetch(`${API_BASE}/api/settings`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type: "ai", provider: aiProvider, apiKey: aiKey.trim() }),
      });
      if (res.ok) {
        setAiKey("");
        loadCreds();
      }
    } finally {
      setSavingAi(false);
    }
  };

  const deleteCred = async (cred) => {
    if (!window.confirm("এই API key ডিলিট করতে চান?")) return;
    await authedFetch(`${API_BASE}/api/settings/${cred.id}`, { method: "DELETE" });
    loadCreds();
  };

  const courierCreds = creds.filter((c) => c.type === "courier");
  const aiCreds = creds.filter((c) => c.type === "ai");

  return (
    <>
      <div
        className={`fixed inset-0 bg-black/60 z-40 transition-opacity ${open ? "opacity-100" : "opacity-0 pointer-events-none"}`}
        onClick={onClose}
      />
      <div
        className={`fixed top-0 right-0 h-full w-[85%] max-w-sm bg-[#0f0d0a] border-l border-[#241f17] z-50 transform transition-transform overflow-y-auto ${
          open ? "translate-x-0" : "translate-x-full"
        }`}
      >
        <div className="px-5 pt-6 pb-4 border-b border-[#241f17] flex items-center justify-between">
          <div>
            <p className="text-[10px] uppercase tracking-[0.2em] text-[#8a7a5c]">
              {auth.role === "admin" ? "Admin" : "Moderator"}
            </p>
            <p className="font-medium text-[15px]">{auth.name || auth.phone}</p>
          </div>
          <button onClick={onClose} className="text-[#8a7a5c] hover:text-[#f2ede4] p-1">
            <X size={20} />
          </button>
        </div>

        <div className="p-5">
          <button
            onClick={onLogout}
            className="w-full flex items-center justify-center gap-2 bg-[#1c1913] border border-[#3a3226] text-[#d9877e] font-medium text-sm py-2.5 rounded-xl mb-6"
          >
            <LogOut size={15} />
            লগআউট
          </button>

          {!isAdmin && (
            <p className="text-[12px] text-[#6b6152] text-center py-8">
              ইউজার ম্যানেজমেন্ট আর API সেটিংস শুধু Admin দেখতে পারেন।
            </p>
          )}

          {isAdmin && (
            <>
              {/* ---- User management ---- */}
              <div className="mb-8">
                <div className="flex items-center gap-2 mb-3">
                  <Shield size={15} className="text-[#b8935a]" />
                  <h3 className="font-medium text-[14px]">Admin ও Moderator</h3>
                </div>

                <div className="space-y-2 mb-3">
                  <input
                    value={newPhone}
                    onChange={(e) => setNewPhone(e.target.value)}
                    placeholder="ফোন নাম্বার"
                    className="w-full bg-[#17140f] border border-[#3a3226] rounded-lg px-3 py-2 text-sm placeholder-[#5c5342] focus:outline-none focus:ring-1 focus:ring-[#b8935a]"
                  />
                  <input
                    type="password"
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    placeholder="পাসওয়ার্ড"
                    className="w-full bg-[#17140f] border border-[#3a3226] rounded-lg px-3 py-2 text-sm placeholder-[#5c5342] focus:outline-none focus:ring-1 focus:ring-[#b8935a]"
                  />
                  <input
                    value={newName}
                    onChange={(e) => setNewName(e.target.value)}
                    placeholder="নাম (ঐচ্ছিক)"
                    className="w-full bg-[#17140f] border border-[#3a3226] rounded-lg px-3 py-2 text-sm placeholder-[#5c5342] focus:outline-none focus:ring-1 focus:ring-[#b8935a]"
                  />
                  <select
                    value={newRole}
                    onChange={(e) => setNewRole(e.target.value)}
                    className="w-full bg-[#17140f] border border-[#3a3226] rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-[#b8935a]"
                  >
                    <option value="moderator">Moderator</option>
                    <option value="admin">Admin</option>
                  </select>
                  <button
                    onClick={addUser}
                    disabled={savingUser || !newPhone.trim() || !newPassword.trim()}
                    className="w-full flex items-center justify-center gap-2 bg-[#b8935a] hover:bg-[#c9a56d] disabled:opacity-60 text-[#0f0d0a] font-medium text-sm py-2.5 rounded-lg"
                  >
                    {savingUser ? <Loader2 size={14} className="animate-spin" /> : <UserPlus size={14} />}
                    যোগ করুন
                  </button>
                </div>

                {loadingUsers ? (
                  <div className="text-center py-3 text-[#5c5342] text-xs">লোড হচ্ছে...</div>
                ) : (
                  <div className="space-y-1.5">
                    {users.map((u) => (
                      <div key={u.id} className="flex items-center justify-between bg-[#161310] border border-[#241f17] rounded-lg px-3 py-2">
                        <div className="min-w-0">
                          <p className="text-[13px] truncate">{u.name || u.phone}</p>
                          <p className="text-[11px] text-[#6b6152]">
                            {u.phone} · {u.role === "admin" ? "Admin" : "Moderator"} ·{" "}
                            <span className={u.active ? "text-emerald-400" : "text-[#d9877e]"}>
                              {u.active ? "সক্রিয়" : "নিষ্ক্রিয়"}
                            </span>
                          </p>
                        </div>
                        <div className="flex items-center gap-2 shrink-0 ml-2">
                          <button onClick={() => toggleUserActive(u)} className="text-[11px] text-[#8a7a5c] underline">
                            {u.active ? "বন্ধ" : "চালু"}
                          </button>
                          <button onClick={() => deleteUser(u)} className="text-[#6b6152] hover:text-red-400">
                            <Trash2 size={13} />
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* ---- API settings ---- */}
              <div>
                <div className="flex items-center gap-2 mb-3">
                  <Key size={15} className="text-[#b8935a]" />
                  <h3 className="font-medium text-[14px]">API সেটিংস</h3>
                </div>

                <p className="text-[11px] text-[#6b6152] mb-2">কুরিয়ার (Steadfast)</p>
                <div className="space-y-2 mb-2">
                  <input
                    value={courierKey}
                    onChange={(e) => setCourierKey(e.target.value)}
                    placeholder="Api Key"
                    className="w-full bg-[#17140f] border border-[#3a3226] rounded-lg px-3 py-2 text-sm placeholder-[#5c5342] focus:outline-none focus:ring-1 focus:ring-[#b8935a]"
                  />
                  <input
                    value={courierSecret}
                    onChange={(e) => setCourierSecret(e.target.value)}
                    placeholder="Secret Key"
                    className="w-full bg-[#17140f] border border-[#3a3226] rounded-lg px-3 py-2 text-sm placeholder-[#5c5342] focus:outline-none focus:ring-1 focus:ring-[#b8935a]"
                  />
                  <button
                    onClick={saveCourierKey}
                    disabled={savingCourier || !courierKey.trim() || !courierSecret.trim()}
                    className="w-full bg-[#241f17] border border-[#3a3226] hover:border-[#b8935a] disabled:opacity-60 text-[#d9b877] text-sm py-2 rounded-lg"
                  >
                    {savingCourier ? "সেভ হচ্ছে..." : "সেভ করুন"}
                  </button>
                </div>
                {courierCreds.map((c) => (
                  <div key={c.id} className="flex items-center justify-between bg-[#161310] border border-[#241f17] rounded-lg px-3 py-2 mb-3 text-[12px]">
                    <span>Steadfast: {c.apiKeyMasked}</span>
                    <button onClick={() => deleteCred(c)} className="text-[#6b6152] hover:text-red-400">
                      <Trash2 size={13} />
                    </button>
                  </div>
                ))}

                <p className="text-[11px] text-[#6b6152] mb-2 mt-4">AI (অর্ডার পড়ার জন্য)</p>
                <div className="space-y-2 mb-2">
                  <select
                    value={aiProvider}
                    onChange={(e) => setAiProvider(e.target.value)}
                    className="w-full bg-[#17140f] border border-[#3a3226] rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-[#b8935a]"
                  >
                    <option value="anthropic">Anthropic (Claude)</option>
                    <option value="openai">OpenAI</option>
                    <option value="google">Google (Gemini)</option>
                  </select>
                  <input
                    value={aiKey}
                    onChange={(e) => setAiKey(e.target.value)}
                    placeholder="API Key"
                    className="w-full bg-[#17140f] border border-[#3a3226] rounded-lg px-3 py-2 text-sm placeholder-[#5c5342] focus:outline-none focus:ring-1 focus:ring-[#b8935a]"
                  />
                  <button
                    onClick={saveAiKey}
                    disabled={savingAi || !aiKey.trim()}
                    className="w-full bg-[#241f17] border border-[#3a3226] hover:border-[#b8935a] disabled:opacity-60 text-[#d9b877] text-sm py-2 rounded-lg"
                  >
                    {savingAi ? "সেভ হচ্ছে..." : "সেভ করুন"}
                  </button>
                </div>
                {aiCreds.map((c) => (
                  <div key={c.id} className="flex items-center justify-between bg-[#161310] border border-[#241f17] rounded-lg px-3 py-2 text-[12px]">
                    <span className="capitalize">{c.provider}: {c.apiKeyMasked}</span>
                    <button onClick={() => deleteCred(c)} className="text-[#6b6152] hover:text-red-400">
                      <Trash2 size={13} />
                    </button>
                  </div>
                ))}
              </div>
            </>
          )}
        </div>
      </div>
    </>
  );
}

// ---- HOME SCREEN --------------------------------------------------------
function HomeScreen({ entries, onOpenGroup, onOpenMenu }) {
  const rows = GROUPS.map((g) => {
    const groupEntries = entries.filter((e) => e.group === g.id);
    const last = groupEntries[0];
    return { ...g, count: groupEntries.length, last };
  });

  return (
    <div className="min-h-screen bg-[#0f0d0a] text-[#f2ede4]" style={{ fontFamily: "'Inter', sans-serif" }}>
      <style>{globalStyle}</style>
      <header className="px-5 pt-6 pb-4 border-b border-[#241f17] flex items-center justify-between">
        <div>
          <p className="text-[10px] uppercase tracking-[0.25em] text-[#8a7a5c]">Moderator Panel</p>
          <h1 className="font-serif text-[28px] leading-none mt-1">
            Asbab <span className="text-[#b8935a] italic">Abaya</span>
          </h1>
        </div>
        <button onClick={onOpenMenu} className="text-[#8a7a5c] hover:text-[#f2ede4] p-2">
          <Menu size={22} />
        </button>
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

// ---- GROUP SCREEN ---------------------------------------------------------
function GroupScreen({ groupId, entries, onBack, refreshEntries, moderator, authedFetch, isAdmin }) {
  const group = GROUPS.find((g) => g.id === groupId);
  const [sendingId, setSendingId] = useState(null);
  const [toast, setToast] = useState(null);
  const [search, setSearch] = useState("");
  // Entries shown instantly on send, before the upload/server round-trip
  // finishes — makes posting feel as fast as Telegram.
  const [pendingEntries, setPendingEntries] = useState([]);

  const [text, setText] = useState("");
  // Each item: { id, url (blob preview or existing remote URL), file (File if new, null if already uploaded) }
  const [images, setImages] = useState([]);
  const [sending, setSending] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const textareaRef = useRef(null);
  const fileInputRef = useRef(null);

  const showToast = (msg) => {
    setToast(msg);
    setTimeout(() => setToast(null), 3000);
  };

  const handleFile = (e) => {
    const files = Array.from(e.target.files || []);
    if (!files.length) return;
    const newImages = files.map((file) => ({
      id: Math.random().toString(36).slice(2),
      url: URL.createObjectURL(file),
      file,
    }));
    setImages((prev) => [...prev, ...newImages]);
    e.target.value = ""; // allow picking the same file again later
  };

  const removeImage = (id) => {
    setImages((prev) => prev.filter((img) => img.id !== id));
  };

  const clearImage = () => {
    setImages([]);
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
    setImages((entry.imageUrls || []).map((url) => ({ id: url, url, file: null })));
    setTimeout(() => textareaRef.current?.focus(), 100);
  };

  const cancelEdit = () => {
    setEditingId(null);
    setText("");
    clearImage();
  };

  const handleSend = async () => {
    if (!text.trim() || sending) return;

    const localImages = images;
    const localText = text;
    const wasEditing = editingId;

    // Clear the compose bar immediately and show the post right away with
    // local previews — the actual upload/save happens in the background.
    setText("");
    setImages([]);
    setEditingId(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
    if (textareaRef.current) textareaRef.current.style.height = "auto";

    let tempId = null;
    if (!wasEditing) {
      tempId = `temp-${Date.now()}`;
      setPendingEntries((prev) => [
        {
          id: tempId,
          rawText: localText,
          imageUrls: localImages.map((img) => img.url),
          moderator,
          group: groupId,
          status: "pending",
          createdAt: new Date().toISOString(),
          uploading: true,
        },
        ...prev,
      ]);
    }

    setSending(true);
    try {
      const imageUrls = await Promise.all(
        localImages.map((img) => (img.file ? uploadImageToCloudinary(img.file) : img.url))
      );

      if (wasEditing) {
        const res = await authedFetch(`${API_BASE}/api/entries/${wasEditing}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ rawText: localText, imageUrls, moderator }),
        });
        if (!res.ok) throw new Error();
        showToast("এন্ট্রি আপডেট হয়েছে");
      } else {
        const res = await authedFetch(`${API_BASE}/api/entries`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ rawText: localText, imageUrls, moderator, group: groupId }),
        });
        if (!res.ok) throw new Error();
      }
      await refreshEntries();
    } catch {
      showToast("সেভ করা যায়নি, আবার চেষ্টা করুন");
    } finally {
      setSending(false);
      if (tempId) setPendingEntries((prev) => prev.filter((e) => e.id !== tempId));
    }
  };

  const handleDelete = async (id) => {
    if (!window.confirm("সত্যিই এই এন্ট্রি ডিলিট করতে চান?")) return;
    try {
      const res = await authedFetch(`${API_BASE}/api/entries/${id}`, { method: "DELETE" });
      if (!res.ok) throw new Error();
      await refreshEntries();
      showToast("এন্ট্রি ডিলিট হয়েছে");
    } catch {
      showToast("ডিলিট করা যায়নি");
    }
  };

  const handleSendToCourier = async (entry) => {
    setSendingId(entry.id);
    try {
      const res = await authedFetch(`${API_BASE}/api/entries/${entry.id}/send-to-courier`, {
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

  const handleMarkMakingDone = async (entry) => {
    setSendingId(entry.id);
    try {
      const res = await authedFetch(`${API_BASE}/api/entries/${entry.id}/mark-done`, {
        method: "POST",
      });
      if (!res.ok) throw new Error();
      await refreshEntries();
    } catch {
      showToast("আপডেট করা যায়নি");
    } finally {
      setSendingId(null);
    }
  };

  const groupEntries = entries.filter((e) => e.group === groupId);
  const normalizedSearch = toEnglishDigits(search.toLowerCase().trim());
  const filtered = groupEntries.filter((e) => {
    if (!normalizedSearch) return true;
    const haystack = toEnglishDigits(
      [e.rawText, e.productCode, e.customerPhone].filter(Boolean).join(" ").toLowerCase()
    );
    return haystack.includes(normalizedSearch);
  });
  const displayList = [...pendingEntries, ...filtered];

  return (
    <div className="min-h-screen bg-[#0f0d0a] text-[#f2ede4] flex flex-col" style={{ fontFamily: "'Inter', sans-serif" }}>
      <style>{globalStyle}</style>

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
        {displayList.length === 0 && (
          <div className="text-center py-16 text-[#5c5342] text-sm">
            কোনো এন্ট্রি নেই। নিচে ছবি ও মেসেজ দিয়ে প্রথম এন্ট্রি পাঠান।
          </div>
        )}

        {displayList.map((entry) => (
          <article
            key={entry.id}
            className={`rounded-2xl overflow-hidden border border-[#241f17] bg-[#161310] ${entry.uploading ? "opacity-60" : ""}`}
          >
            <div className="relative">
              {entry.imageUrls && entry.imageUrls.length ? (
                <div className={`grid gap-0.5 ${entry.imageUrls.length === 1 ? "grid-cols-1" : "grid-cols-2"}`}>
                  {entry.imageUrls.map((url, i) => (
                    <div
                      key={i}
                      className="bg-[#0a0908] flex items-center justify-center overflow-hidden"
                      style={{ aspectRatio: entry.imageUrls.length === 1 ? "4 / 5" : "3 / 4" }}
                    >
                      <img src={url} alt="" className="w-full h-full object-contain" />
                    </div>
                  ))}
                </div>
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
                <StatusPill status={entry.status} isMaking={groupId === "making"} />
              </div>
            </div>

            <div className="px-4 pt-4 pb-4">
              <div className="flex items-center justify-between mb-3">
                <span className="text-[11px] text-[#6b6152]">{entry.moderator}</span>
                {isAdmin && !entry.uploading && (
                  <div className="flex items-center gap-3">
                    {groupId === "all_order" && (
                      <button onClick={() => startEdit(entry)} className="text-[#6b6152] hover:text-[#d9b877]">
                        <Pencil size={14} />
                      </button>
                    )}
                    <button onClick={() => handleDelete(entry.id)} className="text-[#6b6152] hover:text-red-400">
                      <Trash2 size={14} />
                    </button>
                  </div>
                )}
              </div>

              <pre className="whitespace-pre-wrap font-sans text-sm text-[#c9bfa8] mb-4 leading-relaxed">
                {entry.rawText}
              </pre>

              {entry.uploading ? (
                <div className="w-full flex items-center justify-center gap-2 bg-[#1c1913] border border-[#3a3226] text-[#8a7a5c] font-medium text-sm py-3 rounded-xl">
                  <Loader2 size={15} className="animate-spin" />
                  পাঠানো হচ্ছে...
                </div>
              ) : (
                <>
                  {entry.status === "sent" && (
                    <div className="text-[11px] text-[#8a7a5c] mb-3 space-y-0.5">
                      <div>{entry.customerName} · {entry.customerPhone}</div>
                      <div>{entry.customerAddress}</div>
                    </div>
                  )}

                  {groupId === "making" ? (
                    !isAdmin ? null : entry.status === "sent" ? (
                      <button className="w-full flex items-center justify-center gap-2 bg-emerald-800/80 border border-emerald-600/50 text-emerald-100 font-medium text-sm py-3 rounded-xl cursor-default">
                        <CheckCircle2 size={15} strokeWidth={2.5} />
                        সেন্ড সাকসেসফুল
                      </button>
                    ) : (
                      <button
                        onClick={() => handleMarkMakingDone(entry)}
                        disabled={sendingId === entry.id}
                        className="w-full flex items-center justify-center gap-2 bg-[#b8935a] hover:bg-[#c9a56d] disabled:opacity-60 text-[#0f0d0a] font-medium text-sm py-3 rounded-xl transition-colors"
                      >
                        {sendingId === entry.id ? (
                          <Loader2 size={15} className="animate-spin" />
                        ) : (
                          <Send size={15} strokeWidth={2.5} />
                        )}
                        Send Making
                      </button>
                    )
                  ) : entry.status === "sent" ? (
                    <div className="w-full flex items-center justify-center gap-2 bg-emerald-900/30 border border-emerald-700/40 text-emerald-200 font-medium text-sm py-3 rounded-xl">
                      <Package size={15} strokeWidth={2.5} />
                      পার্সেল আইডি: {entry.consignmentId || "—"} · ৳{entry.amount || 0}
                    </div>
                  ) : groupId === "pending" ? (
                    isAdmin ? (
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
                    ) : null
                  ) : (
                    // All Order group, not yet sent
                <div className="w-full flex items-center justify-center gap-2 bg-[#1c1913] border border-[#3a3226] text-[#8a7a5c] font-medium text-sm py-3 rounded-xl cursor-default">
                  <Clock size={15} strokeWidth={2.5} />
                  Waiting for courier send
                </div>
              )}
                </>
              )}
            </div>
          </article>
        ))}
      </main>

      {groupId === "all_order" && (
        <div className="sticky bottom-0 bg-[#0f0d0a]/95 backdrop-blur border-t border-[#241f17]">
          <div className="max-w-lg mx-auto px-3 py-3">
            {editingId && (
              <div className="flex items-center justify-between text-[11px] text-[#b8935a] mb-1.5 px-1">
                <span>এডিট করছেন #{editingId}</span>
                <button onClick={cancelEdit} className="underline">বাতিল</button>
              </div>
            )}
            {images.length > 0 && (
              <div className="flex gap-2 mb-2 overflow-x-auto">
                {images.map((img) => (
                  <div key={img.id} className="relative shrink-0">
                    <img src={img.url} alt="" className="h-16 w-16 object-cover rounded-lg border border-[#3a3226]" />
                    <button
                      onClick={() => removeImage(img.id)}
                      className="absolute -top-1.5 -right-1.5 bg-black rounded-full p-0.5 border border-[#3a3226]"
                    >
                      <X size={11} />
                    </button>
                  </div>
                ))}
              </div>
            )}
            <div className="flex items-end gap-2">
              <label className="shrink-0 w-10 h-10 rounded-full bg-[#241f17] border border-[#3a3226] flex items-center justify-center cursor-pointer text-[#8a7a5c] hover:text-[#d9b877]">
                <Paperclip size={17} />
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*"
                  multiple
                  onChange={handleFile}
                  className="hidden"
                />
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
      )}

      {toast && (
        <div className="fixed bottom-24 left-1/2 -translate-x-1/2 bg-[#1c1913] border border-[#3a3226] rounded-full px-4 py-2.5 flex items-center gap-2 text-sm shadow-lg z-40">
          <CheckCircle2 size={15} className="text-emerald-400" />
          {toast}
        </div>
      )}
    </div>
  );
}

// ---- ROOT ----------------------------------------------------------------
export default function AsbabDashboard() {
  const [auth, setAuth] = useState(() => {
    const token = localStorage.getItem("asbab_token");
    const role = localStorage.getItem("asbab_role");
    const name = localStorage.getItem("asbab_name");
    const phone = localStorage.getItem("asbab_phone");
    return token ? { token, role, name, phone } : null;
  });

  const [entries, setEntries] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [view, setView] = useState("home");
  const [drawerOpen, setDrawerOpen] = useState(false);

  const authedFetch = async (url, options = {}) => {
    const res = await fetch(url, {
      ...options,
      headers: { ...(options.headers || {}), Authorization: `Bearer ${auth?.token}` },
    });
    if (res.status === 401) {
      handleLogout();
    }
    return res;
  };

  const handleLogin = (data) => {
    localStorage.setItem("asbab_token", data.token);
    localStorage.setItem("asbab_role", data.role);
    localStorage.setItem("asbab_name", data.name || "");
    localStorage.setItem("asbab_phone", data.phone || "");
    setAuth({ token: data.token, role: data.role, name: data.name, phone: data.phone });
  };

  const handleLogout = () => {
    localStorage.removeItem("asbab_token");
    localStorage.removeItem("asbab_role");
    localStorage.removeItem("asbab_name");
    localStorage.removeItem("asbab_phone");
    setAuth(null);
    setEntries([]);
    setView("home");
  };

  const loadEntries = async (silent = false) => {
    if (!auth) return;
    if (!silent) {
      setLoading(true);
      setError(null);
    }
    try {
      const res = await authedFetch(`${API_BASE}/api/entries`);
      if (!res.ok) throw new Error("Failed to load");
      setEntries(await res.json());
    } catch (err) {
      if (!silent) setError("এন্ট্রি লোড করা যায়নি। Backend URL ঠিক আছে কিনা দেখুন।");
    } finally {
      if (!silent) setLoading(false);
    }
  };

  useEffect(() => {
    if (!auth) return;
    loadEntries(); // initial load — shows the loading screen once

    subscribeToPush(auth.token, API_BASE);

    // Real-time connection — the backend pings this the instant anyone
    // creates/edits/deletes/sends an entry, so the feed updates within a
    // second or two, like Telegram, instead of waiting for a manual or
    // timed refresh. All of these use silent=true so they update the list
    // invisibly instead of flashing the full-screen loader.
    let es;
    let reconnectTimer;
    const connect = () => {
      es = new EventSource(`${API_BASE}/api/entries/stream?token=${auth.token}`);
      es.onmessage = () => loadEntries(true);
      es.onerror = () => {
        es.close();
        reconnectTimer = setTimeout(connect, 3000);
      };
    };
    connect();

    // Safety-net poll in case the live connection silently drops
    const interval = setInterval(() => loadEntries(true), 60000);
    const onVisible = () => {
      if (document.visibilityState === "visible") loadEntries(true);
    };
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("focus", onVisible);

    return () => {
      clearInterval(interval);
      clearTimeout(reconnectTimer);
      if (es) es.close();
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("focus", onVisible);
    };
  }, [auth]);

  if (!auth) {
    return <LoginScreen onLogin={handleLogin} />;
  }

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

  return (
    <>
      {view === "home" ? (
        <HomeScreen entries={entries} onOpenGroup={(id) => setView(id)} onOpenMenu={() => setDrawerOpen(true)} />
      ) : (
        <GroupScreen
          groupId={view}
          entries={entries}
          onBack={() => setView("home")}
          refreshEntries={() => loadEntries(true)}
          moderator={auth.name || auth.phone}
          authedFetch={authedFetch}
          isAdmin={auth.role === "admin"}
        />
      )}
      <SideDrawer
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        auth={auth}
        onLogout={handleLogout}
        authedFetch={authedFetch}
      />
    </>
  );
}
