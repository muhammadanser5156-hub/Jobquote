import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";

const CFG = window.APP_CONFIG || {};
const $ = (id) => document.getElementById(id);
const money = (n) => "$" + (Math.round(n * 100) / 100).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
function toast(m) { const t = $("toast"); t.textContent = m; t.className = "show"; clearTimeout(toast.t); toast.t = setTimeout(() => (t.className = ""), 2200); }
function totals(items, taxPct) {
  const sub = items.reduce((a, r) => a + (+r.q || 0) * (+r.p || 0), 0);
  const tax = sub * (+taxPct || 0) / 100;
  return { sub, tax, tot: sub + tax };
}

if (!CFG.SUPABASE_URL || CFG.SUPABASE_URL.includes("YOUR-PROJECT")) {
  document.body.innerHTML = '<div class="wrap"><div class="card"><h2>Setup needed</h2><p>Open config.js and paste your Supabase URL and key.</p></div></div>';
  throw new Error("Missing Supabase config");
}
const sb = createClient(CFG.SUPABASE_URL, CFG.SUPABASE_ANON_KEY);

let session = null, profile = null, jobs = [], filter = "all", mode = "in";
let rows = [{ d: "", q: 1, p: 0 }];
const PRESETS = [
  { d: "Service call", p: 89 }, { d: "Labor (per hour)", p: 95 }, { d: "Materials", p: 0 },
  { d: "Permit fee", p: 75 }, { d: "Haul-away & disposal", p: 60 }
];
const NEXT = { draft: ["sent", "Mark as sent"], sent: ["paid", "Mark as paid"] };

function setMode(m) {
  mode = m;
  $("authGo").textContent = m === "in" ? "Sign in" : "Create account";
  $("pass").autocomplete = m === "in" ? "current-password" : "new-password";
  $("tabIn").style.borderColor = m === "in" ? "var(--brand)" : "";
  $("tabUp").style.borderColor = m === "up" ? "var(--brand)" : "";
  $("msg").textContent = "";
}
function say(text, ok) { const m = $("msg"); m.textContent = text; m.className = ok ? "ok" : ""; }
$("tabIn").onclick = () => setMode("in");
$("tabUp").onclick = () => setMode("up");
$("authGo").onclick = async () => {
  const email = $("email").value.trim(), password = $("pass").value;
  if (!email || password.length < 8) return say("Enter your email and a password of 8+ characters.");
  $("authGo").disabled = true; say("");
  const { data, error } = mode === "in"
    ? await sb.auth.signInWithPassword({ email, password })
    : await sb.auth.signUp({ email, password });
  $("authGo").disabled = false;
  if (error) return say(error.message);
  if (mode === "up" && !data.session) say("Check your email and click the confirmation link, then sign in.", true);
};
$("outBtn").onclick = () => sb.auth.signOut();

sb.auth.onAuthStateChange((_evt, s) => { session = s; boot(); });

async function boot() {
  if (!session) {
    $("app").classList.add("hidden"); $("auth").classList.remove("hidden"); setMode(mode);
    return;
  }
  $("auth").classList.add("hidden"); $("app").classList.remove("hidden");
  $("who").textContent = session.user.email;
  await loadAll();
  if (new URLSearchParams(location.search).get("subscribed")) {
    toast("Thanks! Your subscription is being activated.");
    history.replaceState(null, "", "/");
    setTimeout(loadAll, 3000);
  }
}

async function loadAll() {
  const [p, j] = await Promise.all([
    sb.from("profiles").select("*").eq("id", session.user.id).single(),
    sb.from("jobs").select("*").order("created_at", { ascending: false })
  ]);
  profile = p.data; jobs = j.data || [];
  $("biz").value = (profile && profile.business_name) || "";
  render();
}
function hasAccess() {
  if (!profile) return false;
  return ["active", "trialing"].includes(profile.subscription_status) || new Date(profile.trial_ends) > new Date();
}
function renderBanner() {
  const b = $("banner"); if (!profile) return;
  const sub = ["active", "trialing"].includes(profile.subscription_status);
  if (sub) { b.classList.add("hidden"); return; }
  b.classList.remove("hidden");
  const days = Math.ceil((new Date(profile.trial_ends) - new Date()) / 86400000);
  if (days > 0) {
    b.className = "banner";
    b.innerHTML = '<span><b>Free trial:</b> ' + days + ' day' + (days === 1 ? "" : "s") + ' left.</span><button class="primary" id="subBtn" type="button">Subscribe ' + esc(CFG.PRICE_LABEL || "") + '</button>';
  } else {
    b.className = "banner locked";
    b.innerHTML = '<span><b>Your trial has ended.</b> Subscribe to create and edit quotes. Your data is safe.</span><button class="primary" id="subBtn" type="button">Subscribe ' + esc(CFG.PRICE_LABEL || "") + '</button>';
  }
  $("subBtn").onclick = () => openStripe("/api/checkout", $("subBtn"));
}
async function openStripe(path, btn) {
  if (btn) btn.disabled = true;
  try {
    const r = await fetch(path, { method: "POST", headers: { Authorization: "Bearer " + session.access_token } });
    const d = await r.json();
    if (!r.ok || !d.url) throw new Error(d.error || "Something went wrong");
    location.href = d.url;
  } catch (e) { toast(e.message); if (btn) btn.disabled = false; }
}
$("billBtn").onclick = () => {
  if (profile && profile.stripe_customer_id) openStripe("/api/portal", $("billBtn"));
  else openStripe("/api/checkout", $("billBtn"));
};

