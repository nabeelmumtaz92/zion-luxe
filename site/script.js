// ---- INTEGRATION POINT -------------------------------------------------
// Paste your form backend URL(s) here (Google Apps Script web app URL from
// apps-script/Code.gs, Formspree, etc.). Submissions POST as form data.
// While this is empty, the form falls back to opening a pre-filled email to
// the address below so no inquiry is lost.
// One or more URLs. Local dashboard server: "http://localhost:8787/api/lead" (needs a tunnel to be reachable
// from the public site). Google Sheet: the Apps Script /exec URL.
const FORM_ENDPOINTS = [];
const FALLBACK_EMAIL = "nabeelmumtaz92@gmail.com";
// ------------------------------------------------------------------------

const form = document.getElementById("lead-form");
const errBox = document.getElementById("form-error");
const thanks = document.getElementById("thanks");
const btn = document.getElementById("submit-btn");

function showThanks() {
  form.hidden = true;
  thanks.hidden = false;
  thanks.focus();
  thanks.scrollIntoView({ behavior: "smooth", block: "center" });
}

form.addEventListener("submit", async (e) => {
  e.preventDefault();
  errBox.hidden = true;
  let firstBad = null;
  form.querySelectorAll("[required]").forEach((el) => {
    const bad = !el.value.trim() || (el.type === "email" && !/^\S+@\S+\.\S+$/.test(el.value));
    el.setAttribute("aria-invalid", bad ? "true" : "false");
    if (bad && !firstBad) firstBad = el;
  });
  if (firstBad) {
    errBox.textContent = "Please complete the highlighted fields.";
    errBox.hidden = false;
    firstBad.focus();
    return;
  }
  const data = new FormData(form);
  if (data.get("website")) return; // honeypot
  data.delete("website");
  btn.disabled = true;

  if (FORM_ENDPOINTS.length) {
    try {
      const body = new URLSearchParams(data);
      const results = await Promise.allSettled(FORM_ENDPOINTS.map((u) => fetch(u, { method: "POST", body, mode: "no-cors" })));
      if (results.every((r) => r.status === "rejected")) throw new Error("all endpoints failed");
      showThanks();
    } catch (err) {
      btn.disabled = false;
      errBox.textContent = "Something went wrong. Please WhatsApp or email us instead.";
      errBox.hidden = false;
    }
  } else {
    const lines = [...data.entries()].map(([k, v]) => k + ": " + v).join("\n");
    location.href = "mailto:" + FALLBACK_EMAIL + "?subject=" + encodeURIComponent("Trip inquiry") + "&body=" + encodeURIComponent(lines);
    showThanks();
  }
});
