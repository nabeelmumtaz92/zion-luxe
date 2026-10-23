// ---- INTEGRATION POINT -------------------------------------------------
// Paste your form backend URL here (Google Apps Script web app URL from
// apps-script/Code.gs, Formspree, etc.). Submissions POST as form data.
// While this is empty, the form falls back to opening a pre-filled email to
// the address below so no inquiry is lost.
const FORM_ENDPOINT = "";
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

  if (FORM_ENDPOINT) {
    try {
      await fetch(FORM_ENDPOINT, { method: "POST", body: data, mode: "no-cors" });
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