$("presets").innerHTML = PRESETS.map((p, i) => '<button type="button" class="chip" data-i="' + i + '">+ ' + esc(p.d) + '</button>').join("");
$("presets").addEventListener("click", (e) => {
  const i = e.target.getAttribute("data-i"); if (i === null) return;
  const p = PRESETS[i];
  if (rows.length === 1 && !rows[0].d && !+rows[0].p) rows = [];
  rows.push({ d: p.d, q: 1, p: p.p }); renderRows();
});
function renderRows() {
  $("items").innerHTML = rows.map((r, i) =>
    '<div class="row">' +
    '<input aria-label="Description" data-f="d" data-i="' + i + '" value="' + esc(r.d) + '" placeholder="Item">' +
    '<input aria-label="Quantity" data-f="q" data-i="' + i + '" type="number" min="0" step="any" inputmode="decimal" value="' + r.q + '">' +
    '<input aria-label="Price" data-f="p" data-i="' + i + '" type="number" min="0" step="0.01" inputmode="decimal" value="' + r.p + '">' +
    '<button type="button" aria-label="Remove line" data-del="' + i + '">×</button></div>').join("");
  renderTotals();
}
function renderTotals() {
  const t = totals(rows, $("tax").value);
  $("tSub").textContent = money(t.sub); $("tTax").textContent = money(t.tax); $("tTot").textContent = money(t.tot);
}
$("addRow").onclick = () => { rows.push({ d: "", q: 1, p: 0 }); renderRows(); };
$("items").addEventListener("input", (e) => {
  const i = e.target.getAttribute("data-i"), f = e.target.getAttribute("data-f");
  if (i === null) return; rows[i][f] = e.target.value; renderTotals();
});
$("items").addEventListener("click", (e) => {
  const i = e.target.getAttribute("data-del"); if (i === null) return;
  rows.splice(i, 1); if (!rows.length) rows = [{ d: "", q: 1, p: 0 }]; renderRows();
});
$("tax").addEventListener("input", renderTotals);
$("biz").addEventListener("change", async () => {
  if (!profile) return;
  profile.business_name = $("biz").value.trim();
  await sb.from("profiles").update({ business_name: profile.business_name }).eq("id", session.user.id);
});

$("save").onclick = async () => {
  if (!hasAccess()) return toast("Your trial has ended. Subscribe to keep adding quotes.");
  const cust = $("cust").value.trim(), job = $("job").value.trim();
  const items = rows.filter((r) => r.d.trim() && +r.q > 0).map((r) => ({ d: r.d.trim(), q: +r.q, p: +r.p || 0 }));
  if (!cust) { toast("Add a customer name"); return $("cust").focus(); }
  if (!job) { toast("Add a job description"); return $("job").focus(); }
  if (!items.length) return toast("Add at least one line item");
  $("save").disabled = true;
  const { data, error } = await sb.from("jobs")
    .insert({ cust, phone: $("phone").value.trim(), job, items, tax: +$("tax").value || 0 })
    .select().single();
  $("save").disabled = false;
  if (error) return toast("Could not save: " + error.message);
  jobs.unshift(data);
  $("cust").value = $("phone").value = $("job").value = "";
  rows = [{ d: "", q: 1, p: 0 }]; renderRows(); render(); toast("Quote saved");
};

