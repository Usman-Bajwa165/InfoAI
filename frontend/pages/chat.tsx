import { useEffect, useRef, useState } from "react";
import { io, Socket } from "socket.io-client";
import { useRouter } from "next/router";
import Layout from "./layout";

type Message = { id: string; who: "user" | "assistant"; text: string };

export default function Chat() {
  const router = useRouter();
  const [input, setInput] = useState("");
  const [mode, setMode] = useState("");
  const [instructionInput, setInstructionInput] = useState("");
  const [savedInstructions, setSavedInstructions] = useState<string | null>(
    null
  );
  const [messages, setMessages] = useState<Message[]>([]);
  const [connecting, setConnecting] = useState(true);
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [isThinking, setIsThinking] = useState(false);
  const socketRef = useRef<Socket | null>(null);
  const assistantBufferRef = useRef<string>("");
  const finalizeTimerRef = useRef<number | null>(null);
  const [guestQuotaExceeded, setGuestQuotaExceeded] = useState(false);
  const GUEST_DAILY_LIMIT = 10;

  const finalizeAssistantBuffer = () => {
    const buf = assistantBufferRef.current.trim();
    if (!buf) return;
    setMessages((prev) => [
      ...prev,
      { id: String(Date.now()), who: "assistant", text: buf },
    ]);
    assistantBufferRef.current = "";
  };

  const handleToken = (token: string) => {
    if (token.startsWith("Error:")) {
      finalizeAssistantBuffer();
      setMessages((prev) => [
        ...prev,
        { id: String(Date.now()), who: "assistant", text: token },
      ]);
      return;
    }

    assistantBufferRef.current +=
      (assistantBufferRef.current ? " " : "") + token;

    if (finalizeTimerRef.current) window.clearTimeout(finalizeTimerRef.current);
    finalizeTimerRef.current = window.setTimeout(() => {
      finalizeAssistantBuffer();
      finalizeTimerRef.current = null;
    }, 400);
  };

  useEffect(() => {
    // Check for OAuth token in URL (backend redirects to /chat?token=...)
    const urlToken =
      typeof window !== "undefined"
        ? new URLSearchParams(window.location.search).get("token")
        : null;
    if (urlToken) {
      // store token immediately so handshake will include it if socket connects afterwards
      localStorage.setItem("infoai_token", urlToken);
      // remove token from URL (clean)
      const newUrl = window.location.pathname;
      window.history.replaceState({}, "", newUrl);
    }

    // token used for initial handshake (either urlToken or stored token)
    const token = urlToken ?? localStorage.getItem("infoai_token");

    const s = io(
      process.env.NEXT_PUBLIC_API_WS_URL || "http://localhost:3000",
      {
        auth: { token },
        transports: ["websocket"],
      }
    );

    socketRef.current = s;

    s.on("connect", () => setConnecting(false));
    s.on("disconnect", () => setConnecting(true));

    // auth_result: server tells us if socket-level authentication succeeded
    s.on("auth_result", (data: any) => {
      if (data?.success) {
        setIsLoggedIn(true);
      } else {
        // auth failed (maybe token invalid or expired)
        setIsLoggedIn(false);
        // If there was a token from the URL (i.e. we just tried to log in), show popup and redirect to landing
        if (urlToken) {
          alert("Sign-in failed. Redirecting to landing page.");
          localStorage.removeItem("infoai_token");
          router.replace("/");
        }
      }
    });

    // INIT: receive user info, conversation & saved instructions
    s.on("init", (data: any) => {
      if (data?.user) {
        setIsLoggedIn(true);
      } else {
        setIsLoggedIn(false);
      }
      if (data?.instructions) setSavedInstructions(data.instructions);
      if (data?.conversation?.messages) {
        const msgs = data.conversation.messages.map((m: any) => ({
          id: m.id,
          who: m.role === "user" ? "user" : "assistant",
          text: m.content,
        }));
        setMessages(msgs);
      }
    });

    s.on("thinking", () => {
      setIsThinking(true);
    });

    s.on("token", (data: { token: string }) => {
      setIsThinking(false);
      handleToken(String(data.token));
    });

    s.on("done", () => {
      setIsThinking(false);
      finalizeAssistantBuffer();
    });

    s.on(
      "instructions_set",
      (data: { success: boolean; instructions?: string }) => {
        if (data?.success)
          setSavedInstructions(data.instructions || instructionInput);
      }
    );

    s.on("instructions_cleared", () => setSavedInstructions(null));

    // Guest quota event: server says quota exceeded
    s.on("guest_quota", (data: any) => {
      setGuestQuotaExceeded(true);
      // optional: show message
      alert(
        `Guest daily quota reached (${data.limit}). Please sign in to continue.`
      );
    });

    // In case we got urlToken and the socket connected without sending it in the handshake,
    // we still send authenticate explicitly (helps if socket connected before localStorage updated)
    if (urlToken) {
      s.emit("authenticate", urlToken);
    }
    // cleanup
    return () => {
      s.disconnect();
      socketRef.current = null;
    };
  }, []);

  const saveInstructions = () =>
    socketRef.current?.emit("set_instructions", instructionInput || "");
  const clearInstructions = () => {
    socketRef.current?.emit("clear_instructions");
    setInstructionInput("");
    setSavedInstructions(null);
  };
  const sendPrompt = () => {
    if (!input || !socketRef.current) return;

    // If guest and quota exceeded, block
    const token = localStorage.getItem("infoai_token");
    if (!token) {
      const key = "guest_prompt_count";
      const todayKey = `${key}_${new Date().toISOString().slice(0, 10)}`; // per-day key
      let count = Number(localStorage.getItem(todayKey) || 0);
      if (count >= GUEST_DAILY_LIMIT) {
        setGuestQuotaExceeded(true);
        alert("Guest daily quota reached. Please sign in to continue.");
        return;
      }
      count += 1;
      localStorage.setItem(todayKey, String(count));
    }

    setMessages((prev) => [
      ...prev,
      { id: String(Date.now()), who: "user", text: input },
    ]);
    assistantBufferRef.current = "";
    socketRef.current.emit("send_prompt", {
      text: input,
      mode: mode || undefined,
    });
    setInput("");
  };

  const logout = () => {
    localStorage.removeItem("infoai_token");
    setIsLoggedIn(false);
    socketRef.current?.disconnect();
    window.location.href = "/";
  };

  return (
    <Layout>
      <div className="max-w-7xl mx-auto grid grid-cols-1 md:grid-cols-3 gap-6">
        <aside className="md:col-span-1 bg-white p-4 rounded-lg shadow">
          <div className="mb-4">
            <label className="block text-sm font-medium text-slate-700">
              Mode
            </label>
            <select
              value={mode}
              onChange={(e) => setMode(e.target.value)}
              className="mt-1 block w-full rounded-md border p-2"
            >
              <option value="">General</option>
              <option value="Health">Health</option>
              <option value="Sports">Sports</option>
              <option value="Tech">Tech</option>
              <option value="News">News</option>
              <option value="Programming">Programming</option>
            </select>
          </div>

          <div className="mb-4">
            <label className="block text-sm font-medium text-slate-700">
              Custom instructions
            </label>
            <div className="flex gap-2 mt-2">
              <input
                value={instructionInput}
                onChange={(e) => setInstructionInput(e.target.value)}
                placeholder="E.g., Explain like I'm 5"
                className="flex-1 border rounded p-2"
              />
            </div>
            <div className="flex gap-2 mt-3">
              <button
                onClick={saveInstructions}
                className="bg-green-600 text-white px-3 py-1 rounded"
              >
                Save
              </button>
              <button
                onClick={clearInstructions}
                className="bg-gray-200 px-3 py-1 rounded"
              >
                Clear
              </button>
            </div>
            <div className="mt-3 text-sm text-slate-600">
              Active: <strong>{savedInstructions ?? "None"}</strong>
            </div>
          </div>
        </aside>

        <section className="md:col-span-2 flex flex-col h-[70vh]">
          <div className="flex-1 bg-white p-4 rounded-lg shadow overflow-y-auto">
            <div className="space-y-4">
              {messages.map((m) => (
                <div
                  key={m.id}
                  className={`flex ${
                    m.who === "user" ? "justify-end" : "justify-start"
                  }`}
                >
                  <div
                    className={`${
                      m.who === "user"
                        ? "bg-blue-600 text-white"
                        : "bg-slate-100 text-slate-800"
                    } max-w-[80%] p-3 rounded-lg`}
                  >
                    <div className="text-sm">{m.text}</div>
                  </div>
                </div>
              ))}
              {assistantBufferRef.current && (
                <div className="flex justify-start">
                  <div className="bg-slate-100 text-slate-800 max-w-[80%] p-3 rounded-lg">
                    <div className="text-sm">{assistantBufferRef.current}</div>
                  </div>
                </div>
              )}
            </div>
          </div>
          {isThinking && (
            <div className="text-sm text-slate-500 italic mb-2">
              Assistant is thinking…
            </div>
          )}

          <div className="mt-3 bg-white p-3 rounded-lg shadow flex items-start gap-3">
            <textarea
              value={input}
              onChange={(e) => setInput(e.target.value)}
              rows={2}
              placeholder={
                guestQuotaExceeded
                  ? "Guest daily quota reached — sign in to continue"
                  : "Type your message..."
              }
              className="flex-1 border rounded p-2 resize-none"
              disabled={guestQuotaExceeded}
            />
            <div className="flex flex-col gap-2">
              <button
                onClick={sendPrompt}
                className="bg-blue-600 text-white px-4 py-2 rounded"
                disabled={guestQuotaExceeded}
              >
                Send
              </button>
              <button
                onClick={() => setInput("")}
                className="bg-gray-100 px-3 py-2 rounded"
              >
                Clear
              </button>
            </div>
          </div>
        </section>
      </div>
    </Layout>
  );
}
