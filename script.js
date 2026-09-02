"use strict";

/*
 * Contact integration:
 * Provide a same-origin backend or a CORS-enabled form service.
 * It must accept POSTed FormData and return HTTP 2xx only after acceptance.
 * Validate inputs, rate-limit requests, and prevent spam on the server.
 * Never place secret API keys in this file.
 */
const CONTACT_ENDPOINT = "";

/* Restore theme early; storage can be unavailable in privacy modes. */
const root = document.documentElement;
const colorPreference = window.matchMedia("(prefers-color-scheme: dark)");
const motionPreference = window.matchMedia("(prefers-reduced-motion: reduce)");
let savedTheme = null;

try {
  savedTheme = localStorage.getItem("forma-theme");
} catch {
  // The site remains usable without persistent storage.
}

let hasThemeOverride = savedTheme === "dark" || savedTheme === "light";
root.dataset.theme = hasThemeOverride
  ? savedTheme
  : colorPreference.matches ? "dark" : "light";

document.addEventListener("DOMContentLoaded", () => {
  root.classList.add("js");

  /* Theme: follow the system until the visitor makes an explicit choice. */
  const themeButton = document.querySelector("#theme-toggle");
  themeButton.hidden = false;

  function updateThemeLabel() {
    const isDark = root.dataset.theme === "dark";
    themeButton.setAttribute(
      "aria-label",
      `Switch to ${isDark ? "light" : "dark"} mode`
    );
  }

  themeButton.addEventListener("click", () => {
    root.dataset.theme = root.dataset.theme === "dark" ? "light" : "dark";
    hasThemeOverride = true;

    try {
      localStorage.setItem("forma-theme", root.dataset.theme);
    } catch {
      // Theme switching still works for this visit.
    }

    updateThemeLabel();
  });

  colorPreference.addEventListener("change", event => {
    if (!hasThemeOverride) {
      root.dataset.theme = event.matches ? "dark" : "light";
      updateThemeLabel();
    }
  });

  updateThemeLabel();

  /* Mobile navigation: state, Escape handling, and breakpoint cleanup. */
  const menuButton = document.querySelector("#menu-toggle");
  const navigation = document.querySelector("#navigation");
  const mobileViewport = window.matchMedia("(max-width: 760px)");
  menuButton.hidden = false;

  function closeMenu(returnFocus = false) {
    navigation.classList.remove("is-open");
    menuButton.setAttribute("aria-expanded", "false");
    if (returnFocus) menuButton.focus();
  }

  menuButton.addEventListener("click", () => {
    const isOpen = navigation.classList.toggle("is-open");
    menuButton.setAttribute("aria-expanded", String(isOpen));
  });

  navigation.addEventListener("click", event => {
    const link = event.target.closest("a");
    if (!link) return;

    closeMenu();

    // Move focus out of the collapsed navigation to the chosen section.
    if (mobileViewport.matches) {
      const target = document.querySelector(link.getAttribute("href"));
      if (target) {
        target.setAttribute("tabindex", "-1");
        target.focus({ preventScroll: true });
        target.addEventListener("blur", () => {
          target.removeAttribute("tabindex");
        }, { once: true });
      }
    }
  });

  document.addEventListener("keydown", event => {
    if (event.key === "Escape" && navigation.classList.contains("is-open")) {
      closeMenu(true);
    }
  });

  document.addEventListener("click", event => {
    if (!event.target.closest(".header") &&
        navigation.classList.contains("is-open")) {
      closeMenu(navigation.contains(document.activeElement));
    }
  });

  mobileViewport.addEventListener("change", event => {
    if (!event.matches) {
      const menuHadFocus = document.activeElement === menuButton;
      closeMenu();
      if (menuHadFocus) navigation.querySelector("a").focus();
    }
  });

  /* Decorative pointer effect: no touch interception or required interaction. */
  const artwork = document.querySelector("#hero-art");
  const finePointer = window.matchMedia("(pointer: fine)");
  let artFrame = 0;

  artwork.addEventListener("pointermove", event => {
    if (motionPreference.matches || !finePointer.matches) return;

    const bounds = artwork.getBoundingClientRect();
    const x = (event.clientX - bounds.left) / bounds.width - 0.5;
    const y = (event.clientY - bounds.top) / bounds.height - 0.5;

    cancelAnimationFrame(artFrame);
    artFrame = requestAnimationFrame(() => {
      artwork.style.setProperty("--rx", `${-y * 24}deg`);
      artwork.style.setProperty("--ry", `${x * 24}deg`);
    });
  });

  function resetArtwork() {
    cancelAnimationFrame(artFrame);
    artwork.style.setProperty("--rx", "0deg");
    artwork.style.setProperty("--ry", "0deg");
  }

  artwork.addEventListener("pointerleave", resetArtwork);
  motionPreference.addEventListener("change", resetArtwork);

  /* Counters preserve final values without JS and animate only once in view. */
  const counters = document.querySelectorAll("[data-count]");

  function animateCounter(element) {
    const target = Number(element.dataset.count);
    if (!Number.isFinite(target) || motionPreference.matches) return;

    // A stable accessible value avoids announcing every animation frame.
    element.setAttribute("aria-label", String(target));
    const start = performance.now();
    const duration = 900;

    function frame(now) {
      if (motionPreference.matches) {
        element.textContent = String(target);
        return;
      }

      const progress = Math.min((now - start) / duration, 1);
      const eased = 1 - Math.pow(1 - progress, 3);
      element.textContent = String(Math.round(eased * target));
      if (progress < 1) requestAnimationFrame(frame);
    }

    requestAnimationFrame(frame);
  }

  if ("IntersectionObserver" in window) {
    const observer = new IntersectionObserver(entries => {
      entries.forEach(entry => {
        if (entry.isIntersecting) {
          animateCounter(entry.target);
          observer.unobserve(entry.target);
        }
      });
    }, { threshold: 0.6 });

    counters.forEach(counter => observer.observe(counter));
  }

  /* Contact: native validation, duplicate prevention, timeout, honest status. */
  const form = document.querySelector("#contact-form");
  const submitButton = document.querySelector("#submit-button");
  const submitLabel = document.querySelector("#submit-label");
  const status = document.querySelector("#form-status");
  let submitting = false;

  submitButton.disabled = false;
  document.querySelector("#year").textContent = String(new Date().getFullYear());

  function setStatus(message, state) {
    status.textContent = message;
    status.dataset.state = state;
  }

  // Reject whitespace-only values while retaining native validation messages.
  ["name", "message"].forEach(id => {
    const input = document.getElementById(id);

    function validateText() {
      const minimum = id === "message" ? 10 : 1;
      input.setCustomValidity(
        input.value.trim().length < minimum
          ? id === "message"
            ? "Please enter at least 10 characters describing your idea."
            : "Please enter your name."
          : ""
      );
    }

    input.addEventListener("input", validateText);
    validateText();
  });

  form.addEventListener("submit", async event => {
    event.preventDefault();
    if (submitting || !form.reportValidity()) return;

    if (!CONTACT_ENDPOINT.trim()) {
      setStatus(
        "This form is not connected yet. Your message has not been sent.",
        "error"
      );
      return;
    }

    submitting = true;
    submitButton.disabled = true;
    submitLabel.textContent = "Sending…";
    form.setAttribute("aria-busy", "true");
    setStatus("Sending your inquiry…", "pending");

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 15000);

    try {
      const data = new FormData(form);
      ["name", "email", "message"].forEach(key => {
        data.set(key, String(data.get(key) || "").trim());
      });

      const response = await fetch(CONTACT_ENDPOINT, {
        method: "POST",
        body: data,
        headers: { Accept: "application/json" },
        signal: controller.signal
      });

      if (!response.ok) throw new Error("Submission rejected");

      setStatus("Thank you. Your inquiry has been received.", "success");
      form.reset();
    } catch (error) {
      setStatus(
        error.name === "AbortError"
          ? "Delivery confirmation timed out. Your message may have arrived; please check before retrying."
          : "We couldn’t confirm delivery. Your details are still here so you can try again.",
        "error"
      );
    } finally {
      clearTimeout(timeout);
      submitting = false;
      submitButton.disabled = false;
      submitLabel.textContent = "Send your inquiry";
      form.removeAttribute("aria-busy");
    }
  });
});
