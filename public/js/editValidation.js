document.addEventListener("DOMContentLoaded", () => {
  const form = document.querySelector(".editForm");
  const contactInput = document.getElementById("contact");
  const contactError = document.getElementById("contactError");

  form.addEventListener("submit", (e) => {
    let valid = true;
    const contactValue = contactInput.value.trim();

    // Validate contact: must be 10-digit number
    const contactRegex = /^\d{10}$/;

    if (!contactValue) {
      contactError.textContent = "Contact is required";
      valid = false;
    } else if (!contactRegex.test(contactValue)) {
      contactError.textContent = "Contact must be a 10-digit number";
      valid = false;
    } else {
      contactError.textContent = "";
    }

    if (!valid) e.preventDefault();
  });
});
