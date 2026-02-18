/**
 * Admin portal UI interactions
 */

(function () {
  const sidebar = document.getElementById("adminSidebar");
  const toggleBtn = document.getElementById("sidebarToggle");

  if (toggleBtn && sidebar) {
    toggleBtn.addEventListener("click", function () {
      sidebar.classList.toggle("open");
    });
  }

  const deleteForms = document.querySelectorAll(".admin-delete-form");
  deleteForms.forEach(function (form) {
    form.addEventListener("submit", function (event) {
      const username = form.getAttribute("data-username") || "this user";
      if (!confirm("Delete user \"" + username + "\"? This cannot be undone.")) {
        event.preventDefault();
      }
    });
  });
})();
