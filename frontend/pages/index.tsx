import { useEffect } from "react";
import { useRouter } from "next/router";
import Layout from "./layout";

export default function Index() {
  const router = useRouter();

  useEffect(() => {
    const token = typeof window !== "undefined" ? localStorage.getItem("infoai_token") : null;
    if (token) router.replace("/chat");
  }, [router]);

  return (
    <Layout>
      <div className="max-w-4xl mx-auto p-6">
        <div className="bg-white shadow-lg rounded-2xl p-8 flex flex-col md:flex-row gap-6 items-center">
          <div className="flex-1">
            <h1 className="text-4xl font-extrabold mb-4 text-slate-800">
              InfoAI — Your smart assistant
            </h1>
            <p className="text-slate-600 mb-6">
              Chat with a tuned Gemini model for general advice or domain-specific modes.
              Save personal instructions once and the assistant will remember them.
            </p>
            <div className="flex gap-3">
              <button
                onClick={() => router.push("/chat")}
                className="px-6 py-3 bg-blue-600 text-white rounded-lg font-medium shadow hover:bg-blue-700"
              >
                Start Chat
              </button>
              <button
                onClick={() => router.push("/login")}
                className="px-6 py-3 border border-slate-200 rounded-lg text-slate-700 hover:bg-slate-50"
              >
                Sign in / Sign up
              </button>
            </div>
          </div>
          <div className="w-full md:w-96 p-4 bg-slate-50 rounded-xl">
            <h3 className="text-lg font-semibold mb-2">Why InfoAI?</h3>
            <ul className="text-slate-600 space-y-2">
              <li>• Persistent custom instructions.</li>
              <li>• Mode-specific responses.</li>
              <li>• Streaming replies in real-time.</li>
            </ul>
          </div>
        </div>
      </div>
    </Layout>
  );
}
