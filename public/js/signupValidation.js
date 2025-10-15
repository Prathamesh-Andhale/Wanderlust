document.addEventListener("DOMContentLoaded", () => {
  const form = document.getElementById("signupForm");
  const username = document.getElementById("username");
  const email = document.getElementById("email");
  const password = document.getElementById("password");
  const confirmPassword = document.getElementById("confirmPassword");

  // Error spans
  const usernameError = document.getElementById("usernameError");
  const emailError = document.getElementById("emailError");
  const passwordError = document.getElementById("passwordError");
  const confirmPasswordError = document.getElementById("confirmPasswordError");

  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  const passwordRegex =
    /^(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]{8,}$/;

  form.addEventListener("submit", (e) => {
    let valid = true;

    // Reset all error messages
    [usernameError, emailError, passwordError, confirmPasswordError].forEach(
      (err) => (err.textContent = "")
    );

    // Username check
    if (username.value.trim() === "") {
      usernameError.textContent = "Required";
      valid = false;
    }

    // Email check
    if (!emailRegex.test(email.value.trim())) {
      emailError.textContent = "Invalid email format";
      valid = false;
    }

    // Password check
    if (!passwordRegex.test(password.value)) {
      passwordError.textContent =
        "Min 8 chars, 1 uppercase, 1 number, 1 special symbol";
      valid = false;
    }

    // Confirm Password check
    if (
      confirmPassword.value !== password.value ||
      confirmPassword.value === ""
    ) {
      confirmPasswordError.textContent = "Passwords do not match";
      valid = false;
    }

    if (!valid) {
      e.preventDefault(); // stop form from submitting
    }
  });
});
