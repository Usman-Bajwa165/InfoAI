import { useEffect } from "react";
import { useRouter } from "next/router";
import Layout from "./layout";

export default function Login() {
  const router = useRouter();
  const API = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3000";

  useEffect(() => {
    const token = localStorage.getItem("infoai_token");
    if (token) router.replace("/chat");
  }, [router]);

  return (
    <Layout>
      <div className="flex justify-center">
        <div className="w-full max-w-md p-8 bg-white rounded-2xl shadow-lg">
          <div className="text-center mb-6">
            <h1 className="text-2xl font-bold text-slate-800">Welcome to InfoAI</h1>
            <p className="text-sm text-slate-500 mt-2">
              Sign in to save your preferences and get personalized chat.
            </p>
          </div>

          <div className="space-y-4">
            <a
              href={`${API}/auth/google`}
              className="w-full inline-flex items-center justify-center gap-3 px-4 py-3 rounded-lg border hover:shadow-sm transition bg-white"
            >
              <img src="https://developers.google.com/identity/images/g-logo.png" alt="Google" className="w-5 h-5" />
              <span className="font-medium">Continue with Google</span>
            </a>

            <a
              href={`${API}/auth/github`}
              className="w-full inline-flex items-center justify-center gap-3 px-4 py-3 rounded-lg border hover:shadow-sm transition bg-white"
            >
              <img src="https://github.githubassets.com/images/modules/logos_page/GitHub-Mark.png" alt="GitHub" className="w-5 h-5" />
              <span className="font-medium">Continue with GitHub</span>
            </a>

            <div className="text-center text-sm text-slate-500 mt-4">
              By signing in you agree to our terms.
            </div>
          </div>

          <div className="mt-6 text-center">
            <button
              onClick={() => router.push("/")}
              className="text-sm text-slate-600 hover:underline"
            >
              Back to landing
            </button>
          </div>
        </div>
      </div>
    </Layout>
  );
}
