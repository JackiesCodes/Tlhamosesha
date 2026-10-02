"use client";
// Light / dark / system theme. The choice lives in localStorage so the inline
// script in app/layout.tsx can apply it before first paint (no flash).
import { useCallback, useEffect, useState } from "react";
import { THEME_KEY } from "./theme-script";

export type ThemePref = "light" | "dark" | "system";
const systemDark = () => typeof window !== "undefined" && window.matchMedia("(prefers-color-scheme: dark)").matches;

function apply(pref: ThemePref) {
  const dark = pref === "dark" || (pref === "system" && systemDark());
  const c = document.documentElement.classList;
  c.toggle("dark", dark);
  c.toggle("light", !dark);
  return dark ? "dark" : "light";
}

function read(): ThemePref {
  try {
    const v = localStorage.getItem(THEME_KEY);
    return v === "light" || v === "system" ? v : "dark";
  } catch {
    return "dark";
  }
}

const listeners = new Set<(p: ThemePref) => void>();

export function useTheme() {
  const [pref, setPrefState] = useState<ThemePref>("dark");
  const [resolved, setResolved] = useState<"light" | "dark">("dark");

  useEffect(() => {
    const p = read();
    setPrefState(p);
    setResolved(apply(p));
    const onChange = (next: ThemePref) => {
      setPrefState(next);
      setResolved(apply(next));
    };
    listeners.add(onChange);
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const onSystem = () => read() === "system" && setResolved(apply("system"));
    mq.addEventListener("change", onSystem);
    return () => {
      listeners.delete(onChange);
      mq.removeEventListener("change", onSystem);
    };
  }, []);

  const setPref = useCallback((p: ThemePref) => {
    try {
      localStorage.setItem(THEME_KEY, p);
    } catch {
      /* storage blocked: still switch for this session */
    }
    listeners.forEach((l) => l(p));
  }, []);

  return { pref, resolved, setPref };
}
