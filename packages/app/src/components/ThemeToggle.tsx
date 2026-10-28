import { useEffect, useState } from "react";

type Theme = "light" | "dark";

const storageKey = "mailguard-theme";

// localStorage can throw (privacy modes, blocked storage, quota); the theme
// then just isn't remembered.
function loadTheme(): Theme {
  try {
    return localStorage.getItem(storageKey) === "dark" ? "dark" : "light";
  } catch {
    return "light";
  }
}

function saveTheme(theme: Theme) {
  try {
    localStorage.setItem(storageKey, theme);
  } catch {
    // Not remembered; the toggle still works for this visit.
  }
}

export function ThemeToggle() {
  const [theme, setTheme] = useState<Theme>(loadTheme);

  useEffect(() => {
    document.documentElement.classList.toggle("dark", theme === "dark");
  }, [theme]);

  const next: Theme = theme === "dark" ? "light" : "dark";
  return (
    <button
      type="button"
      aria-label={`Switch to ${next} mode`}
      title={`Switch to ${next} mode`}
      onClick={() => {
        setTheme(next);
        saveTheme(next);
      }}
      className="flex h-10 w-10 items-center justify-center border-2 border-ink hover:bg-ink hover:text-page"
    >
      {theme === "dark" ? <SunIcon /> : <MoonIcon />}
    </button>
  );
}

const iconProps = {
  "aria-hidden": true,
  width: 20,
  height: 20,
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 2.5,
  strokeLinecap: "round",
  strokeLinejoin: "round",
} as const;

function SunIcon() {
  return (
    <svg {...iconProps}>
      <circle cx="12" cy="12" r="4" />
      <path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" />
    </svg>
  );
}

function MoonIcon() {
  return (
    <svg {...iconProps}>
      <path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z" />
    </svg>
  );
}
