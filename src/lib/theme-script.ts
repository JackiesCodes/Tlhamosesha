// Shared by the server layout (inline <head> script) and the client theme hook.
export const THEME_KEY = "tl-theme";

/** Runs in <head> before React; applies the saved theme so there is no flash. */
export const THEME_SCRIPT = `(function(){try{var p=localStorage.getItem("${THEME_KEY}")||"dark";var d=p==="dark"||(p==="system"&&matchMedia("(prefers-color-scheme: dark)").matches);var c=document.documentElement.classList;c.toggle("dark",d);c.toggle("light",!d);}catch(e){}})();`;
