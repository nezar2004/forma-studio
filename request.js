"use strict";

// Public Formspree endpoint. This value is a form URL, never an API key.
const requestEndpoint = "";
const form = document.querySelector("#project-request");
const status = document.querySelector("#request-status");
const submit = form.querySelector('button[type="submit"]');
const endpointReady = /^https:\/\/formspree\.io\/f\/[a-z0-9]+$/i.test(requestEndpoint);
let pending = false;

function showStatus(state, message) {
  status.dataset.state = state;
  status.textContent = message;
}

if (endpointReady) {
  submit.disabled = false;
} else {
  showStatus("unavailable", form.dataset.unavailable);
}

form.addEventListener("submit", async event => {
  event.preventDefault();
  if (!endpointReady || pending || !form.reportValidity()) return;
  pending = true;
  submit.disabled = true;
  showStatus("pending", form.dataset.sending);
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15000);
  try {
    const response = await fetch(requestEndpoint, {
      method: "POST",
      headers: { Accept: "application/json" },
      body: new FormData(form),
      signal: controller.signal
    });
    const result = await response.json();
    if (!response.ok || result.ok !== true) throw new Error("Request not confirmed");
    form.reset();
    showStatus("success", form.dataset.success);
  } catch {
    showStatus("error", form.dataset.error);
  } finally {
    clearTimeout(timeout);
    submit.disabled = false;
    pending = false;
  }
});
