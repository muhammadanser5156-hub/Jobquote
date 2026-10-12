(function () {
  if (!window.JQ) { console.warn("Add the JQ line at the end of app.js"); return; }
  var CC = "92", CUR = "Rs. ";
  var lang = "ro";
  try { lang = localStorage.getItem("jq_lang") || "ro"; } catch (e) {}

  var css = document.createElement("style");
  css.textContent = ".wa{background:#25D366!important;color:#06240f!important;border-color:#25D366!important;font-weight:600}#langBar{display:flex;align-items:center;gap:8px;margin-bottom:10px;font-size:13px;color:var(--muted)}#langBar select{width:auto;padding:5px 8px}";
  document.head.appendChild(css);

  function money(n) { return CUR + Number(n).toLocaleString("en-US", { maximumFractionDigits: 2 }); }
  function find(id) { return window.JQ.jobs().find(function (x) { return String(x.id) === String(id); }); }
  function waNumber(p) {
    var d = String(p || "").replace(/\D/g, "");
    if (!d) return "";
    if (d.indexOf("00") === 0) return d.slice(2);
    if (d.charAt(0) === "0") return CC + d.slice(1);
    if (d.length === 10 && d.charAt(0) === "3") return CC + d;
    return d;
  }

  function build(j) {
    var amt = money(window.JQ.totals(j.items, j.tax).tot);
    var first = String(j.cust).split(" ")[0];
    var tax = +j.tax || 0;
    var job = j.job;
    var b = window.JQ.biz() || { ro: "hamari team", ur: "ہماری ٹیم", en: "our team" }[lang];
    var M = {
      ro: {
        draft: "Assalam o Alaikum " + first + ", " + b + " ki taraf se \"" + job + "\" ka quote: " + amt + (tax ? " (" + tax + "% tax shamil)" : "") + ". Agar manzoor hai to \"Haan\" likh dein, hum aap ko schedule kar denge. Shukriya!",
        sent: "Assalam o Alaikum " + first + ", " + b + " ki taraf se yaad dehani: \"" + job + "\" ka bill (" + amt + ") abhi baqi hai. Meherbani karke payment bhej dein ya bata dein kab tak ho jaye gi. Shukriya!",
        paid: "Shukriya " + first + "! \"" + job + "\" ki payment (" + amt + ") mil gayi. Aap ka bohat shukriya."
      },
      ur: {
        draft: "السلام علیکم " + first + "، " + b + " کی طرف سے \"" + job + "\" کا کوٹیشن: " + amt + (tax ? " (جس میں " + tax + "% ٹیکس شامل ہے)" : "") + "۔ اگر منظور ہے تو \"ہاں\" لکھ دیں، ہم آپ کو شیڈول کر دیں گے۔ شکریہ!",
        sent: "السلام علیکم " + first + "، " + b + " کی طرف سے یاد دہانی: \"" + job + "\" کا بل (" + amt + ") ابھی باقی ہے۔ مہربانی کرکے ادائیگی بھیج دیں یا بتا دیں کب تک ہو جائے گی۔ شکریہ!",
        paid: "شکریہ " + first + "! \"" + job + "\" کی ادائیگی (" + amt + ") موصول ہو گئی ہے۔ آپ کا بہت شکریہ۔"
      },
      en: {
        draft: "Hi " + first + ", here is your quote from " + b + " for \"" + job + "\": " + amt + (tax ? " (includes " + tax + "% tax)" : "") + ". Reply YES and I'll get you on the schedule.",
        sent: "Hi " + first + ", this is " + b + ". Quick reminder that your invoice for \"" + job + "\" (" + amt + ") is still open. Please let me know when payment is on the way. Thank you!",
        paid: "Thank you " + first + "! We received your payment of " + amt + " for \"" + job + "\"."
      }
    };
    return M[lang][j.status];
  }

  function openWA(j) {
    var n = waNumber(j.phone);
    window.open("https://wa.me/" + n + "?text=" + encodeURIComponent(build(j)), "_blank");
  }

  var f = document.getElementById("filters");
  var bar = document.createElement("div");
  bar.id = "langBar";
  bar.innerHTML = '<span>Message language:</span><select id="langSel"><option value="ro">Roman Urdu</option><option value="ur">اردو</option><option value="en">English</option></select>';
  f.parentNode.insertBefore(bar, f);
  var sel = document.getElementById("langSel");
  sel.value = lang;
  sel.onchange = function () {
    lang = sel.value;
    try { localStorage.setItem("jq_lang", lang); } catch (e) {}
  };

  function inject() {
    document.querySelectorAll("#list .actions").forEach(function (a) {
      if (a.querySelector(".wa")) return;
      var idEl = a.querySelector("[data-id]");
      if (!idEl) return;
      var j = find(idEl.getAttribute("data-id"));
      if (!j) return;
      var btn = document.createElement("button");
      btn.type = "button";
      btn.className = "wa";
      btn.textContent = "WhatsApp";
      btn.onclick = function () { openWA(j); };
      a.insertBefore(btn, a.firstChild);
    });
  }
  new MutationObserver(inject).observe(document.getElementById("list"), { childList: true });
  inject();

  document.addEventListener("click", function (e) {
    var t = e.target;
    if (!t.getAttribute || t.getAttribute("data-a") !== "msg") return;
    var j = find(t.getAttribute("data-id"));
    if (!j) return;
    e.stopPropagation();
    var text = build(j), old = t.textContent;
    var done = function () { t.textContent = "Copied ✓"; setTimeout(function () { t.textContent = old; }, 1500); };
    if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(text).then(done);
    else { var ta = document.createElement("textarea"); ta.value = text; document.body.appendChild(ta); ta.select(); document.execCommand("copy"); ta.remove(); done(); }
  }, true);
})();
