import { useEffect } from "react";

/**
 * Hook that creates a dynamic favicon based on the current primary color.
 * The favicon is an SVG with a rounded rectangle background that uses the primary color.
 */
export function useDynamicFavicon() {
  useEffect(() => {
    const updateFavicon = () => {
      // Get the current primary color from CSS custom properties
      const root = document.documentElement;
      const primaryHSL = getComputedStyle(root).getPropertyValue("--primary").trim();
      
      if (!primaryHSL) return;

      // Create SVG with dynamic background color
      const svgContent = `
        <svg width="64" height="64" viewBox="0 0 64 64" fill="none" xmlns="http://www.w3.org/2000/svg">
          <rect width="64" height="64" rx="16" fill="hsl(${primaryHSL})"/>
          <path d="M16.5 20H25.5L33 37H33.5L41 20H50V52H42.5V32H42L35 51.5H30.5L23.5 31.5H23V52H16.5V20Z" fill="white"/>
        </svg>
      `;

      // Convert SVG to data URL
      const encodedSvg = encodeURIComponent(svgContent);
      const dataUrl = `data:image/svg+xml,${encodedSvg}`;

      // Update or create favicon link element
      let link = document.querySelector("link[rel='icon']") as HTMLLinkElement | null;
      if (!link) {
        link = document.createElement("link");
        link.rel = "icon";
        document.head.appendChild(link);
      }
      link.type = "image/svg+xml";
      link.href = dataUrl;
    };

    // Update immediately
    updateFavicon();

    // Observe changes to the primary color
    const observer = new MutationObserver((mutations) => {
      mutations.forEach((mutation) => {
        if (mutation.attributeName === "style") {
          updateFavicon();
        }
      });
    });

    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["style"],
    });

    return () => observer.disconnect();
  }, []);
}
