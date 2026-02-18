/**
 * Auth form handling with loading indicator
 */

function initAuthForm(isRegister) {
  const form = document.getElementById("authForm");
  const wrapper = document.getElementById("authFormWrapper");
  const loadingIndicator = document.getElementById("loadingIndicator");
  const loadingText = document.getElementById("loadingText");
  const submitBtn = document.getElementById("submitBtn");

  if (!form || !wrapper || !loadingIndicator) {
    return;
  }

  form.addEventListener("submit", function (event) {
    const username = form.querySelector('input[name="username"]').value.trim();
    const password = form.querySelector('input[name="password"]').value;

    if (!username || !password) {
      return;
    }

    loadingText.textContent = isRegister ? "Registering..." : "Logging in...";
    loadingIndicator.setAttribute("aria-hidden", "false");
    wrapper.classList.add("submitting");
    submitBtn.disabled = true;
  });
}
