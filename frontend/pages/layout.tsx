// frontend/pages/layout.tsx
import { ReactNode, useEffect, useState } from "react";
import { useRouter } from "next/router";

interface LayoutProps {
  children: ReactNode;
}

export default function Layout({ children }: LayoutProps) {
  const router = useRouter();
  const [userName, setUserName] = useState<string | null>(null);

  // helper to read user from localStorage (preferred) then fallback to token payload
  const refreshUserFromStorage = () => {
    try {
      const userJson = localStorage.getItem("infoai_user");
      if (userJson) {
        const user = JSON.parse(userJson);
        setUserName(user?.name ?? "User");
        return;
      }

      const token = localStorage.getItem("infoai_token");
      if (token) {
        const parts = token.split(".");
        if (parts.length > 1) {
          const payload = JSON.parse(atob(parts[1]));
          setUserName(payload?.name ?? "User");
          return;
        }
      }
    } catch (e) {
      // any parse error => fallback to generic
      setUserName("User");
      return;
    }
    // if nothing found
    setUserName(null);
  };

  useEffect(() => {
    // initial read
    refreshUserFromStorage();

    // when another tab updates localStorage
    const onStorage = (e: StorageEvent) => {
      if (!e.key) {
        // some browsers send null key for clear -> just refresh
        refreshUserFromStorage();
        return;
      }
      if (e.key === "infoai_token" || e.key === "infoai_user") {
        refreshUserFromStorage();
      }
    };

    // custom event fired when chat page receives init and writes user to localStorage
    const onUserChanged = () => refreshUserFromStorage();

    // update on route change (in case login flow removed token etc)
    const onRouteChange = () => refreshUserFromStorage();

    window.addEventListener("storage", onStorage);
    window.addEventListener("infoai_user_changed", onUserChanged as EventListener);
    router.events.on("routeChangeComplete", onRouteChange);

    return () => {
      window.removeEventListener("storage", onStorage);
      window.removeEventListener("infoai_user_changed", onUserChanged as EventListener);
      router.events.off("routeChangeComplete", onRouteChange);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleSignOut = () => {
    localStorage.removeItem("infoai_token");
    localStorage.removeItem("infoai_user");
    setUserName(null);
    // also dispatch the event so other components update immediately
    window.dispatchEvent(new Event("infoai_user_changed"));
    router.push("/");
  };

  const currentModel = process.env.NEXT_PUBLIC_GEMINI_MODEL || "gemini-2.5-flash";

  return (
    <div className="flex flex-col w-full bg-slate-50 min-h-0 h-screen">
      {/* Header */}
      <header className="bg-white shadow-md w-full">
        <div className="max-w-7xl mx-auto px-4 py-4 flex items-center justify-between">
          <div
            className="flex items-center gap-3 cursor-pointer"
            onClick={() => router.push("/")}
          >
            <h1 className="text-xl font-bold text-slate-800">InfoAI</h1>
            <span className="text-sm text-slate-500">Model: {currentModel}</span>
          </div>

          <div className="flex items-center gap-4">
            {userName ? (
              <>
                <span className="text-sm text-slate-700">Hello, {userName}</span>
                <button
                  onClick={handleSignOut}
                  className="px-3 py-1 text-sm text-red-600 border rounded hover:bg-red-50"
                >
                  Sign Out
                </button>
              </>
            ) : (
              <button
                onClick={() => router.push("/login")}
                className="px-3 py-1 text-sm text-blue-600 border rounded hover:bg-blue-50"
              >
                Sign In
              </button>
            )}
          </div>
        </div>
      </header>

      {/* Main content */}
      <main className="flex-1 w-full h-full px-4 sm:px-6 md:px-12 pb-2 pt-4 flex flex-col min-h-0">{children}</main>

      {/* Footer */}
      <footer className="w-full bg-white border-t py-4 text-center text-sm text-slate-500">
        &copy; {new Date().getFullYear()} InfoAI. All rights reserved.
      </footer>
    </div>
  );
}