const FILTERS = [["all", "All"], ["draft", "Draft"], ["sent", "Sent"], ["paid", "Paid"]];
$("filters").addEventListener("click", (e) => {
  const f = e.target.getAttribute("data-f"); if (!f) return; filter = f; render();
});
function render() {
  renderBanner();
  $("filters").innerHTML = FILTERS.map((f) => '<button type="button" class="chip' + (filter === f[0] ? " on" : "") + '" data-f="' + f[0] + '">' + f[1] + "</button>").join("");
  const now = new Date(); let out = 0, paid = 0, open = 0;
  jobs.forEach((j) => {
    const t = totals(j.items, j.tax).tot;
    if (j.status === "sent") out += t;
    if (j.status !== "paid") open++;
    if (j.status === "paid" && j.paid_at) {
      const d = new Date(j.paid_at);
      if (d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear()) paid += t;
    }
  });
  $("sOut").textContent = money(out).replace(/\.00$/, "");
  $("sPaid").textContent = money(paid).replace(/\.00$/, "");
  $("sOpen").textContent = open;

  const list = jobs.filter((j) => filter === "all" || j.status === filter);
  if (!list.length) {
    $("list").innerHTML = '<div class="empty">' + (jobs.length ? "No " + filter + " jobs." : "No quotes yet. Fill in the form to create your first one.") + "</div>";
    return;
  }
  $("list").innerHTML = list.map((j) => {
    const t = totals(j.items, j.tax).tot, n = NEXT[j.status];
    return '<article class="job"><div class="job-top"><div><h3>' + esc(j.cust) + "</h3><p>" + esc(j.job) + "</p>" +
      '<span class="badge ' + j.status + '">' + j.status.charAt(0).toUpperCase() + j.status.slice(1) + "</span></div>" +
      '<div class="amt">' + money(t) + "</div></div>" +
      '<div class="actions">' +
      (n ? '<button class="go" data-a="next" data-id="' + j.id + '">' + n[1] + "</button>" : "") +
      '<button data-a="msg" data-id="' + j.id + '">' + (j.status === "sent" ? "Copy reminder text" : "Copy quote text") + "</button>" +
      '<button data-a="print" data-id="' + j.id + '">Print / PDF</button>' +
      '<button class="del" data-a="del" data-id="' + j.id + '">Delete</button></div></article>';
  }).join("");
}
function copy(text) {
  if (navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard.writeText(text).then(() => toast("Copied"), () => fallback(text));
  } else fallback(text);
}
function fallback(text) {
  const ta = document.createElement("textarea"); ta.value = text; document.body.appendChild(ta); ta.select();
  try { document.execCommand("copy"); toast("Copied"); } catch (e) { toast("Copy failed"); } ta.remove();
}
function bizName() { return (profile && profile.business_name) || "our team"; }
function message(j) {
  const t = totals(j.items, j.tax).tot, first = j.cust.split(" ")[0];
  if (j.status === "sent")
    return "Hi " + first + ', this is ' + bizName() + '. Quick reminder that your invoice for "' + j.job + '" (' + money(t) + ") is still open. Reply here if you have any questions, or let me know when payment is on the way. Thank you!";
  return "Hi " + first + ", here is your quote from " + bizName() + ' for "' + j.job + '": ' + money(t) + (j.tax ? " (includes " + j.tax + "% tax)" : "") + ". Reply YES and I'll get you on the schedule.";
}
function printJob(j) {
  const t = totals(j.items, j.tax);
  $("printArea").innerHTML =
    "<h1>" + esc(bizName()) + "</h1><p><strong>" + (j.status === "paid" ? "Receipt" : j.status === "sent" ? "Invoice" : "Quote") + "</strong> for " + esc(j.cust) +
    (j.phone ? " · " + esc(j.phone) : "") + "<br>" + esc(j.job) + "<br>" + new Date(j.created_at).toLocaleDateString() + "</p>" +
    '<table><thead><tr><th>Item</th><th class="r">Qty</th><th class="r">Price</th><th class="r">Amount</th></tr></thead><tbody>' +
    j.items.map((r) => "<tr><td>" + esc(r.d) + '</td><td class="r">' + r.q + '</td><td class="r">' + money(r.p) + '</td><td class="r">' + money(r.q * r.p) + "</td></tr>").join("") +
    '</tbody></table><p style="text-align:right">Subtotal ' + money(t.sub) + "<br>Tax " + money(t.tax) + '<br><strong style="font-size:18px">Total ' + money(t.tot) + "</strong></p>";
  window.print();
}
$("list").addEventListener("click", async (e) => {
  const a = e.target.getAttribute("data-a"); if (!a) return;
  const j = jobs.find((x) => x.id === e.target.getAttribute("data-id")); if (!j) return;
  if (a === "next") {
    if (!hasAccess()) return toast("Your trial has ended. Subscribe to keep editing.");
    const status = NEXT[j.status][0], paid_at = status === "paid" ? new Date().toISOString() : null;
    const { error } = await sb.from("jobs").update({ status, paid_at }).eq("id", j.id);
    if (error) return toast("Could not update: " + error.message);
    j.status = status; j.paid_at = paid_at; render(); toast("Marked as " + status);
  } else if (a === "msg") copy(message(j));
  else if (a === "print") printJob(j);
  else if (a === "del") {
    if (!confirm("Delete the quote for " + j.cust + "?")) return;
    const { error } = await sb.from("jobs").delete().eq("id", j.id);
    if (error) return toast("Could not delete: " + error.message);
    jobs = jobs.filter((x) => x !== j); render();
  }
});

renderRows();
window.JQ = { jobs: () => jobs, totals: totals, biz: () => (profile && profile.business_name) || "" };

