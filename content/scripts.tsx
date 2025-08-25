// Add type declaration for webpack hot module replacement
declare global {
  interface Window {
    wrappedJSObject?: any; // Firefox specific property
  }
}

import ReactDOM from "react-dom/client";
import { SharedCommandPalette } from "../components/shared/SharedCommandPalette";

let unmount: () => void;

if (import.meta.webpackHot) {
  import.meta.webpackHot?.accept();
  import.meta.webpackHot?.dispose(() => unmount?.());
}

// Run as early as possible
initializeExtension();

function initializeExtension() {
  // If document is already interactive or complete, initialize immediately
  if (
    document.readyState === "interactive" ||
    document.readyState === "complete"
  ) {
    unmount = initial() || (() => {});
  } else {
    // Otherwise wait for DOMContentLoaded which fires earlier than readyState complete
    document.addEventListener("DOMContentLoaded", () => {
      unmount = initial() || (() => {});
    });
  }
}

function initial() {
  console.debug("[Content] Initializing");
  // Create a new div element and append it to the document's body
  const rootDiv = document.createElement("div");
  rootDiv.id = "extension-root";
  document.body.appendChild(rootDiv);

  // Injecting content_scripts inside a shadow dom with Firefox compatibility
  try {
    const shadowRoot = rootDiv.attachShadow({ mode: "open" });

    // Use traditional style element approach instead of adoptedStyleSheets for Firefox compatibility
    const styleElement = document.createElement("style");
    shadowRoot.appendChild(styleElement);

    fetchCSS().then((response) => {
      styleElement.textContent = response;
    });

    if (import.meta.webpackHot) {
      import.meta.webpackHot?.accept("./styles.css", () => {
        fetchCSS().then((response) => {
          styleElement.textContent = response;
        });
      });
    }

    const mountingPoint = ReactDOM.createRoot(shadowRoot);
    mountingPoint.render(
      <div className="content_script raycast">
        <SharedCommandPalette />
      </div>
    );

    return () => {
      mountingPoint.unmount();
      rootDiv.remove();
    };
  } catch (e) {
    console.error("[content] Error setting up shadow DOM:", e);
    return () => {
      rootDiv.remove();
    };
  }
}

async function fetchCSS() {
  const cssUrl = new URL("./styles.css", import.meta.url);
  const response = await fetch(cssUrl);
  const text = await response.text();
  return response.ok ? text : Promise.reject(text);
}
