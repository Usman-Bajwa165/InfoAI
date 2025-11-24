import { ReactNode, useEffect, useState } from "react";
import { useRouter } from "next/router";

interface LayoutProps {
  children: ReactNode;
}

export default function Layout({ children }: LayoutProps) {
  const router = useRouter();
  const [userName, setUserName] = useState<string | null>(null);

  useEffect(() => {
    // Check token / user info in localStorage
    const token = localStorage.getItem("infoai_token");
    if (token) {
      try {
        const payload = JSON.parse(atob(token.split(".")[1])); // decode JWT payload
        setUserName(payload?.name || "User");
      } catch {
        setUserName("User");
      }
    } else {
      setUserName(null);
    }
  }, []);

  const handleSignOut = () => {
    localStorage.removeItem("infoai_token");
    setUserName(null);
    router.push("/");
  };

  const currentModel = process.env.NEXT_PUBLIC_GEMINI_MODEL || "gemini-2.5-flash";

  return (
    <div className="flex flex-col min-h-screen w-full bg-slate-50">
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
      <main className="flex-1 w-full h-full px-4 sm:px-6 md:px-12 py-6">
        {children}
      </main>

      {/* Footer */}
      <footer className="w-full bg-white border-t py-4 text-center text-sm text-slate-500">
        &copy; {new Date().getFullYear()} InfoAI. All rights reserved.
      </footer>
    </div>
  );
}
