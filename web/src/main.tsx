import { render } from "preact";
import "./styles.css";
import { App } from "./app";
import { bootstrap } from "./state";

// Apply the saved theme before the first paint. Dark is the product default; light is a
// deliberate alternative, not a fallback for a missing value.
try {
  const saved = localStorage.getItem("sopaan_theme");
  document.documentElement.dataset.theme = saved === "light" ? "light" : "dark";
} catch {
  document.documentElement.dataset.theme = "dark";
}

const root = document.getElementById("app");
if (root) render(<App />, root);

void bootstrap();
