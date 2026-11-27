// ================================================================
// auth.js - handles the login/register page
// ================================================================

// If already logged in, skip straight to the dashboard
if (getToken()) {
  window.location.href = "dashboard.html";
}

function switchTab(tab) {
  const isLogin = tab === "login";
  document.getElementById("tab-login").classList.toggle("active", isLogin);
  document.getElementById("tab-register").classList.toggle("active", !isLogin);
  document.getElementById("login-form").classList.toggle("hidden", !isLogin);
  document.getElementById("register-form").classList.toggle("hidden", isLogin);
}

document.getElementById("login-form").addEventListener("submit", async (e) => {
  e.preventDefault();
  const msg = document.getElementById("login-msg");
  msg.textContent = "";
  msg.className = "";

  const email = document.getElementById("login-email").value;
  const password = document.getElementById("login-password").value;

  try {
    const data = await apiCall("/auth/login", "POST", { email, password });
    saveSession(data.token, data.user);
    window.location.href = "dashboard.html";
  } catch (err) {
    msg.textContent = err.message;
    msg.className = "error-msg";
  }
});

document.getElementById("register-form").addEventListener("submit", async (e) => {
  e.preventDefault();
  const msg = document.getElementById("register-msg");
  msg.textContent = "";
  msg.className = "";

  const name = document.getElementById("reg-name").value;
  const email = document.getElementById("reg-email").value;
  const role = document.getElementById("reg-role").value;
  const password = document.getElementById("reg-password").value;

  try {
    await apiCall("/auth/register", "POST", { name, email, password, role });
    msg.textContent = "Account created! You can log in now.";
    msg.className = "success-msg";
    setTimeout(() => switchTab("login"), 1200);
  } catch (err) {
    msg.textContent = err.message;
    msg.className = "error-msg";
  }
});
