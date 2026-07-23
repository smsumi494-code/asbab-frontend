import React, { useState, useEffect, useRef } from "react";
import {
  Send, CheckCircle2, Package, Clock, Search, ImagePlus, X, Trash2, Pencil,
  Loader2, Paperclip, ChevronLeft, Menu, LogOut, UserPlus, Key, Shield, Lock, BarChart3, AlertTriangle,
} from "lucide-react";

// ---- CONFIG -----------------------------------------------------------
const API_BASE = "https://asbab-backend-production.up.railway.app";

const CLOUDINARY_CLOUD_NAME = "esxxmwyz";
const CLOUDINARY_UPLOAD_PRESET = "ml_default";

const GROUPS = [
  { id: "pending", title: "Pending Group Of Asbab", initials: "PG", color: "#b8935a" },
  { id: "all_order", title: "All Order Group Of Asbab", initials: "AO", color: "#7a9db8" },
  { id: "making", title: "Making Of Asbab", initials: "MK", color: "#8ab87a" },
  { id: "website_order", title: "Website Order Of Asbab", initials: "WO", color: "#9b7ac9" },
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

// Full date + time (always both), shown small at the bottom of every
// entry card — e.g. "11 Jul 2026, 3:45 PM".
function formatFullDateTime(iso) {
  if (!iso) return "";
  const d = new Date(iso);
  const date = d.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
  const time = d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
  return `${date}, ${time}`;
}

// Converts Bangla digits (০-৯) to normal digits so search works no matter
// which digit script the moderator types.
function toEnglishDigits(str) {
  const map = { "০": "0", "১": "1", "২": "2", "৩": "3", "৪": "4", "৫": "5", "৬": "6", "৭": "7", "৮": "8", "৯": "9" };
  return String(str || "").replace(/[০-৯]/g, (d) => map[d]);
}

function StatusPill({ status, groupId }) {
  if (status === "sent") {
    const labels = {
      making: "মেকিং সম্পন্ন",
      website_order: "All Order-এ পাঠানো হয়েছে",
    };
    return (
      <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-900/30 border border-emerald-700/40 px-2.5 py-1 text-[11px] font-medium text-emerald-300">
        <CheckCircle2 size={12} strokeWidth={2.5} />
        {labels[groupId] || "কুরিয়ারে পাঠানো হয়েছে"}
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

// Plays the notification sound (public/notification.wav) after a post or
// delete completes.
function playNotificationSound() {
  try {
    const audio = new Audio("/notification.wav");
    audio.volume = 0.6;
    audio.play().catch(() => {
      // Browsers block audio before any user interaction — safe to ignore
    });
  } catch {
    // ignore
  }
}

// Converts the VAPID public key (base64url) into the Uint8Array format the
// browser's Push API expects.
// Opens a new tab with a 3x3 inch printable "courier pad" for one order —
// page name/tagline header, parcel ID, product photo, and delivery
// details — sized to print directly onto a 3x3" label.
// Pulls out the size/measurement line (Long/সাইজ/লং/লম্বা) from the raw
// order text, so it can be shown alongside Order #/Parcel ID without
// needing a separate structured field.
function extractSizeInfo(rawText) {
  if (!rawText) return null;
  const lines = rawText.split("\n").map((l) => l.trim()).filter(Boolean);
  const sizeLine = lines.find((l) => /(long|size|সাইজ|লং|লম্বা)/i.test(l));
  return sizeLine || null;
}

// Pulls a Bangladeshi phone number out of raw text, preserving its
// original formatting (spaces/dashes) so it can be highlighted exactly as
// typed — used to make phone numbers clickable inside the entry text.
const PHONE_REGEX = /(?:\+?880[\s-]?|0)1[3-9](?:[\s-]?\d){8}/;

function extractPhoneMatch(rawText) {
  if (!rawText) return null;
  return rawText.match(PHONE_REGEX);
}

// Normalizes any phone format down to a plain 11-digit "01XXXXXXXXX" for
// comparing two phone numbers reliably regardless of how each was typed.
function normalizePhoneForMatch(raw) {
  let digits = (raw || "").replace(/\D/g, "");
  if (digits.startsWith("880")) digits = digits.slice(3);
  if (!digits.startsWith("0") && digits.length === 10) digits = "0" + digits;
  return digits;
}

// Renders text with the phone number (if any) turned into a clickable,
// underlined span — everything else stays plain text.
function renderTextWithClickablePhone(text, onPhoneClick) {
  const match = extractPhoneMatch(text);
  if (!match) return text;
  const idx = match.index;
  const matched = match[0];
  return (
    <>
      {text.slice(0, idx)}
      <span
        onClick={(e) => {
          e.stopPropagation();
          onPhoneClick(matched);
        }}
        className="text-[#d9b877] underline decoration-dotted cursor-pointer font-medium"
      >
        {matched}
      </span>
      {text.slice(idx + matched.length)}
    </>
  );
}

function printCourierPad(entry, page, sizeInfo) {
  const tagline = page?.tagline || "";
  const pageName = entry.pageName || page?.name || "Asbab Abaya";
  const orderNumber = entry.productCode || entry.id;
  const image = entry.imageUrls && entry.imageUrls[0] ? entry.imageUrls[0] : null;

  const escapeHtml = (s) =>
    String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

  const html = `
<!doctype html>
<html>
<head>
<meta charset="utf-8" />
<title>Courier Pad</title>
<style>
  @page { size: 3in 3in; margin: 0; }
  * { box-sizing: border-box; }
  html, body {
    width: 3in; height: 3in; margin: 0; padding: 0;
    font-family: 'Times New Roman', Times, Georgia, serif;
    color: #111;
    -webkit-print-color-adjust: exact;
  }
  .pad {
    width: 3in; height: 3in; padding: 0.17in; display: flex; flex-direction: column;
    border: 3px double #111;
  }
  .header { text-align: center; }
  .page-name { font-size: 15pt; font-weight: 700; letter-spacing: 0.5px; }
  .tagline { font-size: 7pt; font-style: italic; color: #444; margin-top: 1px; }
  hr { border: none; border-top: 1.4px solid #111; margin: 5px 0; width: 100%; }
  .parcel-label { text-align: center; font-size: 7pt; letter-spacing: 1.5px; color: #555; }
  .parcel-id { text-align: center; font-size: 21pt; font-weight: 700; line-height: 1.15; word-break: break-all; }
  .body-row { display: flex; flex: 1; gap: 0.1in; min-height: 0; }
  .photo-col { width: 38%; display: flex; align-items: center; justify-content: center; }
  .photo-col img {
    width: 100%; height: 100%; object-fit: cover; border: 1px solid #999;
  }
  .photo-col .no-photo {
    width: 100%; height: 100%; border: 1px dashed #aaa; display: flex;
    align-items: center; justify-content: center; font-size: 7pt; color: #999; text-align: center;
  }
  .info-col { width: 62%; display: flex; flex-direction: column; justify-content: center; }
  .order-num { font-size: 15pt; font-weight: 700; margin-bottom: 4px; }
  .info-line { font-size: 9pt; margin: 1.5px 0; line-height: 1.3; }
  .info-line .label { color: #555; font-size: 7.5pt; }
  .bill { font-size: 11pt; font-weight: 700; margin-top: 3px; }
</style>
</head>
<body>
  <div class="pad">
    <div class="header">
      <div class="page-name">${escapeHtml(pageName)}</div>
      ${tagline ? `<div class="tagline">${escapeHtml(tagline)}</div>` : ""}
    </div>
    <hr />
    <div class="parcel-label">PARCEL ID</div>
    <div class="parcel-id">${escapeHtml(entry.consignmentId || "—")}</div>
    <hr />
    <div class="body-row">
      <div class="photo-col">
        ${image ? `<img src="${escapeHtml(image)}" />` : `<div class="no-photo">No Photo</div>`}
      </div>
      <div class="info-col">
        <div class="order-num">Order #${escapeHtml(orderNumber)}</div>
        ${sizeInfo ? `<div class="info-line"><span class="label">Size:</span> ${escapeHtml(sizeInfo)}</div>` : ""}
        <div class="info-line"><span class="label">Name:</span> ${escapeHtml(entry.customerName || "—")}</div>
        <div class="info-line"><span class="label">Phone:</span> ${escapeHtml(entry.customerPhone || "—")}</div>
        <div class="bill">৳${escapeHtml(entry.amount || 0)}</div>
      </div>
    </div>
  </div>
  <script>
    ${image ? `
      var img = document.querySelector('img');
      var done = false;
      function go() { if (!done) { done = true; window.print(); } }
      img.addEventListener('load', go);
      img.addEventListener('error', go);
      setTimeout(go, 1500);
    ` : `window.print();`}
  </script>
</body>
</html>`;

  const win = window.open("", "_blank", "width=400,height=500");
  if (!win) return;
  win.document.open();
  win.document.write(html);
  win.document.close();
}

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
function SideDrawer({ open, onClose, auth, onLogout, authedFetch, appSettings, refreshAppSettings }) {
  const [users, setUsers] = useState([]);
  const [loadingUsers, setLoadingUsers] = useState(false);

  const [newPhone, setNewPhone] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [newName, setNewName] = useState("");
  const [newRole, setNewRole] = useState("moderator");
  const [savingUser, setSavingUser] = useState(false);
  const [editingPermsFor, setEditingPermsFor] = useState(null); // user id currently expanded
  const [permsDraft, setPermsDraft] = useState([]); // array of group ids checked, while editing
  const [permsRestricted, setPermsRestricted] = useState(false); // false = unrestricted (sees all)
  const [savingPerms, setSavingPerms] = useState(false);

  const [lateEnabled, setLateEnabled] = useState(true);
  const [lateCutoffHour, setLateCutoffHour] = useState(12);
  const [lateCutoffMinute, setLateCutoffMinute] = useState(30);
  const [savingLateSettings, setSavingLateSettings] = useState(false);

  useEffect(() => {
    if (appSettings) {
      setLateEnabled(appSettings.latePostPromptEnabled);
      setLateCutoffHour(appSettings.latePostPromptCutoffHour);
      setLateCutoffMinute(appSettings.latePostPromptCutoffMinute);
    }
  }, [appSettings]);

  const saveLateSettings = async () => {
    setSavingLateSettings(true);
    try {
      await authedFetch(`${API_BASE}/api/app-settings`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          latePostPromptEnabled: lateEnabled,
          latePostPromptCutoffHour: lateCutoffHour,
          latePostPromptCutoffMinute: lateCutoffMinute,
        }),
      });
      refreshAppSettings();
    } finally {
      setSavingLateSettings(false);
    }
  };

  const [pages, setPages] = useState([]);
  const [loadingPages, setLoadingPages] = useState(false);
  const [showPageForm, setShowPageForm] = useState(false);
  const [editingPageId, setEditingPageId] = useState(null); // null = "add new" mode
  const [pageName, setPageName] = useState("");
  const [pageTagline, setPageTagline] = useState("");
  const [pageCourierKey, setPageCourierKey] = useState("");
  const [pageCourierSecret, setPageCourierSecret] = useState("");
  const [pageAiCreds, setPageAiCreds] = useState([{ provider: "google", apiKey: "" }]);
  const [pageSmsOnWebsiteOrder, setPageSmsOnWebsiteOrder] = useState(false);
  const [pageSmsOnAllOrder, setPageSmsOnAllOrder] = useState(false);
  const [pageSmsMessage, setPageSmsMessage] = useState("");
  const [pageSmsToken, setPageSmsToken] = useState("");
  const [pageDeliveryNote, setPageDeliveryNote] = useState("");
  const [pageModeratorEmail, setPageModeratorEmail] = useState("");
  const [pageModeratorPassword, setPageModeratorPassword] = useState("");
  const [savingPage, setSavingPage] = useState(false);

  const [smsBalance, setSmsBalance] = useState([]);
  const [loadingSmsBalance, setLoadingSmsBalance] = useState(false);
  const [drawerToast, setDrawerToast] = useState(null);

  const showDrawerToast = (msg) => {
    setDrawerToast(msg);
    setTimeout(() => setDrawerToast(null), 3000);
  };

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

  const loadPages = async () => {
    setLoadingPages(true);
    try {
      const res = await authedFetch(`${API_BASE}/api/pages`);
      if (res.ok) setPages(await res.json());
    } finally {
      setLoadingPages(false);
    }
  };

  const loadSmsBalance = async () => {
    setLoadingSmsBalance(true);
    try {
      const res = await authedFetch(`${API_BASE}/api/entries/sms-balance`);
      const data = await res.json();
      setSmsBalance(res.ok && Array.isArray(data) ? data : []);
    } catch {
      setSmsBalance([]);
    } finally {
      setLoadingSmsBalance(false);
    }
  };

  useEffect(() => {
    if (open && isAdmin) {
      loadUsers();
      loadPages();
      loadSmsBalance();
    }
  }, [open]);

  const resetPageForm = () => {
    setShowPageForm(false);
    setEditingPageId(null);
    setPageName("");
    setPageTagline("");
    setPageCourierKey("");
    setPageCourierSecret("");
    setPageAiCreds([{ provider: "google", apiKey: "" }]);
    setPageSmsOnWebsiteOrder(false);
    setPageSmsOnAllOrder(false);
    setPageSmsMessage("");
    setPageSmsToken("");
    setPageDeliveryNote("");
    setPageModeratorEmail("");
    setPageModeratorPassword("");
  };

  const startEditPage = async (page) => {
    const res = await authedFetch(`${API_BASE}/api/pages/${page.id}`);
    if (!res.ok) return;
    const data = await res.json();
    setShowPageForm(true);
    setEditingPageId(page.id);
    setPageName(data.name || "");
    setPageTagline(data.tagline || "");
    setPageCourierKey(data.courierApiKey || "");
    setPageCourierSecret(data.courierSecretKey || "");
    setPageAiCreds(
      data.aiCredentials && data.aiCredentials.length ? data.aiCredentials : [{ provider: "google", apiKey: "" }]
    );
    setPageSmsOnWebsiteOrder(!!data.smsOnWebsiteOrder);
    setPageSmsOnAllOrder(!!data.smsOnAllOrder);
    setPageSmsMessage(data.smsMessage || "");
    setPageSmsToken(data.smsToken || "");
    setPageDeliveryNote(data.deliveryNote || "");
    setPageModeratorEmail(data.moderatorEmail || "");
    setPageModeratorPassword(data.moderatorPassword || "");
  };

  const updatePageAiCred = (index, field, value) => {
    setPageAiCreds((prev) => prev.map((c, i) => (i === index ? { ...c, [field]: value } : c)));
  };

  const addPageAiCredRow = () => {
    if (pageAiCreds.length >= 5) return;
    setPageAiCreds((prev) => [...prev, { provider: "google", apiKey: "" }]);
  };

  const removePageAiCredRow = (index) => {
    setPageAiCreds((prev) => prev.filter((_, i) => i !== index));
  };

  const savePage = async () => {
    const cleanCreds = pageAiCreds.filter((c) => c.apiKey.trim());
    if (!pageName.trim() || !pageCourierKey.trim() || !pageCourierSecret.trim() || cleanCreds.length === 0) return;
    setSavingPage(true);
    try {
      const body = JSON.stringify({
        name: pageName.trim(),
        tagline: pageTagline.trim(),
        courierApiKey: pageCourierKey.trim(),
        courierSecretKey: pageCourierSecret.trim(),
        aiCredentials: cleanCreds.map((c) => ({ provider: c.provider, apiKey: c.apiKey.trim() })),
        smsOnWebsiteOrder: pageSmsOnWebsiteOrder,
        smsOnAllOrder: pageSmsOnAllOrder,
        smsMessage: pageSmsMessage.trim(),
        smsToken: pageSmsToken.trim(),
        deliveryNote: pageDeliveryNote.trim(),
        moderatorEmail: pageModeratorEmail.trim(),
        moderatorPassword: pageModeratorPassword.trim(),
      });
      const res = editingPageId
        ? await authedFetch(`${API_BASE}/api/pages/${editingPageId}`, {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body,
          })
        : await authedFetch(`${API_BASE}/api/pages`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body,
          });
      if (res.ok) {
        resetPageForm();
        loadPages();
        showDrawerToast(editingPageId ? "পেইজ আপডেট হয়েছে" : "পেইজ যোগ হয়েছে");
      } else {
        const data = await res.json().catch(() => ({}));
        showDrawerToast(data.error || "সেভ করা যায়নি");
      }
    } finally {
      setSavingPage(false);
    }
  };

  const deletePage = async (page) => {
    if (!window.confirm(`"${page.name}" পেইজটা ডিলিট করতে চান? এর Courier/AI key-ও মুছে যাবে।`)) return;
    if (editingPageId === page.id) resetPageForm();
    await authedFetch(`${API_BASE}/api/pages/${page.id}`, { method: "DELETE" });
    loadPages();
  };

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

  const openPermsEditor = (user) => {
    setEditingPermsFor(user.id);
    setPermsRestricted(!!user.allowedGroups);
    setPermsDraft(user.allowedGroups || GROUPS.map((g) => g.id));
  };

  const togglePermsGroup = (groupId) => {
    setPermsDraft((prev) => (prev.includes(groupId) ? prev.filter((g) => g !== groupId) : [...prev, groupId]));
  };

  const savePerms = async (user) => {
    setSavingPerms(true);
    try {
      await authedFetch(`${API_BASE}/api/users/${user.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ allowedGroups: permsRestricted ? permsDraft : null }),
      });
      setEditingPermsFor(null);
      loadUsers();
    } finally {
      setSavingPerms(false);
    }
  };

  const deleteUser = async (user) => {
    if (!window.confirm(`${user.phone} কে সরিয়ে দিতে চান?`)) return;
    await authedFetch(`${API_BASE}/api/users/${user.id}`, { method: "DELETE" });
    loadUsers();
  };

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
              ইউজার ম্যানেজমেন্ট আর পেইজ সেটিংস শুধু Admin দেখতে পারেন।
            </p>
          )}

          {isAdmin && (
            <>
              {/* ---- SMS balance ---- */}
              <div className="mb-8 bg-[#161310] border border-[#241f17] rounded-xl px-4 py-3">
                <div className="flex items-center justify-between mb-2">
                  <p className="text-[10px] uppercase tracking-wider text-[#8a7a5c]">SMS ব্যালেন্স</p>
                  <button
                    onClick={loadSmsBalance}
                    disabled={loadingSmsBalance}
                    className="text-[11px] text-[#8a7a5c] hover:text-[#d9b877] underline"
                  >
                    রিফ্রেশ
                  </button>
                </div>
                {loadingSmsBalance ? (
                  <Loader2 size={16} className="animate-spin text-[#8a7a5c]" />
                ) : smsBalance.length === 0 ? (
                  <p className="text-[12px] text-[#5c5342]">কোনো পেইজে SMS Token সেট করা নেই</p>
                ) : (
                  <div className="space-y-1">
                    {smsBalance.map((b) => (
                      <p key={b.pageId} className="text-[13px] text-[#c9bfa8]">
                        {b.pageName}: <span className="text-[#d9b877] font-semibold">{b.balance ?? "—"}</span>
                      </p>
                    ))}
                  </div>
                )}
              </div>

              {/* ---- Late-night post day-choice prompt settings ---- */}
              <div className="mb-8 bg-[#161310] border border-[#241f17] rounded-xl px-4 py-3">
                <p className="text-[10px] uppercase tracking-wider text-[#8a7a5c] mb-2">
                  রাত/সকালের অর্ডার নিশ্চিতকরণ
                </p>
                <p className="text-[11px] text-[#6b6152] mb-3">
                  রাত ১২:০১ থেকে নিচের সময় পর্যন্ত পোস্ট করলে "আজকের নাকি গতকালের অর্ডার" জিজ্ঞেস করবে
                </p>
                <label className="flex items-center gap-2 text-[12px] text-[#c9bfa8] cursor-pointer mb-3">
                  <input
                    type="checkbox"
                    checked={lateEnabled}
                    onChange={(e) => setLateEnabled(e.target.checked)}
                    className="accent-[#b8935a]"
                  />
                  এই সতর্কতা চালু রাখুন
                </label>
                {lateEnabled && (
                  <div className="flex items-center gap-2 mb-3">
                    <span className="text-[11px] text-[#8a7a5c]">শেষ সময় (দুপুর পর্যন্ত):</span>
                    <input
                      type="number"
                      min={1}
                      max={12}
                      value={lateCutoffHour}
                      onChange={(e) => setLateCutoffHour(Number(e.target.value))}
                      className="w-14 bg-[#17140f] border border-[#3a3226] rounded-lg px-2 py-1.5 text-sm text-center"
                    />
                    <span className="text-[#6b6152]">:</span>
                    <input
                      type="number"
                      min={0}
                      max={59}
                      value={lateCutoffMinute}
                      onChange={(e) => setLateCutoffMinute(Number(e.target.value))}
                      className="w-14 bg-[#17140f] border border-[#3a3226] rounded-lg px-2 py-1.5 text-sm text-center"
                    />
                    <span className="text-[11px] text-[#8a7a5c]">PM</span>
                  </div>
                )}
                <button
                  onClick={saveLateSettings}
                  disabled={savingLateSettings}
                  className="w-full bg-[#b8935a] hover:bg-[#c9a56d] disabled:opacity-60 text-[#0f0d0a] font-medium text-sm py-2 rounded-lg"
                >
                  {savingLateSettings ? "সেভ হচ্ছে..." : "সেভ করুন"}
                </button>
              </div>

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
                      <div key={u.id}>
                        <div className="flex items-center justify-between bg-[#161310] border border-[#241f17] rounded-lg px-3 py-2">
                          <div className="min-w-0">
                            <p className="text-[13px] truncate">{u.name || u.phone}</p>
                            <p className="text-[11px] text-[#6b6152]">
                              {u.phone} · {u.role === "admin" ? "Admin" : "Moderator"} ·{" "}
                              <span className={u.active ? "text-emerald-400" : "text-[#d9877e]"}>
                                {u.active ? "সক্রিয়" : "নিষ্ক্রিয়"}
                              </span>
                              {u.role === "moderator" && u.allowedGroups && (
                                <span className="text-[#d9b877]"> · সীমাবদ্ধ</span>
                              )}
                            </p>
                          </div>
                          <div className="flex items-center gap-2 shrink-0 ml-2">
                            {u.role === "moderator" && (
                              <button
                                onClick={() => (editingPermsFor === u.id ? setEditingPermsFor(null) : openPermsEditor(u))}
                                className="text-[#6b6152] hover:text-[#d9b877]"
                                title="গ্রুপ অনুমতি"
                              >
                                <Shield size={13} />
                              </button>
                            )}
                            <button onClick={() => toggleUserActive(u)} className="text-[11px] text-[#8a7a5c] underline">
                              {u.active ? "বন্ধ" : "চালু"}
                            </button>
                            <button onClick={() => deleteUser(u)} className="text-[#6b6152] hover:text-red-400">
                              <Trash2 size={13} />
                            </button>
                          </div>
                        </div>

                        {editingPermsFor === u.id && (
                          <div className="mt-1.5 bg-[#141210] border border-[#241f17] rounded-lg p-3">
                            <label className="flex items-center gap-2 text-[12px] text-[#c9bfa8] cursor-pointer mb-2">
                              <input
                                type="checkbox"
                                checked={permsRestricted}
                                onChange={(e) => setPermsRestricted(e.target.checked)}
                                className="accent-[#b8935a]"
                              />
                              এই মডারেটরের গ্রুপ সীমিত করুন
                            </label>
                            {permsRestricted && (
                              <div className="space-y-1 mb-2 pl-1">
                                {GROUPS.map((g) => (
                                  <label key={g.id} className="flex items-center gap-2 text-[12px] text-[#8a7a5c] cursor-pointer">
                                    <input
                                      type="checkbox"
                                      checked={permsDraft.includes(g.id)}
                                      onChange={() => togglePermsGroup(g.id)}
                                      className="accent-[#b8935a]"
                                    />
                                    {g.title}
                                  </label>
                                ))}
                              </div>
                            )}
                            <div className="flex gap-2">
                              <button
                                onClick={() => setEditingPermsFor(null)}
                                className="flex-1 bg-[#1c1913] border border-[#3a3226] text-[#8a7a5c] font-medium text-xs py-2 rounded-lg"
                              >
                                বাতিল
                              </button>
                              <button
                                onClick={() => savePerms(u)}
                                disabled={savingPerms}
                                className="flex-1 bg-[#b8935a] hover:bg-[#c9a56d] disabled:opacity-60 text-[#0f0d0a] font-medium text-xs py-2 rounded-lg"
                              >
                                {savingPerms ? "সেভ হচ্ছে..." : "সেভ করুন"}
                              </button>
                            </div>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* ---- Pages management ---- */}
              <div>
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-2">
                    <Key size={15} className="text-[#b8935a]" />
                    <h3 className="font-medium text-[14px]">পেইজ</h3>
                  </div>
                  {!showPageForm && (
                    <button
                      onClick={() => {
                        resetPageForm();
                        setShowPageForm(true);
                      }}
                      className="text-[11px] text-[#d9b877] underline"
                    >
                      + নতুন পেইজ
                    </button>
                  )}
                </div>

                {showPageForm && (
                  <div className="bg-[#141210] border border-[#241f17] rounded-xl p-3 mb-3">
                    <div className="flex items-center justify-between mb-3">
                      <h4 className="text-[13px] text-[#d9b877] font-medium">
                        {editingPageId ? "পেইজ এডিট করুন" : "নতুন পেইজ"}
                      </h4>
                      <button onClick={resetPageForm} className="text-[#8a7a5c] hover:text-[#f2ede4]">
                        <X size={16} />
                      </button>
                    </div>

                <div className="space-y-2 mb-3">
                  <input
                    value={pageName}
                    onChange={(e) => setPageName(e.target.value)}
                    placeholder="পেইজের নাম (যেমন Asbab)"
                    className="w-full bg-[#17140f] border border-[#3a3226] rounded-lg px-3 py-2 text-sm placeholder-[#5c5342] focus:outline-none focus:ring-1 focus:ring-[#b8935a]"
                  />
                  <input
                    value={pageTagline}
                    onChange={(e) => setPageTagline(e.target.value)}
                    placeholder="ট্যাগলাইন (যেমন Elegance in Every Stitch) — Courier Pad-এ দেখাবে"
                    className="w-full bg-[#17140f] border border-[#3a3226] rounded-lg px-3 py-2 text-sm placeholder-[#5c5342] focus:outline-none focus:ring-1 focus:ring-[#b8935a]"
                  />
                  <p className="text-[10px] text-[#8a7a5c] font-medium uppercase tracking-wide border-t border-[#241f17] pt-3 mt-1">
                    🚚 কুরিয়ার (Steadfast)
                  </p>
                  <input
                    value={pageCourierKey}
                    onChange={(e) => setPageCourierKey(e.target.value)}
                    placeholder="Courier Api Key"
                    className="w-full bg-[#17140f] border border-[#3a3226] rounded-lg px-3 py-2 text-sm placeholder-[#5c5342] focus:outline-none focus:ring-1 focus:ring-[#b8935a]"
                  />
                  <input
                    value={pageCourierSecret}
                    onChange={(e) => setPageCourierSecret(e.target.value)}
                    placeholder="Courier Secret Key"
                    className="w-full bg-[#17140f] border border-[#3a3226] rounded-lg px-3 py-2 text-sm placeholder-[#5c5342] focus:outline-none focus:ring-1 focus:ring-[#b8935a]"
                  />

                  <p className="text-[10px] text-[#6b6152] mt-2">
                    ডেলিভারি নোট (ঐচ্ছিক) — Steadfast-এ পাঠানো হবে, রাইডার দেখতে পারবে
                  </p>
                  <textarea
                    value={pageDeliveryNote}
                    onChange={(e) => setPageDeliveryNote(e.target.value)}
                    rows={2}
                    placeholder="যেমন: এই কাস্টমার সকাল ১০টা পর্যন্ত ঘুমায়, দয়া করে সকালে অফিসে বসে থেকে কল দেবেন না।"
                    className="w-full bg-[#17140f] border border-[#3a3226] rounded-lg px-3 py-2 text-sm placeholder-[#5c5342] focus:outline-none focus:ring-1 focus:ring-[#b8935a] resize-none"
                  />

                  <p className="text-[10px] text-[#6b6152] mt-2">
                    🔎 Steadfast Moderator অ্যাকাউন্ট (ঐচ্ছিক) — কুরিয়ারে পাঠানোর পর Parcel ID-তে ক্লিক করলে রাইডারের নাম্বার/ট্র্যাকিং দেখাতে ব্যবহার হবে
                  </p>
                  <input
                    type="email"
                    value={pageModeratorEmail}
                    onChange={(e) => setPageModeratorEmail(e.target.value)}
                    placeholder="Moderator Email"
                    className="w-full bg-[#17140f] border border-[#3a3226] rounded-lg px-3 py-2 text-sm placeholder-[#5c5342] focus:outline-none focus:ring-1 focus:ring-[#b8935a]"
                  />
                  <input
                    type="password"
                    value={pageModeratorPassword}
                    onChange={(e) => setPageModeratorPassword(e.target.value)}
                    placeholder="Moderator Password"
                    className="w-full bg-[#17140f] border border-[#3a3226] rounded-lg px-3 py-2 text-sm placeholder-[#5c5342] focus:outline-none focus:ring-1 focus:ring-[#b8935a]"
                  />

                  <p className="text-[10px] text-[#8a7a5c] font-medium uppercase tracking-wide border-t border-[#241f17] pt-3 mt-1">
                    🤖 AI Key ({pageAiCreds.length}/5) — উপরেরটা আগে ট্রাই হবে
                  </p>
                  {pageAiCreds.map((cred, i) => (
                    <div key={i} className="flex gap-1.5 items-center">
                      <span className="text-[10px] text-[#5c5342] w-4 shrink-0">{i + 1}.</span>
                      <select
                        value={cred.provider}
                        onChange={(e) => updatePageAiCred(i, "provider", e.target.value)}
                        className="bg-[#17140f] border border-[#3a3226] rounded-lg px-2 py-2 text-xs focus:outline-none focus:ring-1 focus:ring-[#b8935a] shrink-0"
                      >
                        <option value="google">Gemini</option>
                        <option value="anthropic">Claude</option>
                        <option value="openai">OpenAI</option>
                      </select>
                      <input
                        value={cred.apiKey}
                        onChange={(e) => updatePageAiCred(i, "apiKey", e.target.value)}
                        placeholder="API Key"
                        className="flex-1 min-w-0 bg-[#17140f] border border-[#3a3226] rounded-lg px-3 py-2 text-sm placeholder-[#5c5342] focus:outline-none focus:ring-1 focus:ring-[#b8935a]"
                      />
                      {pageAiCreds.length > 1 && (
                        <button onClick={() => removePageAiCredRow(i)} className="text-[#6b6152] hover:text-red-400 shrink-0">
                          <X size={14} />
                        </button>
                      )}
                    </div>
                  ))}
                  {pageAiCreds.length < 5 && (
                    <button
                      onClick={addPageAiCredRow}
                      className="text-[11px] text-[#d9b877] underline"
                    >
                      + আরেকটা AI key যোগ করুন
                    </button>
                  )}

                  <p className="text-[10px] text-[#8a7a5c] font-medium uppercase tracking-wide border-t border-[#241f17] pt-3 mt-1">
                    📩 SMS (ঐচ্ছিক) — bdbulksms.net Token
                  </p>
                  <input
                    value={pageSmsToken}
                    onChange={(e) => setPageSmsToken(e.target.value)}
                    placeholder="SMS Token"
                    className="w-full bg-[#17140f] border border-[#3a3226] rounded-lg px-3 py-2 text-sm placeholder-[#5c5342] focus:outline-none focus:ring-1 focus:ring-[#b8935a]"
                  />

                  <p className="text-[10px] text-[#6b6152] mt-2">
                    অর্ডার কনফার্মেশন SMS — বার্তায় ব্যবহার করুন: <span className="text-[#d9b877]">{"{name}"}</span> (নাম), <span className="text-[#d9b877]">{"{order}"}</span> (অর্ডার নাম্বার), <span className="text-[#d9b877]">{"{amount}"}</span> (বিল), <span className="text-[#d9b877]">{"{size}"}</span> (লং সাইজ)। BTRC-এর নিয়মে বার্তার শুরুতে <span className="text-[#d9b877]">(ব্র্যান্ডের নাম)</span> bracket-এ থাকা বাধ্যতামূলক।
                  </p>
                  <textarea
                    value={pageSmsMessage}
                    onChange={(e) => setPageSmsMessage(e.target.value)}
                    rows={3}
                    placeholder="(Asbab Abaya House) প্রিয় গ্রাহক আপনার বোরকার অর্ডার গ্রহণ করা হয়েছে। লং সাইজ {size} আপনার মোট বিল ৳{amount}&#10;আমাদের সাথে থাকার জন্য ধন্যবাদ"
                    className="w-full bg-[#17140f] border border-[#3a3226] rounded-lg px-3 py-2 text-sm placeholder-[#5c5342] focus:outline-none focus:ring-1 focus:ring-[#b8935a] resize-none"
                  />
                  <label className="flex items-center gap-2 text-[12px] text-[#c9bfa8] cursor-pointer">
                    <input
                      type="checkbox"
                      checked={pageSmsOnWebsiteOrder}
                      onChange={(e) => setPageSmsOnWebsiteOrder(e.target.checked)}
                      className="accent-[#b8935a]"
                    />
                    ওয়েবসাইট থেকে অর্ডার এলে সাথে সাথে SMS
                  </label>
                  <label className="flex items-center gap-2 text-[12px] text-[#c9bfa8] cursor-pointer">
                    <input
                      type="checkbox"
                      checked={pageSmsOnAllOrder}
                      onChange={(e) => setPageSmsOnAllOrder(e.target.checked)}
                      className="accent-[#b8935a]"
                    />
                    All Order-এ পোস্ট/Send করলে SMS
                  </label>

                  <div className="flex gap-2 pt-1">
                    <button
                      onClick={resetPageForm}
                      className="flex-1 bg-[#1c1913] border border-[#3a3226] text-[#8a7a5c] font-medium text-sm py-2.5 rounded-lg"
                    >
                      বাতিল
                    </button>
                    <button
                      onClick={savePage}
                      disabled={
                        savingPage ||
                        !pageName.trim() ||
                        !pageCourierKey.trim() ||
                        !pageCourierSecret.trim() ||
                        !pageAiCreds.some((c) => c.apiKey.trim())
                      }
                      className="flex-1 flex items-center justify-center gap-2 bg-[#b8935a] hover:bg-[#c9a56d] disabled:opacity-60 text-[#0f0d0a] font-medium text-sm py-2.5 rounded-lg"
                    >
                      {savingPage ? <Loader2 size={14} className="animate-spin" /> : <UserPlus size={14} />}
                      {editingPageId ? "আপডেট করুন" : "পেইজ যোগ করুন"}
                    </button>
                  </div>
                  </div>
                  </div>
                )}

                {loadingPages ? (
                  <div className="text-center py-3 text-[#5c5342] text-xs">লোড হচ্ছে...</div>
                ) : (
                  <div className="space-y-1.5">
                    {pages.map((p) => (
                      <div key={p.id} className="flex items-center justify-between bg-[#161310] border border-[#241f17] rounded-lg px-3 py-2">
                        <span className="text-[13px]">
                          {p.name} <span className="text-[11px] text-[#6b6152]">(ID: {p.id})</span>
                        </span>
                        <div className="flex items-center gap-3">
                          <button onClick={() => startEditPage(p)} className="text-[#6b6152] hover:text-[#d9b877]">
                            <Pencil size={13} />
                          </button>
                          <button onClick={() => deletePage(p)} className="text-[#6b6152] hover:text-red-400">
                            <Trash2 size={13} />
                          </button>
                        </div>
                      </div>
                    ))}
                    {pages.length === 0 && (
                      <p className="text-center py-2 text-[#5c5342] text-xs">এখনো কোনো পেইজ যোগ হয়নি</p>
                    )}
                  </div>
                )}
              </div>
            </>
          )}
        </div>
      </div>
      {drawerToast && (
        <div className="fixed bottom-8 left-1/2 -translate-x-1/2 bg-[#1c1913] border border-[#3a3226] rounded-full px-4 py-2.5 flex items-center gap-2 text-sm shadow-lg z-[60]">
          <CheckCircle2 size={15} className="text-emerald-400" />
          {drawerToast}
        </div>
      )}
    </>
  );
}

// ---- HOME SCREEN --------------------------------------------------------
function HomeScreen({ entries, onOpenGroup, onOpenMenu, onOpenPurchaseCost, onOpenRecycleBin, onOpenAnalytics, onOpenSystemAlerts, recycleBinItems, isAdmin, allowedGroups }) {
  const rows = GROUPS.map((g) => {
    const groupEntries = entries.filter((e) => e.group === g.id);
    const last = groupEntries[0];
    return { ...g, count: groupEntries.length, last };
  });

  const [blockedGroup, setBlockedGroup] = useState(null);

  const isGroupAllowed = (groupId) => isAdmin || !allowedGroups || allowedGroups.includes(groupId);

  const handleGroupClick = (groupId) => {
    if (isGroupAllowed(groupId)) onOpenGroup(groupId);
    else setBlockedGroup(groupId);
  };

  const recycleBinCount = recycleBinItems.length;
  const recycleBinLast = recycleBinItems[0];

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
            onClick={() => handleGroupClick(g.id)}
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

        {isAdmin && (
          <button
            onClick={onOpenAnalytics}
            className="w-full flex items-center gap-3 px-5 py-4 text-left active:bg-[#161310]"
          >
            <div className="w-12 h-12 rounded-full flex items-center justify-center text-[#0f0d0a] shrink-0 bg-[#7a9db8]">
              <BarChart3 size={18} />
            </div>
            <div className="flex-1 min-w-0">
              <span className="font-medium text-[15px] text-[#f2ede4] truncate">Asbab Sales Summary</span>
              <p className="text-[13px] text-[#6b6152] truncate mt-0.5">শুধু Admin দেখতে পারেন</p>
            </div>
          </button>
        )}

        {isAdmin && (
          <button
            onClick={onOpenSystemAlerts}
            className="w-full flex items-center gap-3 px-5 py-4 text-left active:bg-[#161310]"
          >
            <div className="w-12 h-12 rounded-full flex items-center justify-center text-[#0f0d0a] shrink-0 bg-[#c99b5a]">
              <AlertTriangle size={18} />
            </div>
            <div className="flex-1 min-w-0">
              <span className="font-medium text-[15px] text-[#f2ede4] truncate">System Alerts</span>
              <p className="text-[13px] text-[#6b6152] truncate mt-0.5">শুধু Admin দেখতে পারেন</p>
            </div>
          </button>
        )}

        <button
          onClick={onOpenPurchaseCost}
          className="w-full flex items-center gap-3 px-5 py-4 text-left active:bg-[#161310]"
        >
          <div className="w-12 h-12 rounded-full flex items-center justify-center text-[#0f0d0a] shrink-0 bg-[#8a7a5c]">
            <Lock size={18} />
          </div>
          <div className="flex-1 min-w-0">
            <span className="font-medium text-[15px] text-[#f2ede4] truncate">Product Purchase Cost</span>
            <p className="text-[13px] text-[#6b6152] truncate mt-0.5">পাসওয়ার্ড-সুরক্ষিত</p>
          </div>
        </button>

        <button
          onClick={onOpenRecycleBin}
          className="w-full flex items-center gap-3 px-5 py-4 text-left active:bg-[#161310]"
        >
          <div className="w-12 h-12 rounded-full flex items-center justify-center text-[#f2ede4] shrink-0 bg-[#7a3030]">
            <Trash2 size={18} />
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center justify-between">
              <span className="font-medium text-[15px] text-[#f2ede4] truncate">All Order Recycle Bin</span>
              <span className="text-[11px] text-[#6b6152] shrink-0 ml-2">
                {recycleBinLast ? formatTime(recycleBinLast.deletedAt) : ""}
              </span>
            </div>
            <p className="text-[13px] text-[#6b6152] truncate mt-0.5">
              {recycleBinCount > 0 ? "২৪ ঘণ্টা পর স্বয়ংক্রিয় মুছে যাবে" : "খালি"}
            </p>
          </div>
          {recycleBinCount > 0 && (
            <span className="shrink-0 min-w-[20px] h-5 px-1.5 rounded-full bg-[#b8935a] text-[#0f0d0a] text-[11px] font-semibold flex items-center justify-center">
              {recycleBinCount}
            </span>
          )}
        </button>
      </div>

      {blockedGroup && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm px-6">
          <div className="w-full max-w-sm bg-[#1a1712] border border-[#3a3226] rounded-2xl p-6 text-center">
            <p className="text-[14px] text-[#e0a3a3] font-medium mb-4">এ গ্রুপে প্রবেশের অনুমতি নেই আপনার</p>
            <button
              onClick={() => setBlockedGroup(null)}
              className="w-full bg-[#b8935a] hover:bg-[#c9a56d] text-[#0f0d0a] font-medium text-sm py-2.5 rounded-lg"
            >
              ঠিক আছে
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// ---- ANALYTICS (Admin only) --------------------------------------------
function formatDateInput(d) {
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function getRangeForMode(mode, anchor) {
  const d = new Date(anchor);
  if (mode === "today") {
    const iso = formatDateInput(d);
    return { start: iso, end: iso };
  }
  if (mode === "week") {
    const day = d.getDay();
    const startD = new Date(d);
    startD.setDate(d.getDate() - day);
    const endD = new Date(startD);
    endD.setDate(startD.getDate() + 6);
    return { start: formatDateInput(startD), end: formatDateInput(endD) };
  }
  // month
  const startD = new Date(d.getFullYear(), d.getMonth(), 1);
  const endD = new Date(d.getFullYear(), d.getMonth() + 1, 0);
  return { start: formatDateInput(startD), end: formatDateInput(endD) };
}

function shiftAnchor(mode, anchor, dir) {
  const d = new Date(anchor);
  if (mode === "today") d.setDate(d.getDate() + dir);
  else if (mode === "week") d.setDate(d.getDate() + dir * 7);
  else d.setMonth(d.getMonth() + dir);
  return d;
}

function printAnalyticsReport(data, rangeLabel) {
  const escapeHtml = (s) =>
    String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

  const pageRows = data.byPage
    .map(
      (p) => `
      <tr>
        <td>${escapeHtml(p.pageName)}</td>
        <td>${p.totalOrders}</td>
        <td>৳${p.totalAmount}</td>
        <td>${p.websiteOrders}</td>
        <td>${p.manualOrders}</td>
      </tr>`
    )
    .join("");

  const modRows = data.byModerator
    .map((m) => `<tr><td>${escapeHtml(m.moderator)}</td><td>${m.count}</td></tr>`)
    .join("");

  const html = `
<!doctype html>
<html>
<head>
<meta charset="utf-8" />
<title>Asbab Sales Summary</title>
<style>
  body { font-family: Georgia, 'Times New Roman', serif; color: #111; padding: 30px; }
  h1 { font-size: 20pt; margin-bottom: 2px; }
  .sub { color: #555; font-size: 10pt; margin-bottom: 20px; }
  .summary { display: flex; gap: 20px; margin-bottom: 24px; }
  .card { border: 1px solid #999; border-radius: 8px; padding: 12px 16px; flex: 1; }
  .card .label { font-size: 8pt; color: #666; text-transform: uppercase; }
  .card .value { font-size: 16pt; font-weight: bold; margin-top: 4px; }
  table { width: 100%; border-collapse: collapse; margin-bottom: 24px; }
  th, td { border: 1px solid #ccc; padding: 6px 10px; text-align: left; font-size: 10pt; }
  th { background: #f0f0f0; }
  h3 { font-size: 12pt; margin-bottom: 8px; }
</style>
</head>
<body>
  <h1>Asbab Sales Summary</h1>
  <p class="sub">${escapeHtml(rangeLabel)}</p>

  <div class="summary">
    <div class="card"><div class="label">Total Orders</div><div class="value">${data.totalOrders}</div></div>
    <div class="card"><div class="label">Total Sales</div><div class="value">৳${data.totalAmount}</div></div>
    <div class="card"><div class="label">Website</div><div class="value">${data.totalWebsiteOrders} (৳${data.totalWebsiteAmount})</div></div>
    <div class="card"><div class="label">Manual</div><div class="value">${data.totalManualOrders} (৳${data.totalManualAmount})</div></div>
  </div>

  <h3>Page-wise Breakdown</h3>
  <table>
    <tr><th>Page</th><th>Total Orders</th><th>Total Sales</th><th>Website Orders</th><th>Manual Orders</th></tr>
    ${pageRows || '<tr><td colspan="5">No data</td></tr>'}
  </table>

  <h3>Moderator-wise Breakdown</h3>
  <table>
    <tr><th>Name</th><th>Orders Posted</th></tr>
    ${modRows || '<tr><td colspan="2">No data</td></tr>'}
  </table>

  <script>window.print();</script>
</body>
</html>`;

  const win = window.open("", "_blank");
  if (!win) return;
  win.document.open();
  win.document.write(html);
  win.document.close();
}

// ---- SYSTEM ALERTS (Admin only) -----------------------------------------
function SystemAlertsScreen({ onBack, authedFetch }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);

  const load = async () => {
    setLoading(true);
    try {
      const res = await authedFetch(`${API_BASE}/api/system-alerts`);
      if (res.ok) setData(await res.json());
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const Row = ({ ok, title, detail }) => (
    <div className={`rounded-xl border px-4 py-3 mb-2 ${ok ? "border-emerald-800/40 bg-emerald-900/10" : "border-red-800/40 bg-red-900/10"}`}>
      <div className="flex items-center gap-2 mb-1">
        <span className="text-[16px]">{ok ? "✅" : "⚠️"}</span>
        <span className="text-[13px] font-medium text-[#f2ede4]">{title}</span>
      </div>
      <p className="text-[11px] text-[#8a7a5c]">{detail}</p>
    </div>
  );

  return (
    <div className="min-h-screen bg-[#0f0d0a] text-[#f2ede4]" style={{ fontFamily: "'Inter', sans-serif" }}>
      <style>{globalStyle}</style>
      <header className="sticky top-0 z-30 bg-[#0f0d0a]/95 backdrop-blur border-b border-[#241f17] px-3 pt-4 pb-3 flex items-center gap-2">
        <button onClick={onBack} className="text-[#8a7a5c] hover:text-[#f2ede4] p-1">
          <ChevronLeft size={22} />
        </button>
        <h1 className="font-medium text-[15px] flex-1 truncate">System Alerts</h1>
        <button onClick={load} className="text-[11px] text-[#8a7a5c] underline">
          রিফ্রেশ
        </button>
      </header>

      <main className="max-w-lg mx-auto px-5 py-5">
        {loading ? (
          <div className="flex items-center justify-center gap-2 py-16 text-[#8a7a5c] text-sm">
            <Loader2 size={16} className="animate-spin" /> লোড হচ্ছে...
          </div>
        ) : data ? (
          <>
            <Row
              ok={data.smsFailures24h === 0}
              title="অর্ডার কনফার্মেশন SMS"
              detail={
                data.smsFailures24h === 0
                  ? "গত ২৪ ঘণ্টায় কোনো ব্যর্থতা নেই"
                  : `গত ২৪ ঘণ্টায় ${data.smsFailures24h}টা SMS পাঠানো ব্যর্থ হয়েছে`
              }
            />
            <Row
              ok={data.aiFailures24h === 0}
              title="AI (Making/Sales/Send to Courier)"
              detail={
                data.aiFailures24h === 0
                  ? "গত ২৪ ঘণ্টায় কোনো সম্পূর্ণ ব্যর্থতা নেই"
                  : `গত ২৪ ঘণ্টায় ${data.aiFailures24h}বার সব AI key একসাথে ব্যর্থ হয়েছে`
              }
            />
            <Row
              ok={data.stuckCourierOrders === 0}
              title="কুরিয়ার স্ট্যাটাস আপডেট"
              detail={
                data.stuckCourierOrders === 0
                  ? "সব পুরনো অর্ডারেই স্ট্যাটাস এসেছে"
                  : `${data.stuckCourierOrders}টা অর্ডার ৩+ দিন আগে পাঠানো হয়েছে, এখনো কোনো ডেলিভারি স্ট্যাটাস আসেনি — Steadfast webhook ঠিকমতো কাজ করছে কিনা দেখুন`
              }
            />
            {data.websiteGap ? (
              <Row
                ok={data.websiteGap.gap === 0}
                title="ওয়েবসাইট অর্ডার গ্যাপ (আনুমানিক)"
                detail={
                  data.websiteGap.gap === 0
                    ? `গত ৪৮ ঘণ্টায় WooCommerce-এ ${data.websiteGap.wcCount}টা, আমাদের কাছেও ${data.websiteGap.ourCount}টা — মিলছে`
                    : `WooCommerce-এ ${data.websiteGap.wcCount}টা অর্ডার আছে, কিন্তু আমাদের কাছে মাত্র ${data.websiteGap.ourCount}টা — ${data.websiteGap.gap}টা সম্ভবত আসেনি`
                }
              />
            ) : (
              <Row ok={false} title="ওয়েবসাইট অর্ডার গ্যাপ" detail="চেক করা যায়নি (WooCommerce key সেটআপ নেই বা সংযোগ ব্যর্থ)" />
            )}
            <Row ok={true} title="ডাটাবেস অটো-ব্যাকআপ" detail="এটা এখান থেকে স্বয়ংক্রিয়ভাবে চেক করা যায় না — GitHub Actions ট্যাবে গিয়ে মাঝেমধ্যে ম্যানুয়ালি দেখে নিন" />
          </>
        ) : (
          <p className="text-center py-8 text-red-400 text-sm">লোড করা যায়নি</p>
        )}
      </main>
    </div>
  );
}

function AnalyticsScreen({ onBack, authedFetch }) {
  const [mode, setMode] = useState("today");
  const [anchor, setAnchor] = useState(new Date());
  const [customStart, setCustomStart] = useState(formatDateInput(new Date()));
  const [customEnd, setCustomEnd] = useState(formatDateInput(new Date()));
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [recalculating, setRecalculating] = useState(false);
  const [recalcMsg, setRecalcMsg] = useState(null);
  const [drillDownPage, setDrillDownPage] = useState(null);
  const [showLocationReport, setShowLocationReport] = useState(false);
  const [showOtpLog, setShowOtpLog] = useState(false);
  const [otpLog, setOtpLog] = useState(null);
  const [loadingOtpLog, setLoadingOtpLog] = useState(false);

  const loadOtpLog = async () => {
    setLoadingOtpLog(true);
    try {
      const res = await authedFetch(`${API_BASE}/api/entries/otp-log`);
      if (res.ok) setOtpLog(await res.json());
    } finally {
      setLoadingOtpLog(false);
    }
  };

  const [locationData, setLocationData] = useState(null);
  const [loadingLocations, setLoadingLocations] = useState(false);
  const [backfilling, setBackfilling] = useState(false);
  const [backfillMsg, setBackfillMsg] = useState(null);

  const loadLocations = async () => {
    setLoadingLocations(true);
    try {
      const res = await authedFetch(`${API_BASE}/api/analytics/by-location`);
      if (res.ok) setLocationData(await res.json());
    } finally {
      setLoadingLocations(false);
    }
  };

  const backfillLocations = async (websiteOnly = false) => {
    setBackfilling(true);
    setBackfillMsg(null);
    try {
      const qs = websiteOnly ? "?source=website" : "";
      const res = await authedFetch(`${API_BASE}/api/entries/backfill-locations${qs}`, { method: "POST" });
      const result = await res.json();
      if (res.ok) {
        setBackfillMsg(
          result.checked === 0
            ? "সব ঠিকই আছে, কিছু বাকি নেই"
            : `${result.checked}টা চেক করা হলো, ${result.fixed}টা ঠিক হয়েছে${
                result.stillFailed ? `, ${result.stillFailed}টা ব্যর্থ` : ""
              } · আর ${result.remaining}টা বাকি${result.remaining > 0 ? " (আবার চাপুন)" : ""}`
        );
        loadLocations();
      } else {
        setBackfillMsg("করা যায়নি");
      }
    } catch {
      setBackfillMsg("করা যায়নি");
    } finally {
      setBackfilling(false);
    }
  };


  const range = mode === "custom" ? { start: customStart, end: customEnd } : getRangeForMode(mode, anchor);

  const rangeLabel =
    range.start === range.end ? range.start : `${range.start} — ${range.end}`;

  const load = async () => {
    setLoading(true);
    try {
      const res = await authedFetch(`${API_BASE}/api/analytics?start=${range.start}&end=${range.end}`);
      if (res.ok) setData(await res.json());
    } finally {
      setLoading(false);
    }
  };

  const recalculate = async () => {
    setRecalculating(true);
    setRecalcMsg(null);
    try {
      const res = await authedFetch(`${API_BASE}/api/entries/recalculate-sales`, { method: "POST" });
      const result = await res.json();
      if (res.ok) {
        setRecalcMsg(
          result.checked === 0
            ? "আজকে এখনো কোনো পোস্ট নেই"
            : `আজকের ${result.checked}টা পোস্ট নতুন করে বিশ্লেষণ হয়েছে${
                result.stillFailed ? ` (${result.stillFailed}টা ব্যর্থ হয়েছে)` : ""
              }`
        );
        load();
      } else {
        setRecalcMsg("করা যায়নি");
      }
    } catch {
      setRecalcMsg("করা যায়নি");
    } finally {
      setRecalculating(false);
    }
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode, anchor, customStart, customEnd]);

  return (
    <div className="min-h-screen bg-[#0f0d0a] text-[#f2ede4]" style={{ fontFamily: "'Inter', sans-serif" }}>
      <style>{globalStyle}</style>
      <header className="sticky top-0 z-30 bg-[#0f0d0a]/95 backdrop-blur border-b border-[#241f17] px-3 pt-4 pb-3">
        <div className="flex items-center gap-2 mb-3">
          <button onClick={onBack} className="text-[#8a7a5c] hover:text-[#f2ede4] p-1">
            <ChevronLeft size={22} />
          </button>
          <h1 className="font-medium text-[15px] flex-1 truncate">Asbab Sales Summary</h1>
          <button
            onClick={() => {
              setShowLocationReport(true);
              loadLocations();
            }}
            className="text-[11px] bg-[#241f17] border border-[#3a3226] text-[#9dc9b8] font-medium px-2.5 py-1.5 rounded-lg mr-2"
          >
            এলাকা রিপোর্ট
          </button>
          <button
            onClick={recalculate}
            disabled={recalculating}
            className="text-[11px] bg-[#241f17] border border-[#3a3226] text-[#9db8cc] disabled:opacity-60 font-medium px-2.5 py-1.5 rounded-lg mr-2"
          >
            {recalculating ? "বিশ্লেষণ হচ্ছে..." : "আজকের সব পুনরায় বিশ্লেষণ"}
          </button>
          {data && (
            <button
              onClick={() => printAnalyticsReport(data, rangeLabel)}
              className="text-[11px] bg-[#241f17] border border-[#3a3226] text-[#d9b877] font-medium px-3 py-1.5 rounded-lg"
            >
              PDF ডাউনলোড
            </button>
          )}
        </div>
        <div className="flex justify-end mb-2">
          <button
            onClick={() => {
              setShowOtpLog(true);
              loadOtpLog();
            }}
            className="text-[11px] bg-[#241f17] border border-[#3a3226] text-[#e0ac6f] font-medium px-2.5 py-1.5 rounded-lg"
          >
            📩 OTP লগ
          </button>
        </div>
        {recalcMsg && <p className="text-[11px] text-[#8a7a5c] mb-2">{recalcMsg}</p>}
        <div className="flex gap-2 mb-2">
          {[
            { id: "today", label: "আজ" },
            { id: "week", label: "সপ্তাহ" },
            { id: "month", label: "মাস" },
            { id: "custom", label: "কাস্টম" },
          ].map((m) => (
            <button
              key={m.id}
              onClick={() => setMode(m.id)}
              className={`flex-1 text-xs font-medium py-2 rounded-lg border transition-colors ${
                mode === m.id
                  ? "bg-[#b8935a]/20 border-[#b8935a] text-[#d9b877]"
                  : "bg-transparent border-[#3a3226] text-[#6b6152]"
              }`}
            >
              {m.label}
            </button>
          ))}
        </div>
        {mode === "custom" ? (
          <div className="flex gap-2 items-center">
            <input
              type="date"
              value={customStart}
              onChange={(e) => setCustomStart(e.target.value)}
              className="flex-1 bg-[#17140f] border border-[#3a3226] rounded-lg px-2 py-1.5 text-xs text-[#f2ede4]"
            />
            <span className="text-[#6b6152] text-xs">—</span>
            <input
              type="date"
              value={customEnd}
              onChange={(e) => setCustomEnd(e.target.value)}
              className="flex-1 bg-[#17140f] border border-[#3a3226] rounded-lg px-2 py-1.5 text-xs text-[#f2ede4]"
            />
          </div>
        ) : (
          <div className="flex items-center justify-between">
            <button onClick={() => setAnchor(shiftAnchor(mode, anchor, -1))} className="text-[#8a7a5c] hover:text-[#f2ede4] p-1">
              <ChevronLeft size={18} />
            </button>
            <span className="text-[12px] text-[#8a7a5c]">{rangeLabel}</span>
            <button
              onClick={() => setAnchor(shiftAnchor(mode, anchor, 1))}
              className="text-[#8a7a5c] hover:text-[#f2ede4] p-1 rotate-180"
            >
              <ChevronLeft size={18} />
            </button>
          </div>
        )}
      </header>

      <main className="max-w-lg mx-auto px-5 py-5">
        {loading ? (
          <div className="flex items-center justify-center gap-2 py-16 text-[#8a7a5c] text-sm">
            <Loader2 size={16} className="animate-spin" /> লোড হচ্ছে...
          </div>
        ) : data ? (
          <>
            <div className="grid grid-cols-2 gap-2 mb-5">
              <div className="bg-[#161310] border border-[#241f17] rounded-xl p-3">
                <p className="text-[10px] text-[#8a7a5c] uppercase">মোট অর্ডার</p>
                <p className="text-[20px] font-semibold text-[#f2ede4]">{data.totalOrders}</p>
              </div>
              <div className="bg-[#161310] border border-[#241f17] rounded-xl p-3">
                <p className="text-[10px] text-[#8a7a5c] uppercase">মোট বিক্রি</p>
                <p className="text-[20px] font-semibold text-[#d9b877]">৳{data.totalAmount}</p>
              </div>
              <div className="bg-[#161310] border border-[#241f17] rounded-xl p-3">
                <p className="text-[10px] text-[#8a7a5c] uppercase">ওয়েবসাইট</p>
                <p className="text-[15px] font-medium text-[#c9b3e8]">
                  {data.totalWebsiteOrders} · ৳{data.totalWebsiteAmount}
                </p>
              </div>
              <div className="bg-[#161310] border border-[#241f17] rounded-xl p-3">
                <p className="text-[10px] text-[#8a7a5c] uppercase">ম্যানুয়াল</p>
                <p className="text-[15px] font-medium text-[#9db8cc]">
                  {data.totalManualOrders} · ৳{data.totalManualAmount}
                </p>
              </div>
            </div>

            <h3 className="text-[13px] text-[#d9b877] font-medium mb-2">পেইজ অনুযায়ী</h3>
            <div className="space-y-2 mb-5">
              {data.byPage.map((p) => (
                <button
                  key={p.pageId || "no_page"}
                  onClick={() => setDrillDownPage(p)}
                  className="w-full text-left bg-[#161310] border border-[#241f17] hover:border-[#b8935a] rounded-lg px-3 py-2.5"
                >
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-[13px] text-[#f2ede4] font-medium">{p.pageName}</span>
                    <span className="text-[13px] text-[#d9b877]">৳{p.totalAmount}</span>
                  </div>
                  <p className="text-[11px] text-[#8a7a5c]">
                    মোট {p.totalOrders} · ওয়েবসাইট {p.websiteOrders} · ম্যানুয়াল {p.manualOrders}
                  </p>
                </button>
              ))}
              {data.byPage.length === 0 && <p className="text-center py-3 text-[#5c5342] text-xs">কোনো ডেটা নেই</p>}
            </div>

            <h3 className="text-[13px] text-[#d9b877] font-medium mb-2">মডারেটর অনুযায়ী</h3>
            <div className="space-y-1.5">
              {data.byModerator.map((m) => (
                <div key={m.moderator} className="flex items-center justify-between bg-[#161310] border border-[#241f17] rounded-lg px-3 py-2">
                  <span className="text-[13px] text-[#c9bfa8]">{m.moderator}</span>
                  <span className="text-[13px] text-[#d9b877] font-medium">{m.count}</span>
                </div>
              ))}
              {data.byModerator.length === 0 && <p className="text-center py-3 text-[#5c5342] text-xs">কোনো ডেটা নেই</p>}
            </div>
          </>
        ) : (
          <p className="text-center py-8 text-red-400 text-sm">লোড করা যায়নি</p>
        )}
      </main>

      {drillDownPage && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm px-6">
          <div className="w-full max-w-sm bg-[#1a1712] border border-[#3a3226] rounded-2xl p-6 max-h-[85vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-1">
              <h3 className="font-serif text-lg text-[#f2ede4]">{drillDownPage.pageName}</h3>
              <button onClick={() => setDrillDownPage(null)} className="text-[#8a7a5c] hover:text-[#f2ede4]">
                <X size={20} />
              </button>
            </div>
            <p className="text-[11px] text-[#6b6152] mb-4">
              AI যা বের করেছে তাই দেখাচ্ছে (মূল টেক্সট/ছবি না) — কোনো অর্ডারের হিসাব ভুল মনে হলে এখানেই ধরা পড়বে
            </p>

            <div className="space-y-1.5">
              {drillDownPage.orders.map((o) => (
                <div key={o.id} className="flex items-center justify-between bg-[#161310] border border-[#241f17] rounded-lg px-3 py-2">
                  <div className="min-w-0">
                    <p className="text-[13px] text-[#c9bfa8]">
                      {o.orderNumber ? `#${o.orderNumber}` : `ID ${o.id}`}
                      {o.isWebsite && <span className="text-[10px] text-[#c9b3e8]"> · ওয়েবসাইট</span>}
                    </p>
                    <p className="text-[11px] text-[#6b6152]">{o.quantity} পিস</p>
                  </div>
                  <span className={`text-[13px] font-medium ${o.amount === 0 ? "text-red-400" : "text-[#d9b877]"}`}>
                    ৳{o.amount}
                  </span>
                </div>
              ))}
              {drillDownPage.orders.length === 0 && (
                <p className="text-center py-4 text-[#5c5342] text-xs">কোনো অর্ডার নেই</p>
              )}
            </div>

            <div className="border-t border-[#3a3226] mt-3 pt-3 flex items-center justify-between">
              <span className="text-[12px] text-[#8a7a5c]">মোট</span>
              <span className="text-[14px] text-[#d9b877] font-semibold">৳{drillDownPage.totalAmount}</span>
            </div>
          </div>
        </div>
      )}

      {showLocationReport && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm px-6">
          <div className="w-full max-w-sm bg-[#1a1712] border border-[#3a3226] rounded-2xl p-6 max-h-[85vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-1">
              <h3 className="font-serif text-lg text-[#f2ede4]">এলাকা-ভিত্তিক রিপোর্ট</h3>
              <button onClick={() => setShowLocationReport(false)} className="text-[#8a7a5c] hover:text-[#f2ede4]">
                <X size={20} />
              </button>
            </div>
            <p className="text-[11px] text-[#6b6152] mb-3">
              শুধু কুরিয়ারে পাঠানো অর্ডার (সব সময়ের) — বাতিলের হার অনুযায়ী সাজানো
            </p>

            <div className="flex gap-2 mb-2">
              <button
                onClick={() => backfillLocations(false)}
                disabled={backfilling}
                className="flex-1 text-[11px] bg-[#241f17] border border-[#3a3226] text-[#9db8cc] disabled:opacity-60 font-medium py-2 rounded-lg"
              >
                {backfilling ? "চলছে..." : "পুরনো অর্ডারের জেলা বের করুন"}
              </button>
              <button
                onClick={() => backfillLocations(true)}
                disabled={backfilling}
                className="flex-1 text-[11px] bg-[#241f17] border border-[#3a3226] text-[#c9b3e8] disabled:opacity-60 font-medium py-2 rounded-lg"
              >
                {backfilling ? "চলছে..." : "শুধু ওয়েবসাইট"}
              </button>
            </div>
            {backfillMsg && <p className="text-[11px] text-[#8a7a5c] mb-3">{backfillMsg}</p>}

            {loadingLocations ? (
              <div className="flex items-center justify-center gap-2 py-8 text-[#8a7a5c] text-sm">
                <Loader2 size={16} className="animate-spin" /> লোড হচ্ছে...
              </div>
            ) : locationData ? (
              <div className="space-y-1.5">
                {locationData.locations.map((l) => (
                  <div key={`${l.district}-${l.thana}`} className="bg-[#161310] border border-[#241f17] rounded-lg px-3 py-2">
                    <div className="flex items-center justify-between mb-0.5">
                      <span className="text-[13px] text-[#f2ede4] font-medium">
                        {l.district} {l.thana !== "অজানা" ? `· ${l.thana}` : ""}
                      </span>
                      <span
                        className={`text-[13px] font-semibold ${
                          l.cancelRate >= 30 ? "text-red-400" : l.cancelRate >= 15 ? "text-amber-400" : "text-emerald-300"
                        }`}
                      >
                        {l.cancelRate}%
                      </span>
                    </div>
                    <p className="text-[11px] text-[#8a7a5c] mb-0.5">
                      মোট {l.total} · ডেলিভার {l.delivered} · বাতিল {l.cancelled}
                    </p>
                    <p className="text-[10px] text-[#6b6152]">
                      🌐 ওয়েবসাইট: {l.websiteTotal} (বাতিল {l.websiteCancelled}) · 💬 ইনবক্স: {l.manualTotal} (বাতিল {l.manualCancelled})
                    </p>
                  </div>
                ))}
                {locationData.locations.length === 0 && (
                  <p className="text-center py-4 text-[#5c5342] text-xs">কোনো ডেটা নেই</p>
                )}
              </div>
            ) : (
              <p className="text-center py-8 text-red-400 text-sm">লোড করা যায়নি</p>
            )}
          </div>
        </div>
      )}

      {showOtpLog && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm px-6">
          <div className="w-full max-w-sm bg-[#1a1712] border border-[#3a3226] rounded-2xl p-6 max-h-[85vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-1">
              <h3 className="font-serif text-lg text-[#f2ede4]">OTP ডেলিভারি লগ</h3>
              <button onClick={() => setShowOtpLog(false)} className="text-[#8a7a5c] hover:text-[#f2ede4]">
                <X size={20} />
              </button>
            </div>
            <p className="text-[11px] text-[#6b6152] mb-3">সাম্প্রতিক ১০০টা OTP পাঠানোর চেষ্টা</p>

            {loadingOtpLog ? (
              <div className="flex items-center justify-center gap-2 py-8 text-[#8a7a5c] text-sm">
                <Loader2 size={16} className="animate-spin" /> লোড হচ্ছে...
              </div>
            ) : otpLog ? (
              <div className="space-y-1.5">
                {otpLog.map((o, i) => (
                  <div key={i} className="bg-[#161310] border border-[#241f17] rounded-lg px-3 py-2">
                    <div className="flex items-center justify-between mb-0.5">
                      <span className="text-[13px] text-[#c9bfa8]">{o.phone}</span>
                      <span className={`text-[12px] font-medium ${o.sent ? "text-emerald-300" : "text-red-400"}`}>
                        {o.sent ? "✅ পাঠানো হয়েছে" : "❌ ব্যর্থ"}
                      </span>
                    </div>
                    <p className="text-[10px] text-[#6b6152]">
                      {formatFullDateTime(o.created_at)} {o.verified ? "· যাচাই হয়েছে" : ""}
                    </p>
                    {o.send_error && <p className="text-[10px] text-red-400 mt-0.5">{o.send_error}</p>}
                  </div>
                ))}
                {otpLog.length === 0 && <p className="text-center py-4 text-[#5c5342] text-xs">কোনো ডেটা নেই</p>}
              </div>
            ) : (
              <p className="text-center py-8 text-red-400 text-sm">লোড করা যায়নি</p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// ---- RECYCLE BIN -----------------------------------------------------
function RecycleBinScreen({ onBack, authedFetch }) {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [toast, setToast] = useState(null);

  const showToast = (msg) => {
    setToast(msg);
    setTimeout(() => setToast(null), 3000);
  };

  const load = async () => {
    setLoading(true);
    try {
      const res = await authedFetch(`${API_BASE}/api/entries/recycle-bin`);
      if (res.ok) setItems(await res.json());
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const restore = async (item) => {
    await authedFetch(`${API_BASE}/api/entries/recycle-bin/${item.id}/restore`, { method: "POST" });
    load();
    showToast("ফিরিয়ে আনা হয়েছে");
  };

  const permanentDelete = async (item) => {
    if (!window.confirm("এটা স্থায়ীভাবে মুছে ফেলতে চান? এটা আর ফেরত আনা যাবে না।")) return;
    await authedFetch(`${API_BASE}/api/entries/recycle-bin/${item.id}`, { method: "DELETE" });
    load();
  };

  const groupLabels = { all_order: "All Order", website_order: "Website Order" };

  return (
    <div className="min-h-screen bg-[#0f0d0a] text-[#f2ede4]" style={{ fontFamily: "'Inter', sans-serif" }}>
      <style>{globalStyle}</style>
      <header className="sticky top-0 z-30 bg-[#0f0d0a]/95 backdrop-blur border-b border-[#241f17] px-3 pt-4 pb-3 flex items-center gap-2">
        <button onClick={onBack} className="text-[#8a7a5c] hover:text-[#f2ede4] p-1">
          <ChevronLeft size={22} />
        </button>
        <h1 className="font-medium text-[15px] flex-1 truncate">All Order Recycle Bin</h1>
      </header>

      <main className="max-w-lg mx-auto px-5 py-5 space-y-3">
        {loading ? (
          <div className="flex items-center justify-center gap-2 py-16 text-[#8a7a5c] text-sm">
            <Loader2 size={16} className="animate-spin" /> লোড হচ্ছে...
          </div>
        ) : items.length === 0 ? (
          <p className="text-center py-16 text-[#5c5342] text-sm">All Order Recycle Bin খালি</p>
        ) : (
          items.map((item) => (
            <div key={item.id} className="bg-[#161310] border border-[#241f17] rounded-xl overflow-hidden">
              {item.imageUrls && item.imageUrls.length > 0 && (
                <div className={`grid gap-0.5 ${item.imageUrls.length === 1 ? "grid-cols-1" : "grid-cols-2"}`}>
                  {item.imageUrls.map((url, i) => (
                    <div
                      key={i}
                      className="bg-[#0a0908] flex items-center justify-center overflow-hidden"
                      style={{ aspectRatio: item.imageUrls.length === 1 ? "4 / 5" : "3 / 4" }}
                    >
                      <img src={url} alt="" className="w-full h-full object-contain" />
                    </div>
                  ))}
                </div>
              )}
              <div className="p-4">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-[10px] px-1.5 py-0.5 rounded bg-[#241f17] text-[#8a7a5c]">
                    {groupLabels[item.originalGroup] || item.originalGroup}
                  </span>
                  <span className="text-[10px] text-[#6b6152]">{formatFullDateTime(item.deletedAt)}</span>
                </div>
                <pre className="whitespace-pre-wrap font-sans text-[13px] text-[#c9bfa8] mb-2 leading-relaxed">
                  {item.rawText}
                </pre>
                {item.deleteReason && (
                  <p className="text-[12px] text-[#e0ac6f] bg-[#2a1f14] border border-[#4a3320] rounded-lg px-3 py-2 mb-2">
                    📝 কারণ: {item.deleteReason}
                  </p>
                )}
                <div className="flex gap-2 mt-2">
                  <button
                    onClick={() => restore(item)}
                    className="flex-1 bg-[#b8935a] hover:bg-[#c9a56d] text-[#0f0d0a] font-medium text-sm py-2.5 rounded-lg"
                  >
                    ফিরিয়ে আনুন
                  </button>
                  <button
                    onClick={() => permanentDelete(item)}
                    className="flex-1 bg-[#3a1f1f] border border-[#5c2a2a] text-[#e0a3a3] font-medium text-sm py-2.5 rounded-lg"
                  >
                    স্থায়ীভাবে মুছুন
                  </button>
                </div>
              </div>
            </div>
          ))
        )}
      </main>

      {toast && (
        <div className="fixed bottom-8 left-1/2 -translate-x-1/2 bg-[#1c1913] border border-[#3a3226] rounded-full px-4 py-2.5 flex items-center gap-2 text-sm shadow-lg z-40">
          <CheckCircle2 size={15} className="text-emerald-400" />
          {toast}
        </div>
      )}
    </div>
  );
}

// ---- PRODUCT PURCHASE COST (password-protected) --------------------------
function PurchaseCostScreen({ onBack, authedFetch }) {
  const [unlocked, setUnlocked] = useState(false);
  const [passwordInput, setPasswordInput] = useState("");
  const [passwordError, setPasswordError] = useState(false);

  const [products, setProducts] = useState([]);
  const [loadingProducts, setLoadingProducts] = useState(false);
  const [toast, setToast] = useState(null);

  const [summary, setSummary] = useState(null);
  const [loadingSummary, setLoadingSummary] = useState(false);

  // Which modal is open: null | "products" | "entry" | "payment"
  const [modal, setModal] = useState(null);

  const [editingProductId, setEditingProductId] = useState(null);
  const [productName, setProductName] = useState("");
  const [productPrice, setProductPrice] = useState("");
  const [savingProduct, setSavingProduct] = useState(false);
  const [applyPriceToAll, setApplyPriceToAll] = useState(false);

  // null = adding a new entry; an id = editing that existing entry
  const [editingEntryId, setEditingEntryId] = useState(null);
  const [entryProductId, setEntryProductId] = useState("");
  const [entryQuantity, setEntryQuantity] = useState("");
  const [savingEntry, setSavingEntry] = useState(false);

  // null = adding a new payment; an id = editing that existing payment
  const [editingPaymentId, setEditingPaymentId] = useState(null);
  const [paymentNote, setPaymentNote] = useState("");
  const [paymentAmount, setPaymentAmount] = useState("");
  const [savingPayment, setSavingPayment] = useState(false);

  const showToast = (msg) => {
    setToast(msg);
    setTimeout(() => setToast(null), 3000);
  };

  const loadSummary = async () => {
    setLoadingSummary(true);
    try {
      const res = await authedFetch(`${API_BASE}/api/purchases/summary`);
      if (res.ok) setSummary(await res.json());
    } finally {
      setLoadingSummary(false);
    }
  };

  const loadProducts = async () => {
    setLoadingProducts(true);
    try {
      const res = await authedFetch(`${API_BASE}/api/purchases/products`);
      if (res.ok) setProducts(await res.json());
    } finally {
      setLoadingProducts(false);
    }
  };

  const checkPassword = () => {
    if (passwordInput === "Asbab") {
      setUnlocked(true);
      setPasswordError(false);
    } else {
      setPasswordError(true);
    }
  };

  useEffect(() => {
    if (unlocked) {
      loadProducts();
      loadSummary();
    }
  }, [unlocked]);

  // ---- Products ----
  const resetProductForm = () => {
    setEditingProductId(null);
    setProductName("");
    setProductPrice("");
    setApplyPriceToAll(false);
  };

  const startEditProduct = (p) => {
    setEditingProductId(p.id);
    setProductName(p.name);
    setProductPrice(String(p.price_per_unit));
    setApplyPriceToAll(false);
  };

  const saveProduct = async () => {
    if (!productName.trim() || !productPrice) return;
    setSavingProduct(true);
    try {
      const body = JSON.stringify({
        name: productName.trim(),
        pricePerUnit: Number(productPrice),
        applyToAll: applyPriceToAll,
      });
      const res = editingProductId
        ? await authedFetch(`${API_BASE}/api/purchases/products/${editingProductId}`, {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body,
          })
        : await authedFetch(`${API_BASE}/api/purchases/products`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body,
          });
      if (res.ok) {
        const data = await res.json().catch(() => ({}));
        resetProductForm();
        loadProducts();
        loadSummary();
        showToast(
          applyPriceToAll && data.updatedEntries != null
            ? `প্রোডাক্ট সেভ হয়েছে · ${data.updatedEntries}টা পুরনো হিসাব আপডেট হয়েছে`
            : "প্রোডাক্ট সেভ হয়েছে"
        );
      }
    } finally {
      setSavingProduct(false);
    }
  };

  const deleteProduct = async (p) => {
    if (!window.confirm(`"${p.name}" ডিলিট করতে চান?`)) return;
    if (editingProductId === p.id) resetProductForm();
    await authedFetch(`${API_BASE}/api/purchases/products/${p.id}`, { method: "DELETE" });
    loadProducts();
  };

  // ---- Entries (add or edit) ----
  const openAddEntry = () => {
    setEditingEntryId(null);
    setEntryProductId("");
    setEntryQuantity("");
    setModal("entry");
  };

  const openEditEntry = (item) => {
    setEditingEntryId(item.id);
    setEntryProductId(item.productId ? String(item.productId) : "");
    setEntryQuantity(String(item.quantity));
    setModal("entry");
  };

  const saveEntry = async () => {
    if (!entryProductId || !entryQuantity) return;
    setSavingEntry(true);
    try {
      const body = JSON.stringify({ productId: Number(entryProductId), quantity: Number(entryQuantity) });
      const res = editingEntryId
        ? await authedFetch(`${API_BASE}/api/purchases/entries/${editingEntryId}`, {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body,
          })
        : await authedFetch(`${API_BASE}/api/purchases/entries`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body,
          });
      if (res.ok) {
        setModal(null);
        loadSummary();
        showToast(editingEntryId ? "হিসাব আপডেট হয়েছে" : "হিসাব যোগ হয়েছে");
      }
    } finally {
      setSavingEntry(false);
    }
  };

  const deleteEntry = async (item) => {
    if (!window.confirm("এই হিসাবটা ডিলিট করতে চান?")) return;
    await authedFetch(`${API_BASE}/api/purchases/entries/${item.id}`, { method: "DELETE" });
    loadSummary();
  };

  // ---- Payments (add or edit) ----
  const openAddPayment = () => {
    setEditingPaymentId(null);
    setPaymentNote("");
    setPaymentAmount("");
    setModal("payment");
  };

  const openEditPayment = (item) => {
    setEditingPaymentId(item.id);
    setPaymentNote(item.note || "");
    setPaymentAmount(String(item.amount));
    setModal("payment");
  };

  const savePayment = async () => {
    if (!paymentAmount) return;
    setSavingPayment(true);
    try {
      const body = JSON.stringify({ note: paymentNote.trim(), amount: Number(paymentAmount) });
      const res = editingPaymentId
        ? await authedFetch(`${API_BASE}/api/purchases/payments/${editingPaymentId}`, {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body,
          })
        : await authedFetch(`${API_BASE}/api/purchases/payments`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body,
          });
      if (res.ok) {
        setModal(null);
        loadSummary();
        showToast(editingPaymentId ? "পেমেন্ট আপডেট হয়েছে" : "পেমেন্ট যোগ হয়েছে");
      }
    } finally {
      setSavingPayment(false);
    }
  };

  const deletePayment = async (item) => {
    if (!window.confirm("এই পেমেন্টটা ডিলিট করতে চান?")) return;
    await authedFetch(`${API_BASE}/api/purchases/payments/${item.id}`, { method: "DELETE" });
    loadSummary();
  };

  if (!unlocked) {
    return (
      <div className="min-h-screen bg-[#0f0d0a] text-[#f2ede4] flex flex-col justify-center px-6" style={{ fontFamily: "'Inter', sans-serif" }}>
        <style>{globalStyle}</style>
        <div className="max-w-sm mx-auto w-full text-center">
          <Lock size={28} className="mx-auto mb-4 text-[#8a7a5c]" />
          <h1 className="font-serif text-xl mb-3">Product Purchase Cost</h1>
          <p className="text-[13px] text-[#8a7a5c] mb-6 leading-relaxed">
            এ গ্রুপটি শুধুমাত্র আপনাদের বস <span className="text-[#d9b877]">Sm Rihan</span> এর জন্য। আপনি প্রবেশ করতে চাইলে তার থেকে অনুমতি সাপেক্ষে পাসওয়ার্ড নিন।
          </p>
          <input
            type="password"
            autoFocus
            value={passwordInput}
            onChange={(e) => {
              setPasswordInput(e.target.value);
              setPasswordError(false);
            }}
            onKeyDown={(e) => e.key === "Enter" && checkPassword()}
            placeholder="পাসওয়ার্ড"
            className={`w-full bg-[#17140f] border rounded-lg px-3 py-2.5 text-sm text-center placeholder-[#5c5342] focus:outline-none focus:ring-1 mb-2 ${
              passwordError ? "border-red-500 focus:ring-red-500" : "border-[#3a3226] focus:ring-[#b8935a]"
            }`}
          />
          {passwordError && <p className="text-[12px] text-red-400 mb-3">ভুল পাসওয়ার্ড</p>}
          <div className="flex gap-3 mt-4">
            <button onClick={onBack} className="flex-1 bg-[#1c1913] border border-[#3a3226] text-[#8a7a5c] font-medium text-sm py-2.5 rounded-lg">
              পিছনে যান
            </button>
            <button onClick={checkPassword} className="flex-1 bg-[#b8935a] hover:bg-[#c9a56d] text-[#0f0d0a] font-medium text-sm py-2.5 rounded-lg">
              প্রবেশ করুন
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#0f0d0a] text-[#f2ede4]" style={{ fontFamily: "'Inter', sans-serif" }}>
      <style>{globalStyle}</style>
      <header className="sticky top-0 z-30 bg-[#0f0d0a]/95 backdrop-blur border-b border-[#241f17] px-3 pt-4 pb-3">
        <div className="flex items-center gap-2 mb-3">
          <button onClick={onBack} className="text-[#8a7a5c] hover:text-[#f2ede4] p-1">
            <ChevronLeft size={22} />
          </button>
          <h1 className="font-medium text-[15px] flex-1 truncate">Product Purchase Cost</h1>
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => setModal("products")}
            className="flex-1 text-xs font-medium py-2 rounded-lg border border-[#3a3226] text-[#c9bfa8] hover:border-[#b8935a]"
          >
            প্রোডাক্ট
          </button>
          <button
            onClick={openAddEntry}
            className="flex-1 text-xs font-medium py-2 rounded-lg border border-[#3a3226] text-[#c9bfa8] hover:border-[#b8935a]"
          >
            হিসাব যোগ করুন
          </button>
          <button
            onClick={openAddPayment}
            className="flex-1 text-xs font-medium py-2 rounded-lg border border-[#3a3226] text-[#c9bfa8] hover:border-[#b8935a]"
          >
            পেমেন্ট করুন
          </button>
        </div>
      </header>

      <main className="max-w-lg mx-auto px-5 py-5">
        {loadingSummary ? (
          <div className="flex items-center justify-center gap-2 py-16 text-[#8a7a5c] text-sm">
            <Loader2 size={16} className="animate-spin" /> লোড হচ্ছে...
          </div>
        ) : summary ? (
          <>
            <div className="bg-[#161310] border border-[#241f17] rounded-xl px-4 py-3 mb-5 space-y-1">
              <div className="flex items-center justify-between text-[13px]">
                <span className="text-[#8a7a5c]">মোট মূল্য</span>
                <span className="text-[#e0a3a3] font-medium">৳{summary.totalPurchased}</span>
              </div>
              <div className="flex items-center justify-between text-[13px]">
                <span className="text-[#8a7a5c]">মোট পরিশোধ</span>
                <span className="text-emerald-300 font-medium">৳{summary.totalPaid}</span>
              </div>
              <div className="flex items-center justify-between text-[16px] pt-1.5 border-t border-[#3a3226] mt-1.5">
                <span className="text-[#f2ede4] font-medium">বর্তমান দেনা</span>
                <span className="text-[#d9b877] font-semibold">৳{summary.due}</span>
              </div>
            </div>

            <div className="space-y-2">
              {summary.ledger
                .slice()
                .reverse()
                .map((item) => (
                  <div key={`${item.type}-${item.id}`} className="flex items-center justify-between bg-[#161310] border border-[#241f17] rounded-lg px-3 py-2.5">
                    <div className="min-w-0 flex-1">
                      {item.type === "purchase" ? (
                        <p className="text-[12px] text-[#c9bfa8]">
                          {item.productName} × {item.quantity} (৳{item.unitPrice}/পিস)
                        </p>
                      ) : (
                        <p className="text-[12px] text-[#c9bfa8]">পেমেন্ট{item.note ? ` — ${item.note}` : ""}</p>
                      )}
                      <p className="text-[10px] text-[#6b6152]">{formatFullDateTime(item.createdAt)}</p>
                    </div>
                    <div className="flex items-center gap-2 shrink-0 ml-2">
                      <span className={`text-[13px] font-medium ${item.type === "purchase" ? "text-[#e0a3a3]" : "text-emerald-300"}`}>
                        {item.type === "purchase" ? "+" : "−"}৳{item.amount}
                      </span>
                      <button
                        onClick={() => (item.type === "purchase" ? openEditEntry(item) : openEditPayment(item))}
                        className="text-[#6b6152] hover:text-[#d9b877]"
                      >
                        <Pencil size={13} />
                      </button>
                      <button
                        onClick={() => (item.type === "purchase" ? deleteEntry(item) : deletePayment(item))}
                        className="text-[#6b6152] hover:text-red-400"
                      >
                        <Trash2 size={13} />
                      </button>
                    </div>
                  </div>
                ))}
              {summary.ledger.length === 0 && (
                <p className="text-center py-10 text-[#5c5342] text-sm">এখনো কোনো হিসাব নেই</p>
              )}
            </div>
          </>
        ) : (
          <p className="text-center py-8 text-red-400 text-sm">লোড করা যায়নি</p>
        )}
      </main>

      {toast && (
        <div className="fixed bottom-8 left-1/2 -translate-x-1/2 bg-[#1c1913] border border-[#3a3226] rounded-full px-4 py-2.5 flex items-center gap-2 text-sm shadow-lg z-40">
          <CheckCircle2 size={15} className="text-emerald-400" />
          {toast}
        </div>
      )}

      {/* ---- Products modal (add + list + edit) ---- */}
      {modal === "products" && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm px-6">
          <div className="w-full max-w-sm bg-[#1a1712] border border-[#3a3226] rounded-2xl p-6 max-h-[85vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-serif text-lg text-[#f2ede4]">প্রোডাক্ট</h3>
              <button onClick={() => { setModal(null); resetProductForm(); }} className="text-[#8a7a5c] hover:text-[#f2ede4]">
                <X size={20} />
              </button>
            </div>

            <div className="space-y-2 mb-4">
              <input
                value={productName}
                onChange={(e) => setProductName(e.target.value)}
                placeholder="প্রোডাক্টের নাম"
                className="w-full bg-[#17140f] border border-[#3a3226] rounded-lg px-3 py-2 text-sm placeholder-[#5c5342] focus:outline-none focus:ring-1 focus:ring-[#b8935a]"
              />
              <input
                type="number"
                value={productPrice}
                onChange={(e) => setProductPrice(e.target.value)}
                placeholder="প্রতি পিসের দাম (৳)"
                className="w-full bg-[#17140f] border border-[#3a3226] rounded-lg px-3 py-2 text-sm placeholder-[#5c5342] focus:outline-none focus:ring-1 focus:ring-[#b8935a]"
              />
              {editingProductId && (
                <label className="flex items-center gap-2 text-[12px] text-[#c9bfa8] cursor-pointer">
                  <input
                    type="checkbox"
                    checked={applyPriceToAll}
                    onChange={(e) => setApplyPriceToAll(e.target.checked)}
                    className="accent-[#b8935a]"
                  />
                  এই দামটা সব পুরনো হিসাবেও প্রয়োগ করুন (Apply All Summary)
                </label>
              )}
              <div className="flex gap-2">
                {editingProductId && (
                  <button onClick={resetProductForm} className="flex-1 bg-[#1c1913] border border-[#3a3226] text-[#8a7a5c] font-medium text-sm py-2.5 rounded-lg">
                    বাতিল
                  </button>
                )}
                <button
                  onClick={saveProduct}
                  disabled={savingProduct || !productName.trim() || !productPrice}
                  className="flex-1 flex items-center justify-center gap-2 bg-[#b8935a] hover:bg-[#c9a56d] disabled:opacity-60 text-[#0f0d0a] font-medium text-sm py-2.5 rounded-lg"
                >
                  {savingProduct ? <Loader2 size={14} className="animate-spin" /> : null}
                  {editingProductId ? "আপডেট করুন" : "যোগ করুন"}
                </button>
              </div>
            </div>

            {loadingProducts ? (
              <div className="text-center py-3 text-[#5c5342] text-xs">লোড হচ্ছে...</div>
            ) : (
              <div className="space-y-1.5">
                {products.map((p) => (
                  <div key={p.id} className="flex items-center justify-between bg-[#161310] border border-[#241f17] rounded-lg px-3 py-2">
                    <div className="min-w-0">
                      <p className="text-[13px] truncate">{p.name}</p>
                      <p className="text-[11px] text-[#6b6152]">৳{p.price_per_unit} / পিস</p>
                    </div>
                    <div className="flex items-center gap-2 shrink-0 ml-2">
                      <button onClick={() => startEditProduct(p)} className="text-[#6b6152] hover:text-[#d9b877]">
                        <Pencil size={13} />
                      </button>
                      <button onClick={() => deleteProduct(p)} className="text-[#6b6152] hover:text-red-400">
                        <Trash2 size={13} />
                      </button>
                    </div>
                  </div>
                ))}
                {products.length === 0 && (
                  <p className="text-center py-2 text-[#5c5342] text-xs">এখনো কোনো প্রোডাক্ট যোগ হয়নি</p>
                )}
              </div>
            )}
          </div>
        </div>
      )}

      {/* ---- Add/Edit entry modal ---- */}
      {modal === "entry" && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm px-6">
          <div className="w-full max-w-sm bg-[#1a1712] border border-[#3a3226] rounded-2xl p-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-serif text-lg text-[#f2ede4]">{editingEntryId ? "হিসাব এডিট করুন" : "হিসাব যোগ করুন"}</h3>
              <button onClick={() => setModal(null)} className="text-[#8a7a5c] hover:text-[#f2ede4]">
                <X size={20} />
              </button>
            </div>
            <div className="space-y-2">
              <select
                value={entryProductId}
                onChange={(e) => setEntryProductId(e.target.value)}
                className="w-full bg-[#17140f] border border-[#3a3226] rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-1 focus:ring-[#b8935a]"
              >
                <option value="">প্রোডাক্ট বাছাই করুন</option>
                {products.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name} (৳{p.price_per_unit}/পিস)
                  </option>
                ))}
              </select>
              <input
                type="number"
                value={entryQuantity}
                onChange={(e) => setEntryQuantity(e.target.value)}
                placeholder="কত পিস নিলেন"
                className="w-full bg-[#17140f] border border-[#3a3226] rounded-lg px-3 py-2 text-sm placeholder-[#5c5342] focus:outline-none focus:ring-1 focus:ring-[#b8935a]"
              />
              {entryProductId && entryQuantity && (
                <p className="text-[12px] text-[#8a7a5c]">
                  মোট: ৳{(Number(products.find((p) => p.id === Number(entryProductId))?.price_per_unit || 0) * Number(entryQuantity)).toFixed(2)}
                </p>
              )}
              <button
                onClick={saveEntry}
                disabled={savingEntry || !entryProductId || !entryQuantity}
                className="w-full flex items-center justify-center gap-2 bg-[#b8935a] hover:bg-[#c9a56d] disabled:opacity-60 text-[#0f0d0a] font-medium text-sm py-3 rounded-xl mt-2"
              >
                {savingEntry ? <Loader2 size={15} className="animate-spin" /> : null}
                {editingEntryId ? "আপডেট করুন" : "সেভ করুন"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ---- Add/Edit payment modal ---- */}
      {modal === "payment" && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm px-6">
          <div className="w-full max-w-sm bg-[#1a1712] border border-[#3a3226] rounded-2xl p-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-serif text-lg text-[#f2ede4]">{editingPaymentId ? "পেমেন্ট এডিট করুন" : "পেমেন্ট করুন"}</h3>
              <button onClick={() => setModal(null)} className="text-[#8a7a5c] hover:text-[#f2ede4]">
                <X size={20} />
              </button>
            </div>
            <div className="space-y-2">
              <input
                value={paymentNote}
                onChange={(e) => setPaymentNote(e.target.value)}
                placeholder="কীসের জন্য টাকা দিলেন"
                className="w-full bg-[#17140f] border border-[#3a3226] rounded-lg px-3 py-2 text-sm placeholder-[#5c5342] focus:outline-none focus:ring-1 focus:ring-[#b8935a]"
              />
              <input
                type="number"
                value={paymentAmount}
                onChange={(e) => setPaymentAmount(e.target.value)}
                placeholder="কত টাকা"
                className="w-full bg-[#17140f] border border-[#3a3226] rounded-lg px-3 py-2 text-sm placeholder-[#5c5342] focus:outline-none focus:ring-1 focus:ring-[#b8935a]"
              />
              <button
                onClick={savePayment}
                disabled={savingPayment || !paymentAmount}
                className="w-full flex items-center justify-center gap-2 bg-[#b8935a] hover:bg-[#c9a56d] disabled:opacity-60 text-[#0f0d0a] font-medium text-sm py-3 rounded-xl mt-2"
              >
                {savingPayment ? <Loader2 size={15} className="animate-spin" /> : null}
                {editingPaymentId ? "আপডেট করুন" : "সেভ করুন"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ---- GROUP SCREEN ---------------------------------------------------------
function GroupScreen({ groupId, entries, pages, fraudResults, refreshFraudResults, onBack, refreshEntries, moderator, authedFetch, isAdmin, allowedGroups, appSettings }) {
  const isAllowed = isAdmin || !allowedGroups || allowedGroups.includes(groupId);
  const group = GROUPS.find((g) => g.id === groupId);
  const [sendingId, setSendingId] = useState(null);
  const [toast, setToast] = useState(null);
  const [search, setSearch] = useState("");
  // All Order only — filters the displayed list by sales_date (which day
  // this order was chosen to count as, via the day-choice prompt), not
  // by createdAt (real posting time, which never changes).
  const [salesDateFilter, setSalesDateFilter] = useState(null); // null | "today" | "yesterday"
  const [showSalesDateMenu, setShowSalesDateMenu] = useState(false);
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

  // Which action is waiting on a page choice: null | "compose" | an entry
  // (for Website Order's "Send to All Order" button)
  const [pagePickerFor, setPagePickerFor] = useState(null);

  // Shown right after a successful "Send to Courier" — parcel ID + bill,
  // with a choice to keep the post or delete it now that it's shipped.
  const [courierResultModal, setCourierResultModal] = useState(null);
  // Tracks whether Print was clicked for the current courierResultModal —
  // used to warn before deleting an un-printed courier pad.
  const [hasPrintedPad, setHasPrintedPad] = useState(false);
  const [notPrintedWarningFor, setNotPrintedWarningFor] = useState(null);

  // Fraud-check popup: null | { loading, error, data }
  const [fraudCheckFor, setFraudCheckFor] = useState(null);
  // Live tracking + rider info popup: null | { loading, error, data, consignmentId }
  const [trackingFor, setTrackingFor] = useState(null);

  // All Order deletes require typing a confirmation password — this holds
  // the entry id currently being confirmed (null = modal closed).
  const [deletePasswordFor, setDeletePasswordFor] = useState(null);
  const [deletePasswordInput, setDeletePasswordInput] = useState("");
  const [deletePasswordError, setDeletePasswordError] = useState(false);

  // Website Order deletes require a typed reason — this holds the entry
  // id currently being confirmed (null = modal closed).
  const [deleteReasonFor, setDeleteReasonFor] = useState(null);
  const [deleteReasonInput, setDeleteReasonInput] = useState("");
  const [deleteReasonError, setDeleteReasonError] = useState(false);

  // Website Order's internal tab: "orders" (Processing/Hold) vs "incomplete"
  const [websiteSubTab, setWebsiteSubTab] = useState("orders");
  // Holds the entry id while typing a note for "Hold" status
  const [holdNoteFor, setHoldNoteFor] = useState(null);
  const [holdNoteInput, setHoldNoteInput] = useState("");

  // Shown when tapping a phone number — collects this number's history
  // across ALL groups (All Order, Pending, Making, Website Order,
  // Incomplete) so a moderator can see at a glance whether this customer
  // already has an order in progress or already shipped, before calling.
  const [phoneHistoryFor, setPhoneHistoryFor] = useState(null);

  // Shown when posting a new All Order entry, or forwarding a Website
  // Order entry, if this phone already has an existing order somewhere.
  // { phone, summary, onConfirm } — onConfirm runs if the moderator
  // chooses to post anyway.
  const [duplicateWarningFor, setDuplicateWarningFor] = useState(null);

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

  const handleSend = async (pageId = null) => {
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
        const data = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(data.error);
        showToast("এন্ট্রি আপডেট হয়েছে");
      } else {
        const res = await authedFetch(`${API_BASE}/api/entries`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ rawText: localText, imageUrls, moderator, group: groupId, pageId, dayChoice: dayChoiceValue }),
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(data.error);
        playNotificationSound();
        if (data.smsResult) {
          showToast(data.smsResult.success ? "📩 SMS পাঠানো হয়েছে" : `📩 SMS পাঠানো যায়নি — ${data.smsResult.error || ""}`);
        }
      }
      await refreshEntries();
    } catch (err) {
      showToast(err.message || "সেভ করা যায়নি, আবার চেষ্টা করুন");
      // Put back what was typed so nothing is lost — e.g. if it was
      // rejected for missing a phone number, they can fix and resend.
      setText(localText);
      setImages(localImages);
      if (wasEditing) setEditingId(wasEditing);
    } finally {
      setSending(false);
      setDayChoiceValue(null);
      if (tempId) setPendingEntries((prev) => prev.filter((e) => e.id !== tempId));
    }
  };

  // Late-night/early-morning "which day is this order for" prompt.
  // dayChoiceValue holds the resolved answer ('today'|'yesterday') for
  // the NEXT send; dayChoicePromptFor holds the popup's confirm callback
  // while it's open.
  const [dayChoiceValue, setDayChoiceValue] = useState(null);
  const [dayChoicePromptFor, setDayChoicePromptFor] = useState(null);

  const isInLateWindow = () => {
    if (!appSettings?.latePostPromptEnabled) return false;
    const now = new Date();
    const nowMinutes = now.getHours() * 60 + now.getMinutes();
    const cutoffH24 =
      appSettings.latePostPromptCutoffHour === 12
        ? 12
        : appSettings.latePostPromptCutoffHour + 12;
    const endMinutes = cutoffH24 * 60 + appSettings.latePostPromptCutoffMinute;
    return nowMinutes >= 1 && nowMinutes <= endMinutes;
  };

  // Wraps any "about to post" action with the day-choice prompt if we're
  // in the late-night/early-morning window — proceedFn only runs once
  // the moderator picks "আজকের" or "গতকালের" (never for "শিওর না").
  const withDayChoiceCheck = (proceedFn) => {
    if (isInLateWindow()) {
      setDayChoicePromptFor({
        onConfirm: (choice) => {
          setDayChoicePromptFor(null);
          if (choice === "not_sure") return;
          setDayChoiceValue(choice);
          proceedFn();
        },
      });
    } else {
      setDayChoiceValue(null);
      proceedFn();
    }
  };

  // Send button in the compose bar goes through here — checks for a
  // duplicate order first (All Order only), then asks "কোন পেইজের পোস্ট?"
  // (if any pages are configured), then actually sends.
  const proceedToSend = () => {
    if (!editingId && groupId === "all_order" && pages && pages.length > 0) {
      setPagePickerFor("compose");
      return;
    }
    handleSend(null);
  };

  const handleSendClick = () => {
    const afterDayChoice = () => {
      if (!editingId && groupId === "all_order") {
        const phoneMatch = extractPhoneMatch(text)?.[0];
        const dup = phoneMatch ? findDuplicateSummary(phoneMatch) : null;
        if (dup) {
          setDuplicateWarningFor({
            phone: normalizePhoneForMatch(phoneMatch),
            summary: dup,
            onConfirm: proceedToSend,
          });
          return;
        }
      }
      proceedToSend();
    };

    if (!editingId && groupId === "all_order") {
      withDayChoiceCheck(afterDayChoice);
    } else {
      afterDayChoice();
    }
  };

  const deleteEntryDirect = async (id) => {
    try {
      const res = await authedFetch(`${API_BASE}/api/entries/${id}`, { method: "DELETE" });
      if (!res.ok) throw new Error();
      await refreshEntries();
      playNotificationSound();
      showToast("এন্ট্রি ডিলিট হয়েছে");
    } catch {
      showToast("ডিলিট করা যায়নি");
    }
  };

  const handleDelete = async (id) => {
    if (!window.confirm("সত্যিই এই এন্ট্রি ডিলিট করতে চান?")) return;
    deleteEntryDirect(id);
  };

  const submitPasswordDelete = async () => {
    const id = deletePasswordFor;
    try {
      const res = await authedFetch(`${API_BASE}/api/entries/${id}`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password: deletePasswordInput }),
      });
      if (res.status === 403) {
        setDeletePasswordError(true);
        return;
      }
      if (!res.ok) throw new Error();
      await refreshEntries();
      playNotificationSound();
      setDeletePasswordFor(null);
      setDeletePasswordInput("");
      setDeletePasswordError(false);
      showToast("এন্ট্রি ডিলিট হয়ে Recycle Bin-এ গেছে");
    } catch {
      showToast("ডিলিট করা যায়নি");
    }
  };

  const submitReasonDelete = async () => {
    const id = deleteReasonFor;
    const reason = deleteReasonInput.trim();
    if (!reason) {
      setDeleteReasonError(true);
      return;
    }
    try {
      const res = await authedFetch(`${API_BASE}/api/entries/${id}`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reason }),
      });
      if (!res.ok) throw new Error();
      await refreshEntries();
      playNotificationSound();
      setDeleteReasonFor(null);
      setDeleteReasonInput("");
      setDeleteReasonError(false);
      showToast("এন্ট্রি ডিলিট হয়ে Recycle Bin-এ গেছে");
    } catch {
      showToast("ডিলিট করা যায়নি");
    }
  };

  // Making's text is AI-curated specifically for size/quantity (handles
  // combos like "54/56" cleanly), so prefer it over guessing from the raw
  // order text — fall back to the raw text only if no Making copy exists.
  // Looks up the saved fraud-check summary (if any) for this entry's
  // phone number, so it can show automatically without re-checking.
  const getSavedFraudResult = (entry) => {
    const phone = normalizePhoneForMatch(entry.customerPhone || extractPhoneMatch(entry.rawText)?.[0]);
    return phone ? fraudResults[phone] : null;
  };

  const getSizeForEntry = (entry) => {
    const makingEntry = entries.find((e) => e.batchId === entry.batchId && e.group === "making");
    return (makingEntry && extractSizeInfo(makingEntry.rawText)) || extractSizeInfo(entry.rawText);
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
      setCourierResultModal(data);
      setHasPrintedPad(false);
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

  const handleSendToAllOrder = async (entry, pageId) => {
    setSendingId(entry.id);
    try {
      const res = await authedFetch(`${API_BASE}/api/entries/${entry.id}/send-to-all-order`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pageId, dayChoice: dayChoiceValue }),
      });
      if (!res.ok) throw new Error();
      const data = await res.json().catch(() => ({}));
      await refreshEntries();
      let msg = "All Order Group-এ পাঠানো হয়েছে";
      if (data.smsResult) {
        msg += data.smsResult.success ? " · 📩 SMS পাঠানো হয়েছে" : ` · 📩 SMS পাঠানো যায়নি`;
      }
      showToast(msg);
    } catch {
      showToast("পাঠানো যায়নি");
    } finally {
      setSendingId(null);
      setDayChoiceValue(null);
    }
  };

  // "Send to All Order" button in Website Order goes through here —
  // checks the late-night day-choice prompt first, then a duplicate
  // order elsewhere, then asks "কোন পেইজের পোস্ট?" if any pages exist.
  const handleSendToAllOrderClick = (entry) => {
    const proceed = () => {
      if (pages && pages.length > 0) {
        setPagePickerFor(entry);
        return;
      }
      handleSendToAllOrder(entry, null);
    };

    const afterDayChoice = () => {
      const phone = entry.customerPhone || extractPhoneMatch(entry.rawText)?.[0];
      const dup = phone ? findDuplicateSummary(phone, entry.id) : null;
      if (dup) {
        setDuplicateWarningFor({ phone: normalizePhoneForMatch(phone), summary: dup, onConfirm: proceed });
        return;
      }
      proceed();
    };

    withDayChoiceCheck(afterDayChoice);
  };

  const runFraudCheck = async (entry) => {
    setFraudCheckFor({ loading: true, error: null, data: null });
    try {
      const res = await authedFetch(`${API_BASE}/api/entries/${entry.id}/fraud-check`, { method: "POST" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "চেক করা যায়নি");
      setFraudCheckFor({ loading: false, error: null, data });
      refreshFraudResults();
    } catch (err) {
      setFraudCheckFor({ loading: false, error: err.message, data: null });
    }
  };

  const runTracking = async (entry) => {
    setTrackingFor({ loading: true, error: null, data: null, consignmentId: entry.consignmentId });
    try {
      const res = await authedFetch(`${API_BASE}/api/entries/${entry.id}/tracking`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "ট্র্যাকিং তথ্য পাওয়া যায়নি");
      setTrackingFor({ loading: false, error: null, data, consignmentId: entry.consignmentId });
    } catch (err) {
      setTrackingFor({ loading: false, error: err.message, data: null, consignmentId: entry.consignmentId });
    }
  };

  const updateEntryStatus = async (id, status, note) => {
    try {
      const res = await authedFetch(`${API_BASE}/api/entries/${id}/status`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status, note }),
      });
      if (!res.ok) throw new Error();
      await refreshEntries();
    } catch {
      showToast("স্ট্যাটাস আপডেট করা যায়নি");
    }
  };

  const submitHoldNote = async () => {
    const id = holdNoteFor;
    setHoldNoteFor(null);
    await updateEntryStatus(id, "hold", holdNoteInput.trim());
    setHoldNoteInput("");
  };

  // Looks across ALL groups (not just the one currently open) for any
  // entry matching this phone number, so a moderator can see instantly if
  // this customer already has an order in progress or already shipped —
  // no backend call needed, since `entries` already holds everything.
  const openPhoneHistory = (rawPhone) => {
    const normalized = normalizePhoneForMatch(rawPhone);
    const matches = entries.filter((e) => {
      const p1 = normalizePhoneForMatch(e.customerPhone);
      const p2 = normalizePhoneForMatch(extractPhoneMatch(e.rawText)?.[0]);
      return (p1 && p1 === normalized) || (p2 && p2 === normalized);
    });

    // Group by batch — the same order shows up 2-3 times (All Order,
    // Pending, Making), so summarize each order once instead of listing
    // every copy separately.
    const byBatch = {};
    matches.forEach((e) => {
      const key = e.batchId || `single-${e.id}`;
      if (!byBatch[key]) byBatch[key] = [];
      byBatch[key].push(e);
    });

    const summaries = Object.values(byBatch)
      .map((group) => {
        const sentEntry = group.find((e) => e.consignmentId);
        const groupNames = [...new Set(group.map((e) => e.group))];
        const latest = group.reduce((a, b) => (new Date(a.createdAt) > new Date(b.createdAt) ? a : b));
        const withImages = group.find((e) => e.imageUrls && e.imageUrls.length) || group[0];
        const withFullText =
          group.find((e) => e.group === "all_order") ||
          group.find((e) => e.group === "website_order") ||
          group[0];
        return {
          groupNames,
          sent: !!sentEntry,
          entryId: sentEntry?.id,
          consignmentId: sentEntry?.consignmentId,
          amount: sentEntry?.amount,
          status: latest.status,
          createdAt: latest.createdAt,
          productCode: latest.productCode || group.find((e) => e.productCode)?.productCode,
          imageUrls: withImages.imageUrls || [],
          rawText: withFullText.rawText,
          customerName: sentEntry?.customerName,
          customerAddress: sentEntry?.customerAddress,
        };
      })
      .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

    setPhoneHistoryFor({ phone: normalized, summaries });
  };

  // Checks if this phone already has an existing (non-Incomplete) order
  // anywhere, for the pre-post duplicate warning. excludeEntryId skips an
  // entry checking against itself (Website Order → Send to All Order).
  const findDuplicateSummary = (rawPhone, excludeEntryId) => {
    const normalized = normalizePhoneForMatch(rawPhone);
    if (!normalized) return null;
    const matches = entries.filter((e) => {
      if (excludeEntryId && e.id === excludeEntryId) return false;
      if (e.status === "incomplete") return false;
      const p1 = normalizePhoneForMatch(e.customerPhone);
      const p2 = normalizePhoneForMatch(extractPhoneMatch(e.rawText)?.[0]);
      return (p1 && p1 === normalized) || (p2 && p2 === normalized);
    });
    if (matches.length === 0) return null;
    const sentEntry = matches.find((e) => e.consignmentId);
    return { sent: !!sentEntry, consignmentId: sentEntry?.consignmentId, amount: sentEntry?.amount };
  };

  const groupEntries = entries.filter((e) => e.group === groupId);

  // Website Order has an internal "Incomplete" sub-tab (abandoned
  // checkouts) separate from real orders (Processing/Hold).
  const websiteTabFiltered =
    groupId === "website_order"
      ? groupEntries.filter((e) =>
          websiteSubTab === "incomplete" ? e.status === "incomplete" : e.status !== "incomplete"
        )
      : groupEntries;

  // Same phone number appearing twice in Website Order (order + possibly
  // its own incomplete capture, or two separate orders) — flag both so
  // an admin can check and delete the redundant one.
  const duplicatePhones = new Set();
  if (groupId === "website_order") {
    const counts = {};
    groupEntries.forEach((e) => {
      if (!e.customerPhone) return;
      counts[e.customerPhone] = (counts[e.customerPhone] || 0) + 1;
    });
    Object.keys(counts).forEach((phone) => {
      if (counts[phone] > 1) duplicatePhones.add(phone);
    });
  }

  const normalizedSearch = toEnglishDigits(search.toLowerCase().trim());
  const filtered = websiteTabFiltered
    .filter((e) => {
      if (!normalizedSearch) return true;
      const haystack = toEnglishDigits(
        [e.rawText, e.productCode, e.customerPhone, e.consignmentId].filter(Boolean).join(" ").toLowerCase()
      );
      return haystack.includes(normalizedSearch);
    })
    .filter((e) => {
      if (groupId !== "all_order" || !salesDateFilter) return true;
      const d = new Date();
      if (salesDateFilter === "yesterday") d.setDate(d.getDate() - 1);
      const target = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
      if (e.salesDate !== target) return false;
      // Match Sales Summary exactly — it ignores anything posted before
      // the configured start cutoff, so this filter does too.
      if (appSettings?.salesSummaryStartAt && new Date(e.createdAt) < new Date(appSettings.salesSummaryStartAt)) {
        return false;
      }
      return true;
    });
  // Pending/Making are filled only by auto-forwarding from All Order — new
  // forwards should land at the bottom of the list (like a queue), not
  // jump to the top the way a fresh chat message normally would.
  const orderedFiltered =
    groupId === "pending" || groupId === "making" ? [...filtered].reverse() : filtered;
  const displayList = [...pendingEntries, ...orderedFiltered];

  if (!isAllowed) {
    return (
      <div className="min-h-screen bg-[#0f0d0a] text-[#f2ede4] flex flex-col items-center justify-center px-6 text-center" style={{ fontFamily: "'Inter', sans-serif" }}>
        <style>{globalStyle}</style>
        <p className="text-[14px] text-[#e0a3a3] font-medium mb-4">এ গ্রুপে প্রবেশের অনুমতি নেই আপনার</p>
        <button
          onClick={onBack}
          className="bg-[#b8935a] hover:bg-[#c9a56d] text-[#0f0d0a] font-medium text-sm py-2.5 px-6 rounded-lg"
        >
          পিছনে যান
        </button>
      </div>
    );
  }

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
          {groupId === "all_order" && (
            <div className="relative">
              <button
                onClick={() => setShowSalesDateMenu((v) => !v)}
                className={`flex items-center gap-1 text-[11px] font-medium px-2.5 py-1.5 rounded-lg border ${
                  salesDateFilter
                    ? "bg-[#b8935a]/20 border-[#b8935a] text-[#d9b877]"
                    : "border-[#3a3226] text-[#8a7a5c]"
                }`}
              >
                {salesDateFilter === "today" ? "আজ" : salesDateFilter === "yesterday" ? "গতকাল" : "সব"}
                <ChevronLeft size={12} className="-rotate-90" />
              </button>
              {showSalesDateMenu && (
                <div className="absolute right-0 mt-1 w-32 bg-[#1a1712] border border-[#3a3226] rounded-lg overflow-hidden z-40 shadow-lg">
                  {[
                    { id: null, label: "সব" },
                    { id: "today", label: "আজ" },
                    { id: "yesterday", label: "গতকাল" },
                  ].map((opt) => (
                    <button
                      key={opt.label}
                      onClick={() => {
                        setSalesDateFilter(opt.id);
                        setShowSalesDateMenu(false);
                      }}
                      className={`w-full text-left px-3 py-2 text-[12px] hover:bg-[#241f17] ${
                        salesDateFilter === opt.id ? "text-[#d9b877]" : "text-[#c9bfa8]"
                      }`}
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}
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
          {groupId === "website_order" && (
            <div className="flex gap-2 mt-2">
              <button
                onClick={() => setWebsiteSubTab("orders")}
                className={`flex-1 text-xs font-medium py-2 rounded-lg border transition-colors ${
                  websiteSubTab === "orders"
                    ? "bg-[#9b7ac9]/20 border-[#9b7ac9] text-[#c9b3e8]"
                    : "bg-transparent border-[#241f17] text-[#6b6152]"
                }`}
              >
                অর্ডার
              </button>
              <button
                onClick={() => setWebsiteSubTab("incomplete")}
                className={`flex-1 text-xs font-medium py-2 rounded-lg border transition-colors ${
                  websiteSubTab === "incomplete"
                    ? "bg-[#9b7ac9]/20 border-[#9b7ac9] text-[#c9b3e8]"
                    : "bg-transparent border-[#241f17] text-[#6b6152]"
                }`}
              >
                Incomplete
              </button>
            </div>
          )}
        </div>
      </header>

      <main className="flex-1 max-w-lg mx-auto w-full px-5 py-5 space-y-5">
        {displayList.length === 0 && (
          <div className="text-center py-16 text-[#5c5342] text-sm">
            কোনো এন্ট্রি নেই। নিচে ছবি ও মেসেজ দিয়ে প্রথম এন্ট্রি পাঠান।
          </div>
        )}

        {displayList.map((entry) => {
          const isDuplicate = entry.customerPhone && duplicatePhones.has(entry.customerPhone);
          return (
          <article
            key={entry.id}
            className={`rounded-2xl overflow-hidden border ${entry.uploading ? "opacity-60" : ""} ${
              isDuplicate ? "bg-[#3a1a1a] border-[#6b2a2a]" : "bg-[#161310] border-[#241f17]"
            }`}
          >
            {isDuplicate && (
              <div className="bg-[#5c2626] text-[#f5c6c6] text-[11px] font-medium text-center py-1.5">
                Duplicate Order Found — একই ফোন নাম্বারে আরেকটা এন্ট্রি আছে
              </div>
            )}
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
                <StatusPill status={entry.status} groupId={groupId} />
              </div>
            </div>

            <div className="px-4 pt-4 pb-4">
              <div className="flex items-center justify-between mb-3">
                <span className="text-[11px] text-[#6b6152]">
                  {entry.moderator}
                  {entry.pageName && (
                    <span className="ml-2 px-1.5 py-0.5 rounded bg-[#241f17] text-[#d9b877] text-[10px]">
                      {entry.pageName}
                    </span>
                  )}
                  {entry.status === "incomplete" && (
                    <span className="ml-2 px-1.5 py-0.5 rounded bg-[#9b7ac9]/20 text-[#c9b3e8] text-[10px]">
                      Incomplete
                    </span>
                  )}
                </span>
                {isAdmin && !entry.uploading && (
                  <div className="flex items-center gap-3">
                    {(groupId === "pending" || groupId === "website_order") && (
                      <button
                        onClick={() => runFraudCheck(entry)}
                        className="text-[#6b6152] hover:text-[#d9b877]"
                        title="Fraud Check"
                      >
                        <Shield size={14} />
                      </button>
                    )}
                    {(groupId === "all_order" || groupId === "website_order" || groupId === "making") && (
                      <button onClick={() => startEdit(entry)} className="text-[#6b6152] hover:text-[#d9b877]">
                        <Pencil size={14} />
                      </button>
                    )}
                    {groupId !== "making" && (
                      <button
                        onClick={() => {
                          if (groupId === "all_order") setDeletePasswordFor(entry.id);
                          else if (groupId === "website_order" && entry.status !== "incomplete") {
                            setDeleteReasonFor(entry.id);
                            setDeleteReasonInput("");
                          } else handleDelete(entry.id);
                        }}
                        className="text-[#6b6152] hover:text-red-400"
                      >
                        <Trash2 size={14} />
                      </button>
                    )}
                  </div>
                )}
              </div>

              {getSavedFraudResult(entry) && (
                <p className="text-[11px] text-[#8a7a5c] mb-3 -mt-2">
                  🚚 মোট {getSavedFraudResult(entry).total} · ডেলিভার {getSavedFraudResult(entry).delivered} · ক্যান্সেল {getSavedFraudResult(entry).cancelled} · সফলতা {getSavedFraudResult(entry).successRate}%
                </p>
              )}

              <pre className="whitespace-pre-wrap font-sans text-sm text-[#c9bfa8] mb-4 leading-relaxed">
                {renderTextWithClickablePhone(entry.rawText, openPhoneHistory)}
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
                      <div>
                        {entry.customerName} ·{" "}
                        <span
                          onClick={() => openPhoneHistory(entry.customerPhone)}
                          className="text-[#d9b877] underline decoration-dotted cursor-pointer font-medium"
                        >
                          {entry.customerPhone}
                        </span>
                      </div>
                      <div>{entry.customerAddress}</div>
                    </div>
                  )}

                  {groupId === "website_order" ? (
                    !isAdmin ? null : (
                      <>
                        {entry.status !== "incomplete" && (
                          <div className="flex gap-2 mb-2">
                            <button
                              onClick={() => updateEntryStatus(entry.id, "processing", null)}
                              className={`flex-1 text-xs font-medium py-2 rounded-lg border transition-colors ${
                                entry.status === "processing"
                                  ? "bg-[#7a9db8]/20 border-[#7a9db8] text-[#9db8cc]"
                                  : "bg-transparent border-[#3a3226] text-[#6b6152]"
                              }`}
                            >
                              Processing
                            </button>
                            <button
                              onClick={() => {
                                setHoldNoteFor(entry.id);
                                setHoldNoteInput(entry.note || "");
                              }}
                              className={`flex-1 text-xs font-medium py-2 rounded-lg border transition-colors ${
                                entry.status === "hold"
                                  ? "bg-[#c98a4a]/20 border-[#c98a4a] text-[#e0ac6f]"
                                  : "bg-transparent border-[#3a3226] text-[#6b6152]"
                              }`}
                            >
                              Hold
                            </button>
                          </div>
                        )}
                        {entry.status === "hold" && entry.note && (
                          <p className="text-[12px] text-[#e0ac6f] bg-[#2a1f14] border border-[#4a3320] rounded-lg px-3 py-2 mb-2">
                            📝 {entry.note}
                          </p>
                        )}
                        <button
                          onClick={() => handleSendToAllOrderClick(entry)}
                          disabled={sendingId === entry.id}
                          className="w-full flex items-center justify-center gap-2 bg-[#b8935a] hover:bg-[#c9a56d] disabled:opacity-60 text-[#0f0d0a] font-medium text-sm py-3 rounded-xl transition-colors"
                        >
                          {sendingId === entry.id ? (
                            <Loader2 size={15} className="animate-spin" />
                          ) : (
                            <Send size={15} strokeWidth={2.5} />
                          )}
                          Send to All Order
                        </button>
                      </>
                    )
                  ) : groupId === "making" ? (
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
                    <button
                      onClick={() => entry.consignmentId && runTracking(entry)}
                      className="w-full flex items-center justify-center gap-2 bg-emerald-900/30 border border-emerald-700/40 text-emerald-200 font-medium text-sm py-3 rounded-xl"
                    >
                      <Package size={15} strokeWidth={2.5} />
                      পার্সেল আইডি: {entry.consignmentId || "—"} · ৳{entry.amount || 0}
                    </button>
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

              {entry.createdAt && (
                <p className="text-[10px] text-[#5c5342] text-center mt-3">
                  {formatFullDateTime(entry.createdAt)}
                </p>
              )}
            </div>
          </article>
          );
        })}
      </main>

      {(groupId === "all_order" || editingId) && (
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
                onClick={handleSendClick}
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

      {pagePickerFor && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/70 backdrop-blur-sm">
          <div className="w-full sm:max-w-sm bg-[#1a1712] border border-[#3a3226] rounded-t-2xl sm:rounded-2xl">
            <div className="flex items-center justify-between px-5 pt-5 pb-3 border-b border-[#2a251d]">
              <h3 className="font-serif text-lg text-[#f2ede4]">কোন পেইজের পোস্ট?</h3>
              <button onClick={() => setPagePickerFor(null)} className="text-[#8a7a5c] hover:text-[#f2ede4]">
                <X size={20} />
              </button>
            </div>
            <div className="px-5 py-4 space-y-2">
              {(pages || []).map((p) => (
                <button
                  key={p.id}
                  onClick={() => {
                    const target = pagePickerFor;
                    setPagePickerFor(null);
                    if (target === "compose") {
                      handleSend(p.id);
                    } else {
                      handleSendToAllOrder(target, p.id);
                    }
                  }}
                  className="w-full bg-[#17140f] border border-[#3a3226] hover:border-[#b8935a] text-[#f2ede4] text-sm py-3 rounded-lg transition-colors"
                >
                  {p.name}
                </button>
              ))}
              {(!pages || pages.length === 0) && (
                <p className="text-center py-3 text-[#5c5342] text-sm">কোনো পেইজ যোগ করা নেই</p>
              )}
            </div>
          </div>
        </div>
      )}

      {courierResultModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm px-6">
          <div className="w-full max-w-sm bg-[#1a1712] border border-[#3a3226] rounded-2xl p-6">
            <div className="flex items-center justify-center gap-2 mb-4">
              <CheckCircle2 size={20} className="text-emerald-400" />
              <span className="text-[13px] text-emerald-300 font-medium">কুরিয়ারে পাঠানো হয়েছে</span>
            </div>

            <div className="flex gap-4 mb-6">
              <div className="w-28 shrink-0 rounded-xl overflow-hidden bg-[#0a0908] border border-[#3a3226] flex items-center justify-center">
                {courierResultModal.imageUrls && courierResultModal.imageUrls[0] ? (
                  <img
                    src={courierResultModal.imageUrls[0]}
                    alt=""
                    className="w-full h-full object-cover"
                  />
                ) : (
                  <ImagePlus size={24} className="text-[#3a3226]" />
                )}
              </div>

              <div className="flex-1 min-w-0 text-left">
                <p className="text-[10px] uppercase tracking-wider text-[#8a7a5c] mb-0.5">Order #</p>
                <p className="text-[16px] font-semibold text-[#f2ede4] mb-2 truncate">
                  {courierResultModal.productCode || courierResultModal.id}
                </p>
                {getSizeForEntry(courierResultModal) && (
                  <>
                    <p className="text-[10px] uppercase tracking-wider text-[#8a7a5c] mb-0.5">Size</p>
                    <p className="text-[13px] text-[#c9bfa8] mb-2 truncate">
                      {getSizeForEntry(courierResultModal)}
                    </p>
                  </>
                )}
                <p className="text-[10px] uppercase tracking-wider text-[#8a7a5c] mb-0.5">Parcel ID</p>
                <p className="text-[20px] font-semibold text-[#f2ede4] mb-2 truncate">
                  {courierResultModal.consignmentId || "—"}
                </p>
                <p className="text-[10px] uppercase tracking-wider text-[#8a7a5c] mb-0.5">Total Bill</p>
                <p className="text-[16px] font-medium text-[#d9b877]">
                  ৳{courierResultModal.amount || 0}
                </p>
              </div>
            </div>

            <div className="flex gap-2">
              <button
                onClick={() => {
                  if (!hasPrintedPad) {
                    setNotPrintedWarningFor(courierResultModal.id);
                    return;
                  }
                  const id = courierResultModal.id;
                  setCourierResultModal(null);
                  deleteEntryDirect(id);
                }}
                className="flex-1 bg-[#3a1f1f] border border-[#5c2a2a] text-[#e0a3a3] font-medium text-sm py-3 rounded-xl"
              >
                Delete Post
              </button>
              <button
                onClick={() => {
                  const page = (pages || []).find((p) => p.id === courierResultModal.pageId);
                  printCourierPad(courierResultModal, page, getSizeForEntry(courierResultModal));
                  setHasPrintedPad(true);
                }}
                className="flex-1 bg-[#241f17] border border-[#3a3226] hover:border-[#b8935a] text-[#d9b877] font-medium text-sm py-3 rounded-xl"
              >
                Print
              </button>
              <button
                onClick={() => setCourierResultModal(null)}
                className="flex-1 bg-[#b8935a] hover:bg-[#c9a56d] text-[#0f0d0a] font-medium text-sm py-3 rounded-xl"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {notPrintedWarningFor && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/70 backdrop-blur-sm px-6">
          <div className="w-full max-w-sm bg-[#1a1712] border border-[#3a3226] rounded-2xl p-6">
            <h3 className="font-serif text-lg text-[#f2ede4] mb-2">⚠️ প্রিন্ট করা হয়নি</h3>
            <p className="text-[13px] text-[#c9bfa8] mb-5">
              আপনি এই কুরিয়ার এন্ট্রিটি প্রিন্ট করেননি, তারপরও ডিলিট করে দিতে চাচ্ছেন?
            </p>
            <div className="flex gap-3">
              <button
                onClick={() => setNotPrintedWarningFor(null)}
                className="flex-1 bg-[#1c1913] border border-[#3a3226] text-[#8a7a5c] font-medium text-sm py-2.5 rounded-lg"
              >
                না
              </button>
              <button
                onClick={() => {
                  const id = notPrintedWarningFor;
                  setNotPrintedWarningFor(null);
                  setCourierResultModal(null);
                  deleteEntryDirect(id);
                }}
                className="flex-1 bg-[#3a1f1f] border border-[#5c2a2a] text-[#e0a3a3] font-medium text-sm py-2.5 rounded-lg"
              >
                হ্যাঁ
              </button>
            </div>
          </div>
        </div>
      )}

      {deletePasswordFor && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm px-6">
          <div className="w-full max-w-sm bg-[#1a1712] border border-[#3a3226] rounded-2xl p-6">
            <h3 className="font-serif text-lg text-[#f2ede4] mb-1">Confirm Delete</h3>
            <p className="text-[12px] text-[#8a7a5c] mb-4">
              এই অর্ডারটা All Order, Pending, এবং Making — সব জায়গা থেকে মুছে যাবে। চালিয়ে যেতে পাসওয়ার্ড দিন।
            </p>
            <input
              type="password"
              autoFocus
              value={deletePasswordInput}
              onChange={(e) => {
                setDeletePasswordInput(e.target.value);
                setDeletePasswordError(false);
              }}
              onKeyDown={(e) => e.key === "Enter" && submitPasswordDelete()}
              placeholder="পাসওয়ার্ড"
              className={`w-full bg-[#17140f] border rounded-lg px-3 py-2.5 text-sm placeholder-[#5c5342] focus:outline-none focus:ring-1 mb-1 ${
                deletePasswordError ? "border-red-500 focus:ring-red-500" : "border-[#3a3226] focus:ring-[#b8935a]"
              }`}
            />
            {deletePasswordError && <p className="text-[11px] text-red-400 mb-3">ভুল পাসওয়ার্ড</p>}
            <div className="flex gap-3 mt-3">
              <button
                onClick={() => {
                  setDeletePasswordFor(null);
                  setDeletePasswordInput("");
                  setDeletePasswordError(false);
                }}
                className="flex-1 bg-[#1c1913] border border-[#3a3226] text-[#8a7a5c] font-medium text-sm py-2.5 rounded-lg"
              >
                Cancel
              </button>
              <button
                onClick={submitPasswordDelete}
                disabled={!deletePasswordInput}
                className="flex-1 bg-[#3a1f1f] border border-[#5c2a2a] disabled:opacity-50 text-[#e0a3a3] font-medium text-sm py-2.5 rounded-lg"
              >
                Delete Post
              </button>
            </div>
          </div>
        </div>
      )}

      {deleteReasonFor && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm px-6">
          <div className="w-full max-w-sm bg-[#1a1712] border border-[#3a3226] rounded-2xl p-6">
            <h3 className="font-serif text-lg text-[#f2ede4] mb-1">কেন ডিলিট করছেন?</h3>
            <p className="text-[12px] text-[#8a7a5c] mb-4">
              কারণ লেখা ছাড়া ডিলিট করা যাবে না। এই এন্ট্রিটা ২৪ ঘণ্টার জন্য Recycle Bin-এ থাকবে।
            </p>
            <textarea
              autoFocus
              value={deleteReasonInput}
              onChange={(e) => {
                setDeleteReasonInput(e.target.value);
                setDeleteReasonError(false);
              }}
              rows={3}
              placeholder="কারণ লিখুন..."
              className={`w-full bg-[#17140f] border rounded-lg px-3 py-2.5 text-sm placeholder-[#5c5342] focus:outline-none focus:ring-1 mb-1 resize-none ${
                deleteReasonError ? "border-red-500 focus:ring-red-500" : "border-[#3a3226] focus:ring-[#b8935a]"
              }`}
            />
            {deleteReasonError && <p className="text-[11px] text-red-400 mb-3">কারণ লিখতে হবে</p>}
            <div className="flex gap-3 mt-3">
              <button
                onClick={() => {
                  setDeleteReasonFor(null);
                  setDeleteReasonInput("");
                  setDeleteReasonError(false);
                }}
                className="flex-1 bg-[#1c1913] border border-[#3a3226] text-[#8a7a5c] font-medium text-sm py-2.5 rounded-lg"
              >
                Cancel
              </button>
              <button
                onClick={submitReasonDelete}
                disabled={!deleteReasonInput.trim()}
                className="flex-1 bg-[#3a1f1f] border border-[#5c2a2a] disabled:opacity-50 text-[#e0a3a3] font-medium text-sm py-2.5 rounded-lg"
              >
                Delete Post
              </button>
            </div>
          </div>
        </div>
      )}

      {holdNoteFor && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm px-6">
          <div className="w-full max-w-sm bg-[#1a1712] border border-[#3a3226] rounded-2xl p-6">
            <h3 className="font-serif text-lg text-[#f2ede4] mb-1">Hold — কী হয়েছিল?</h3>
            <p className="text-[12px] text-[#8a7a5c] mb-4">
              যেমন: "কল রিসিভ করেনি, পরে জানাবে" — পরে এই নোটটা কার্ডে দেখা যাবে।
            </p>
            <textarea
              autoFocus
              value={holdNoteInput}
              onChange={(e) => setHoldNoteInput(e.target.value)}
              rows={3}
              placeholder="নোট লিখুন..."
              className="w-full bg-[#17140f] border border-[#3a3226] rounded-lg px-3 py-2.5 text-sm placeholder-[#5c5342] focus:outline-none focus:ring-1 focus:ring-[#b8935a] mb-3 resize-none"
            />
            <div className="flex gap-3">
              <button
                onClick={() => {
                  setHoldNoteFor(null);
                  setHoldNoteInput("");
                }}
                className="flex-1 bg-[#1c1913] border border-[#3a3226] text-[#8a7a5c] font-medium text-sm py-2.5 rounded-lg"
              >
                Cancel
              </button>
              <button
                onClick={submitHoldNote}
                className="flex-1 bg-[#c98a4a] hover:bg-[#d99a5a] text-[#0f0d0a] font-medium text-sm py-2.5 rounded-lg"
              >
                Hold করুন
              </button>
            </div>
          </div>
        </div>
      )}

      {fraudCheckFor && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm px-6">
          <div className="w-full max-w-sm bg-[#1a1712] border border-[#3a3226] rounded-2xl p-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-serif text-lg text-[#f2ede4] flex items-center gap-2">
                <Shield size={18} className="text-[#b8935a]" /> Fraud Check
              </h3>
              <button onClick={() => setFraudCheckFor(null)} className="text-[#8a7a5c] hover:text-[#f2ede4]">
                <X size={20} />
              </button>
            </div>

            {fraudCheckFor.loading && (
              <div className="flex items-center justify-center gap-2 py-8 text-[#8a7a5c] text-sm">
                <Loader2 size={16} className="animate-spin" /> চেক করা হচ্ছে...
              </div>
            )}

            {fraudCheckFor.error && (
              <p className="text-center py-8 text-red-400 text-sm">{fraudCheckFor.error}</p>
            )}

            {fraudCheckFor.data && (
              <div>
                <p className="text-[11px] text-[#6b6152] mb-3">📞 {fraudCheckFor.data.phone}</p>

                {fraudCheckFor.data.ownSummary && fraudCheckFor.data.ownSummary.total > 0 && (
                  <div className="rounded-xl border border-[#3a3226] bg-[#17140f] px-4 py-3 mb-3">
                    <p className="text-[11px] text-[#d9b877] font-medium mb-1">আমাদের নিজস্ব হিস্ট্রি</p>
                    <p className="text-[12px] text-[#c9bfa8]">
                      মোট {fraudCheckFor.data.ownSummary.total} · ডেলিভার {fraudCheckFor.data.ownSummary.delivered} · ক্যান্সেল {fraudCheckFor.data.ownSummary.cancelled}
                    </p>
                  </div>
                )}

                {fraudCheckFor.data.steadfastOfficial && (
                  <div className="rounded-xl border border-[#3a3226] bg-[#17140f] px-4 py-3">
                    <p className="text-[11px] text-[#d9b877] font-medium mb-1">Steadfast (অফিসিয়াল)</p>
                    {fraudCheckFor.data.steadfastOfficial.message ? (
                      <p className="text-[12px] text-[#8a7a5c]">
                        {fraudCheckFor.data.steadfastOfficial.message}
                        {fraudCheckFor.data.steadfastOfficial.attemptsLeft != null && (
                          <> · বাকি চেক: {fraudCheckFor.data.steadfastOfficial.attemptsLeft}</>
                        )}
                      </p>
                    ) : fraudCheckFor.data.steadfastOfficial.error ? (
                      <p className="text-[12px] text-[#8a7a5c]">
                        {fraudCheckFor.data.steadfastOfficial.error}
                        {fraudCheckFor.data.steadfastOfficial.limit != null && (
                          <> ({fraudCheckFor.data.steadfastOfficial.current}/{fraudCheckFor.data.steadfastOfficial.limit})</>
                        )}
                      </p>
                    ) : (
                      <p className="text-[12px] text-[#c9bfa8]">
                        মোট {fraudCheckFor.data.steadfastOfficial.total} · ডেলিভার {fraudCheckFor.data.steadfastOfficial.delivered} · ক্যান্সেল {fraudCheckFor.data.steadfastOfficial.cancelled} · সফলতা {fraudCheckFor.data.steadfastOfficial.successRate}%
                      </p>
                    )}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      )}

      {trackingFor && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/70 backdrop-blur-sm px-6">
          <div className="w-full max-w-sm bg-[#1a1712] border border-[#3a3226] rounded-2xl p-6 max-h-[85vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-serif text-lg text-[#f2ede4]">পার্সেল ট্র্যাকিং</h3>
              <button onClick={() => setTrackingFor(null)} className="text-[#8a7a5c] hover:text-[#f2ede4]">
                <X size={20} />
              </button>
            </div>
            <p className="text-[11px] text-[#6b6152] mb-4">Parcel ID: {trackingFor.consignmentId}</p>

            {trackingFor.loading && (
              <div className="flex items-center justify-center gap-2 py-8 text-[#8a7a5c] text-sm">
                <Loader2 size={16} className="animate-spin" /> লোড হচ্ছে...
              </div>
            )}

            {trackingFor.error && (
              <p className="text-center py-8 text-red-400 text-sm">{trackingFor.error}</p>
            )}

            {trackingFor.data && (
              <div>
                {trackingFor.data.status && (() => {
                  const s = trackingFor.data.status.toLowerCase();
                  const color = s.includes("delivered")
                    ? "text-emerald-300 border-emerald-700/40 bg-emerald-900/20"
                    : s.includes("cancel")
                    ? "text-red-300 border-red-700/40 bg-red-900/20"
                    : s.includes("pending") || s.includes("hold")
                    ? "text-amber-300 border-amber-700/40 bg-amber-900/20"
                    : "text-[#d9b877] border-[#3a3226] bg-[#17140f]";
                  return (
                    <div className={`rounded-xl border px-4 py-2 mb-3 text-center ${color}`}>
                      <span className="text-[13px] font-medium">{trackingFor.data.status}</span>
                    </div>
                  );
                })()}

                {(trackingFor.data.customerName || trackingFor.data.customerAddress || trackingFor.data.customerPhone) && (
                  <div className="rounded-xl border border-[#3a3226] bg-[#17140f] px-4 py-3 mb-3 space-y-1">
                    <p className="text-[11px] text-[#d9b877] font-medium mb-1">কাস্টমার</p>
                    {trackingFor.data.customerName && (
                      <p className="text-[13px] text-[#c9bfa8]">{trackingFor.data.customerName}</p>
                    )}
                    {trackingFor.data.customerAddress && (
                      <p className="text-[12px] text-[#8a7a5c]">
                        {trackingFor.data.customerAddress}
                        {trackingFor.data.customerPoliceStation ? `, ${trackingFor.data.customerPoliceStation}` : ""}
                      </p>
                    )}
                    {trackingFor.data.customerPhone && (
                      <div className="flex items-center justify-between pt-1">
                        <span className="text-[13px] text-[#c9bfa8]">
                          {trackingFor.data.customerPhone}
                          {trackingFor.data.customerAltPhone && ` · ${trackingFor.data.customerAltPhone}`}
                        </span>
                        <a
                          href={`tel:${trackingFor.data.customerPhone}`}
                          className="text-[12px] bg-[#241f17] border border-[#3a3226] text-[#d9b877] font-medium px-3 py-1 rounded-full"
                        >
                          📞 Call
                        </a>
                      </div>
                    )}
                    {trackingFor.data.codAmount && (
                      <p className="text-[12px] text-[#8a7a5c] pt-1">COD: ৳{trackingFor.data.codAmount}</p>
                    )}
                  </div>
                )}

                {trackingFor.data.riderName && (
                  <div className="rounded-xl border border-[#3a3226] bg-[#17140f] px-4 py-3 mb-4">
                    <p className="text-[11px] text-[#d9b877] font-medium mb-1">রাইডার</p>
                    <div className="flex items-center justify-between">
                      <span className="text-[13px] text-[#c9bfa8]">{trackingFor.data.riderName}</span>
                      {trackingFor.data.riderPhone && (
                        <a
                          href={`tel:${trackingFor.data.riderPhone}`}
                          className="text-[12px] bg-[#b8935a] text-[#0f0d0a] font-medium px-3 py-1 rounded-full"
                        >
                          📞 {trackingFor.data.riderPhone}
                        </a>
                      )}
                    </div>
                  </div>
                )}

                <p className="text-[11px] text-[#6b6152] mb-2">ট্র্যাকিং আপডেট</p>
                <div className="space-y-2">
                  {(trackingFor.data.trackingSteps || []).map((step, i) => (
                    <div key={i} className="bg-[#161310] border border-[#241f17] rounded-lg px-3 py-2">
                      <p className="text-[10px] text-[#6b6152] mb-0.5">{step.date} · {step.time}</p>
                      <p className="text-[12px] text-[#c9bfa8]">{step.message}</p>
                    </div>
                  ))}
                  {(!trackingFor.data.trackingSteps || trackingFor.data.trackingSteps.length === 0) && (
                    <p className="text-center py-4 text-[#5c5342] text-xs">কোনো আপডেট পাওয়া যায়নি</p>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {phoneHistoryFor && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm px-6">
          <div className="w-full max-w-sm bg-[#1a1712] border border-[#3a3226] rounded-2xl p-6 max-h-[80vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-serif text-lg text-[#f2ede4]">অর্ডার হিস্ট্রি</h3>
              <button onClick={() => setPhoneHistoryFor(null)} className="text-[#8a7a5c] hover:text-[#f2ede4]">
                <X size={20} />
              </button>
            </div>
            <p className="text-[11px] text-[#6b6152] mb-4">📞 {phoneHistoryFor.phone}</p>

            {phoneHistoryFor.summaries.length === 0 ? (
              <p className="text-center py-6 text-[#5c5342] text-sm">এই নাম্বারে আর কোনো অর্ডার পাওয়া যায়নি</p>
            ) : (
              <div className="space-y-3">
                {phoneHistoryFor.summaries.map((s, i) => {
                  const groupLabels = {
                    all_order: "All Order",
                    pending: "Pending",
                    making: "Making",
                    website_order: "Website Order",
                  };
                  return (
                    <div key={i} className="bg-[#161310] border border-[#241f17] rounded-xl overflow-hidden">
                      {s.imageUrls && s.imageUrls.length > 0 && (
                        <div className={`grid gap-0.5 ${s.imageUrls.length === 1 ? "grid-cols-1" : "grid-cols-2"}`}>
                          {s.imageUrls.map((url, j) => (
                            <div
                              key={j}
                              className="bg-[#0a0908] flex items-center justify-center overflow-hidden"
                              style={{ aspectRatio: s.imageUrls.length === 1 ? "4 / 5" : "3 / 4" }}
                            >
                              <img src={url} alt="" className="w-full h-full object-contain" />
                            </div>
                          ))}
                        </div>
                      )}
                      <div className="p-3">
                        <div className="flex items-center justify-between mb-1.5">
                          <span className="text-[13px] font-medium text-[#f2ede4]">
                            #{s.productCode || "—"}
                          </span>
                          <span className="text-[10px] text-[#6b6152]">{formatTime(s.createdAt)}</span>
                        </div>
                        <div className="flex flex-wrap gap-1 mb-2">
                          {s.groupNames.map((g) => (
                            <span key={g} className="text-[10px] px-1.5 py-0.5 rounded bg-[#241f17] text-[#8a7a5c]">
                              {groupLabels[g] || g}
                            </span>
                          ))}
                        </div>
                        <pre className="whitespace-pre-wrap font-sans text-[12px] text-[#c9bfa8] mb-2 leading-relaxed">
                          {s.rawText}
                        </pre>
                        {s.sent ? (
                          <p className="text-[12px] text-emerald-300">
                            ✅ কুরিয়ারে পাঠানো হয়েছে —{" "}
                            <span
                              onClick={() => s.entryId && runTracking({ id: s.entryId, consignmentId: s.consignmentId })}
                              className="underline decoration-dotted cursor-pointer font-medium"
                            >
                              Parcel ID: {s.consignmentId}
                            </span>{" "}
                            · ৳{s.amount || 0}
                          </p>
                        ) : s.status === "incomplete" ? (
                          <p className="text-[12px] text-[#c9b3e8]">⏳ Incomplete — অর্ডার সম্পন্ন করেনি</p>
                        ) : s.status === "hold" ? (
                          <p className="text-[12px] text-[#e0ac6f]">⏸ Hold অবস্থায় আছে</p>
                        ) : (
                          <p className="text-[12px] text-[#8a7a5c]">এখনো কুরিয়ারে পাঠানো হয়নি</p>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      )}

      {duplicateWarningFor && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm px-6">
          <div className="w-full max-w-sm bg-[#1a1712] border border-[#3a3226] rounded-2xl p-6">
            <h3 className="font-serif text-lg text-[#f2ede4] mb-1">⚠️ ডুপ্লিকেট অর্ডার সতর্কতা</h3>
            <p className="text-[12px] text-[#6b6152] mb-3">📞 {duplicateWarningFor.phone}</p>
            <p className="text-[13px] text-[#c9bfa8] mb-3">এই কাস্টমারের বর্তমানে একটি অর্ডার আছে।</p>

            <div className="rounded-xl border border-[#3a3226] bg-[#17140f] px-4 py-3 mb-4">
              {duplicateWarningFor.summary.sent ? (
                <p className="text-[13px] text-emerald-300">
                  ✅ অলরেডি কুরিয়ার করা হয়েছে — Parcel ID: {duplicateWarningFor.summary.consignmentId} · ৳{duplicateWarningFor.summary.amount || 0}
                </p>
              ) : (
                <p className="text-[13px] text-[#8a7a5c]">এখনো কুরিয়ার করা হয়নি</p>
              )}
            </div>

            <p className="text-[13px] text-[#c9bfa8] mb-4">আপনি কি আরও একটি অর্ডার যোগ করতে চান?</p>

            <div className="flex gap-3">
              <button
                onClick={() => setDuplicateWarningFor(null)}
                className="flex-1 bg-[#1c1913] border border-[#3a3226] text-[#8a7a5c] font-medium text-sm py-2.5 rounded-lg"
              >
                না, করতে চাই না
              </button>
              <button
                onClick={() => {
                  const confirmFn = duplicateWarningFor.onConfirm;
                  setDuplicateWarningFor(null);
                  confirmFn();
                }}
                className="flex-1 bg-[#b8935a] hover:bg-[#c9a56d] text-[#0f0d0a] font-medium text-sm py-2.5 rounded-lg"
              >
                হ্যাঁ, করতে চাই
              </button>
            </div>
          </div>
        </div>
      )}

      {dayChoicePromptFor && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm px-6">
          <div className="w-full max-w-sm bg-[#1a1712] border border-[#3a3226] rounded-2xl p-6">
            <h3 className="font-serif text-lg text-[#f2ede4] mb-3">এই অর্ডার কি আজকের নাকি গতকালের?</h3>
            <div className="flex flex-col gap-2">
              <button
                onClick={() => dayChoicePromptFor.onConfirm("today")}
                className="w-full bg-[#b8935a] hover:bg-[#c9a56d] text-[#0f0d0a] font-medium text-sm py-2.5 rounded-lg"
              >
                আজকের
              </button>
              <button
                onClick={() => dayChoicePromptFor.onConfirm("yesterday")}
                className="w-full bg-[#241f17] border border-[#3a3226] hover:border-[#b8935a] text-[#d9b877] font-medium text-sm py-2.5 rounded-lg"
              >
                গতকালের
              </button>
              <button
                onClick={() => dayChoicePromptFor.onConfirm("not_sure")}
                className="w-full bg-[#1c1913] border border-[#3a3226] text-[#8a7a5c] font-medium text-sm py-2.5 rounded-lg"
              >
                শিওর না
              </button>
            </div>
          </div>
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
    let allowedGroups = null;
    try {
      allowedGroups = JSON.parse(localStorage.getItem("asbab_allowed_groups") || "null");
    } catch {
      allowedGroups = null;
    }
    return token ? { token, role, name, phone, allowedGroups } : null;
  });

  const [entries, setEntries] = useState([]);
  const [pages, setPages] = useState([]);
  const [fraudResults, setFraudResults] = useState({});
  const [recycleBinItems, setRecycleBinItems] = useState([]);
  const [appSettings, setAppSettings] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [view, setView] = useState("home");
  const [drawerOpen, setDrawerOpen] = useState(false);

  // Navigating inside the app (Home -> Group/Purchase Cost/Recycle Bin)
  // pushes a real browser history entry, so the phone's Back button goes
  // to the previous screen instead of closing the whole app — this
  // matters especially once installed as an Android app (TWA), where
  // there's no in-app back arrow otherwise.
  const navigate = (nextView) => {
    window.history.pushState({ view: nextView }, "", "");
    setView(nextView);
  };

  useEffect(() => {
    // Establish a base history entry so the very first Back press has
    // something to land on instead of exiting immediately.
    window.history.replaceState({ view: "home" }, "", "");
    const onPopState = (e) => {
      setView(e.state?.view || "home");
    };
    window.addEventListener("popstate", onPopState);

    // Tapping a notification jumps straight to the relevant group —
    // either via a URL query param (app was closed, fresh window opened)
    // or a postMessage from the service worker (app was already open).
    const params = new URLSearchParams(window.location.search);
    const openGroup = params.get("openGroup");
    if (openGroup) {
      navigate(openGroup);
      window.history.replaceState({ view: openGroup }, "", window.location.pathname);
    }
    const onSwMessage = (event) => {
      if (event.data?.type === "OPEN_GROUP" && event.data.group) {
        navigate(event.data.group);
      }
    };
    navigator.serviceWorker?.addEventListener?.("message", onSwMessage);

    return () => {
      window.removeEventListener("popstate", onPopState);
      navigator.serviceWorker?.removeEventListener?.("message", onSwMessage);
    };
  }, []);

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
    localStorage.setItem("asbab_allowed_groups", JSON.stringify(data.allowedGroups || null));
    setAuth({ token: data.token, role: data.role, name: data.name, phone: data.phone, allowedGroups: data.allowedGroups || null });
  };

  const handleLogout = () => {
    localStorage.removeItem("asbab_token");
    localStorage.removeItem("asbab_role");
    localStorage.removeItem("asbab_name");
    localStorage.removeItem("asbab_phone");
    localStorage.removeItem("asbab_allowed_groups");
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

  const loadPages = async () => {
    if (!auth) return;
    try {
      const res = await authedFetch(`${API_BASE}/api/pages`);
      if (res.ok) setPages(await res.json());
    } catch {
      // non-critical — page picker just won't show options if this fails
    }
  };

  const loadFraudResults = async () => {
    if (!auth) return;
    try {
      const res = await authedFetch(`${API_BASE}/api/entries/fraud-results`);
      if (res.ok) setFraudResults(await res.json());
    } catch {
      // non-critical — just won't show the saved summaries if this fails
    }
  };

  const loadRecycleBin = async () => {
    if (!auth) return;
    try {
      const res = await authedFetch(`${API_BASE}/api/entries/recycle-bin`);
      if (res.ok) setRecycleBinItems(await res.json());
    } catch {
      // non-critical (also 403s for moderators, which is fine — just no preview)
    }
  };

  const loadAppSettings = async () => {
    if (!auth) return;
    try {
      const res = await authedFetch(`${API_BASE}/api/app-settings`);
      if (res.ok) setAppSettings(await res.json());
    } catch {
      // non-critical — the late-post day-choice prompt just won't show if this fails
    }
  };

  useEffect(() => {
    if (!auth) return;
    loadEntries(); // initial load — shows the loading screen once
    loadPages();
    loadFraudResults();
    loadRecycleBin();
    loadAppSettings();

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
      es.onmessage = () => {
        loadEntries(true);
        loadRecycleBin();
      };
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
        <HomeScreen
          entries={entries}
          onOpenGroup={(id) => navigate(id)}
          onOpenMenu={() => setDrawerOpen(true)}
          onOpenPurchaseCost={() => navigate("purchase_cost")}
          onOpenRecycleBin={() => navigate("recycle_bin")}
          onOpenAnalytics={() => navigate("analytics")}
          onOpenSystemAlerts={() => navigate("system_alerts")}
          recycleBinItems={recycleBinItems}
          isAdmin={auth.role === "admin"}
          allowedGroups={auth.allowedGroups}
        />
      ) : view === "purchase_cost" ? (
        <PurchaseCostScreen onBack={() => window.history.back()} authedFetch={authedFetch} />
      ) : view === "recycle_bin" ? (
        <RecycleBinScreen onBack={() => window.history.back()} authedFetch={authedFetch} />
      ) : view === "analytics" ? (
        <AnalyticsScreen onBack={() => window.history.back()} authedFetch={authedFetch} />
      ) : view === "system_alerts" ? (
        <SystemAlertsScreen onBack={() => window.history.back()} authedFetch={authedFetch} />
      ) : (
        <GroupScreen
          groupId={view}
          entries={entries}
          pages={pages}
          fraudResults={fraudResults}
          refreshFraudResults={loadFraudResults}
          onBack={() => window.history.back()}
          refreshEntries={() => loadEntries(true)}
          moderator={auth.name || auth.phone}
          authedFetch={authedFetch}
          isAdmin={auth.role === "admin"}
          allowedGroups={auth.allowedGroups}
          appSettings={appSettings}
        />
      )}
      <SideDrawer
        open={drawerOpen}
        onClose={() => {
          setDrawerOpen(false);
          loadPages();
        }}
        auth={auth}
        onLogout={handleLogout}
        authedFetch={authedFetch}
        appSettings={appSettings}
        refreshAppSettings={loadAppSettings}
      />
    </>
  );
}
