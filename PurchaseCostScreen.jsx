import React, { useState, useEffect } from "react";
import { CheckCircle2, ChevronLeft, Loader2, Lock, Pencil, Trash2, X } from "lucide-react";

// Kept as local copies (not shared imports) to keep this code-split
// chunk fully self-contained and avoid any risk of touching the main
// AsbabDashboard.jsx file's existing exports/scope.
const API_BASE = "https://asbab-backend-production.up.railway.app";

function formatFullDateTime(iso) {
  if (!iso) return "";
  const d = new Date(iso);
  const date = d.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
  const time = d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
  return `${date}, ${time}`;
}

const globalStyle = `
  @import url('https://fonts.googleapis.com/css2?family=Cormorant+Garamond:wght@500;600&family=Inter:wght@400;500;600&display=swap');
  .font-serif { font-family: 'Cormorant Garamond', serif; }
`;

export default function PurchaseCostScreen({ onBack, authedFetch }) {
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
  const [entryIsReturn, setEntryIsReturn] = useState(false);
  const [entryRows, setEntryRows] = useState([{ productId: "", quantity: "" }]);
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
  const openAddEntry = (isReturn = false) => {
    setEditingEntryId(null);
    setEntryProductId("");
    setEntryQuantity("");
    setEntryIsReturn(isReturn);
    setEntryRows([{ productId: "", quantity: "" }]);
    setModal("entry");
  };

  const openEditEntry = (item) => {
    setEditingEntryId(item.id);
    setEntryProductId(item.productId ? String(item.productId) : "");
    setEntryQuantity(String(item.quantity));
    setEntryIsReturn(!!item.isReturn);
    setModal("entry");
  };

  // Updates one row in the bulk-add form. When the row being edited is
  // the LAST one and both fields are now filled, a fresh empty row is
  // appended automatically — so the person can just keep going without
  // ever pressing an explicit "add another" button.
  const updateEntryRow = (index, field, value) => {
    setEntryRows((prev) => {
      const next = prev.map((row, i) => (i === index ? { ...row, [field]: value } : row));
      const row = next[index];
      const isLastRow = index === next.length - 1;
      if (isLastRow && row.productId && row.quantity) {
        next.push({ productId: "", quantity: "" });
      }
      return next;
    });
  };

  const removeEntryRow = (index) => {
    setEntryRows((prev) => (prev.length > 1 ? prev.filter((_, i) => i !== index) : prev));
  };

  const saveEntry = async () => {
    setSavingEntry(true);
    try {
      if (editingEntryId) {
        if (!entryProductId || !entryQuantity) return;
        const body = JSON.stringify({
          productId: Number(entryProductId),
          quantity: Number(entryQuantity),
          isReturn: entryIsReturn,
        });
        const res = await authedFetch(`${API_BASE}/api/purchases/entries/${editingEntryId}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body,
        });
        if (res.ok) {
          setModal(null);
          loadSummary();
          showToast("হিসাব আপডেট হয়েছে");
        }
        return;
      }

      // Bulk add — every fully-filled row becomes its own entry.
      const filledRows = entryRows.filter((r) => r.productId && r.quantity);
      if (filledRows.length === 0) return;

      let successCount = 0;
      for (const row of filledRows) {
        const res = await authedFetch(`${API_BASE}/api/purchases/entries`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            productId: Number(row.productId),
            quantity: Number(row.quantity),
            isReturn: entryIsReturn,
          }),
        });
        if (res.ok) successCount += 1;
      }

      setModal(null);
      loadSummary();
      showToast(
        entryIsReturn
          ? `${successCount}টা রিটার্ন যোগ হয়েছে`
          : `${successCount}টা হিসাব যোগ হয়েছে`
      );
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
            onClick={() => openAddEntry(false)}
            className="flex-1 text-xs font-medium py-2 rounded-lg border border-[#3a3226] text-[#c9bfa8] hover:border-[#b8935a]"
          >
            হিসাব যোগ করুন
          </button>
          <button
            onClick={() => openAddEntry(true)}
            className="flex-1 text-xs font-medium py-2 rounded-lg border border-[#5c2e2e] text-[#e0a3a3] hover:border-[#a35a5a]"
          >
            রিটার্ন যোগ করুন
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
                          {item.isReturn ? "রিটার্ন — " : ""}
                          {item.productName} × {item.quantity} (৳{item.unitPrice}/পিস)
                        </p>
                      ) : (
                        <p className="text-[12px] text-[#c9bfa8]">পেমেন্ট{item.note ? ` — ${item.note}` : ""}</p>
                      )}
                      <p className="text-[10px] text-[#6b6152]">{formatFullDateTime(item.createdAt)}</p>
                    </div>
                    <div className="flex items-center gap-2 shrink-0 ml-2">
                      <span
                        className={`text-[13px] font-medium ${
                          item.type === "purchase" ? (item.isReturn ? "text-red-400" : "text-[#e0a3a3]") : "text-emerald-300"
                        }`}
                      >
                        {item.type === "purchase" ? (item.isReturn ? "−" : "+") : "−"}৳{Math.abs(item.amount)}
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
              <h3 className="font-serif text-lg text-[#f2ede4]">
                {editingEntryId ? "হিসাব এডিট করুন" : entryIsReturn ? "রিটার্ন যোগ করুন" : "হিসাব যোগ করুন"}
              </h3>
              <button onClick={() => setModal(null)} className="text-[#8a7a5c] hover:text-[#f2ede4]">
                <X size={20} />
              </button>
            </div>
            <div className="space-y-2">
              {editingEntryId ? (
                <>
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
                    <p className={`text-[12px] ${entryIsReturn ? "text-red-400" : "text-[#8a7a5c]"}`}>
                      মোট: {entryIsReturn ? "-" : ""}৳
                      {(Number(products.find((p) => p.id === Number(entryProductId))?.price_per_unit || 0) * Number(entryQuantity)).toFixed(2)}
                    </p>
                  )}
                </>
              ) : (
                <>
                  <div className="max-h-[50vh] overflow-y-auto space-y-2 pr-0.5">
                    {entryRows.map((row, index) => {
                      const rowTotal =
                        Number(products.find((p) => p.id === Number(row.productId))?.price_per_unit || 0) * Number(row.quantity || 0);
                      return (
                        <div key={index} className="bg-[#161310] border border-[#241f17] rounded-lg p-2.5">
                          <div className="flex items-center gap-2 mb-1.5">
                            <select
                              value={row.productId}
                              onChange={(e) => updateEntryRow(index, "productId", e.target.value)}
                              className="flex-1 bg-[#17140f] border border-[#3a3226] rounded-lg px-2.5 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-[#b8935a]"
                            >
                              <option value="">প্রোডাক্ট বাছাই করুন</option>
                              {products.map((p) => (
                                <option key={p.id} value={p.id}>
                                  {p.name} (৳{p.price_per_unit}/পিস)
                                </option>
                              ))}
                            </select>
                            {entryRows.length > 1 && (
                              <button onClick={() => removeEntryRow(index)} className="text-[#6b6152] hover:text-red-400 shrink-0">
                                <X size={16} />
                              </button>
                            )}
                          </div>
                          <input
                            type="number"
                            value={row.quantity}
                            onChange={(e) => updateEntryRow(index, "quantity", e.target.value)}
                            placeholder="কত পিস"
                            className="w-full bg-[#17140f] border border-[#3a3226] rounded-lg px-2.5 py-2 text-sm placeholder-[#5c5342] focus:outline-none focus:ring-1 focus:ring-[#b8935a]"
                          />
                          {row.productId && row.quantity && (
                            <p className={`text-[11px] mt-1 ${entryIsReturn ? "text-red-400" : "text-[#8a7a5c]"}`}>
                              মোট: {entryIsReturn ? "-" : ""}৳{rowTotal.toFixed(2)}
                            </p>
                          )}
                        </div>
                      );
                    })}
                  </div>
                  {entryRows.some((r) => r.productId && r.quantity) && (
                    <p className={`text-[12px] font-medium pt-1 ${entryIsReturn ? "text-red-400" : "text-[#d9b877]"}`}>
                      সর্বমোট: {entryIsReturn ? "-" : ""}৳
                      {entryRows
                        .reduce(
                          (sum, r) =>
                            sum + Number(products.find((p) => p.id === Number(r.productId))?.price_per_unit || 0) * Number(r.quantity || 0),
                          0
                        )
                        .toFixed(2)}
                    </p>
                  )}
                </>
              )}
              <button
                onClick={saveEntry}
                disabled={
                  savingEntry ||
                  (editingEntryId ? !entryProductId || !entryQuantity : !entryRows.some((r) => r.productId && r.quantity))
                }
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
