import { useEffect, useState } from "react";
import { useRouter } from "next/router";
import Layout from "./layout";
import { FaBrain, FaRocket, FaShieldAlt, FaCogs } from "react-icons/fa";

export default function Index() {
  const router = useRouter();
  const [loggedIn, setLoggedIn] = useState(false);

  useEffect(() => {
    const token = typeof window !== "undefined" ? localStorage.getItem("infoai_token") : null;
    if (token) {
      setLoggedIn(true);
      router.replace("/chat");
    }
  }, [router]);

  return (
    <Layout>
      <div className="flex flex-col min-h-[calc(100vh-100px)]"> {/* Adjust height for header/footer */}
        {/* Scrollable main content */}
        <div className="flex-1 overflow-y-auto bg-slate-50">
          {/* Hero Section */}
          <section className="max-w-6xl mx-auto p-6 flex flex-col md:flex-row items-center gap-6">
            <div className="flex-1">
              <h1 className="text-4xl md:text-5xl font-extrabold mb-4 text-slate-800">
                InfoAI — Your Intelligent Assistant
              </h1>
              <p className="text-base md:text-lg text-slate-600 mb-4">
                Solve problems, gain knowledge, and get personalized advice with a tuned Gemini AI model.
                Customize instructions once, and InfoAI will remember your preferences for every session.
              </p>
              <div className="flex flex-col sm:flex-row gap-3">
                <button
                  onClick={() => router.push("/chat")}
                  className="px-6 py-3 bg-blue-600 text-white rounded-lg font-semibold shadow hover:bg-blue-700 transition"
                >
                  Start Chat
                </button>
                {!loggedIn && (
                  <button
                    onClick={() => router.push("/login")}
                    className="px-6 py-3 border border-slate-300 rounded-lg text-slate-700 hover:bg-slate-100 transition"
                  >
                    Sign in / Sign up
                  </button>
                )}
              </div>
            </div>
            <div className="flex-1 p-4 bg-white rounded-xl shadow">
              <h3 className="text-xl font-semibold mb-3">Why Choose InfoAI?</h3>
              <ul className="space-y-2 text-slate-600 text-sm">
                <li className="flex items-center gap-2"><FaBrain className="text-blue-600"/> Persistent custom instructions</li>
                <li className="flex items-center gap-2"><FaRocket className="text-green-600"/> Fast streaming AI responses</li>
                <li className="flex items-center gap-2"><FaShieldAlt className="text-red-500"/> Reliable & safe suggestions</li>
                <li className="flex items-center gap-2"><FaCogs className="text-yellow-500"/> Mode-specific expertise</li>
              </ul>
            </div>
          </section>

          {/* Features Section */}
          <section className="max-w-6xl mx-auto p-6 mt-6 grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="bg-white rounded-xl p-4 shadow text-center">
              <FaBrain className="text-blue-600 text-3xl mx-auto mb-2"/>
              <h3 className="font-semibold mb-1">Intelligent Learning</h3>
              <p className="text-slate-600 text-sm">InfoAI adapts to your instructions for precise guidance.Learn user behaviour and respond.</p>
            </div>
            <div className="bg-white rounded-xl p-4 shadow text-center">
              <FaRocket className="text-green-600 text-3xl mx-auto mb-2"/>
              <h3 className="font-semibold mb-1">Fast & Real-time</h3>
              <p className="text-slate-600 text-sm">Get instant answers with smooth streaming responses.Keep chat history continues it.</p>
            </div>
            <div className="bg-white rounded-xl p-4 shadow text-center">
              <FaCogs className="text-yellow-500 text-3xl mx-auto mb-2"/>
              <h3 className="font-semibold mb-1">Custom Modes</h3>
              <p className="text-slate-600 text-sm">Health, Programming, Tech, News, or Sports — tailored advice.Answer creatively.</p>
            </div>
          </section>
        </div>

        {/* Fixed CTA / Start Chat Section */}
        <div className="bg-slate-50 p-6 shadow-inner border-t">
          <div className="max-w-6xl mx-auto text-center">
            <button
              onClick={() => router.push("/chat")}
              className="px-8 py-3 bg-blue-600 text-white rounded-lg font-semibold shadow hover:bg-blue-700 transition"
            >
              Start Chat Now
            </button>
          </div>
        </div>
      </div>
    </Layout>
  );
}
