// frontend/pages/chat.tsx
import { useEffect, useRef, useState } from "react";
import { io, Socket } from "socket.io-client";
import { useRouter } from "next/router";
import Layout from "./layout";

type Message = { id: string; who: "user" | "assistant"; text: string };
type Instruction = { id: string; text: string };

const MODE_CONFIG: Record<
  string,
  { temperature: number; maxOutputTokens: number }
> = {
  "": { temperature: 0.7, maxOutputTokens: 1700 },
  general: { temperature: 0.7, maxOutputTokens: 1700 },
  Health: { temperature: 1.2, maxOutputTokens: 2200 },
  Sports: { temperature: 0.8, maxOutputTokens: 1500 },
  Tech: { temperature: 0.9, maxOutputTokens: 2500 },
  News: { temperature: 0.6, maxOutputTokens: 1500 },
  Programming: { temperature: 1.5, maxOutputTokens: 3500 },
};

export default function Chat() {
  const router = useRouter();
  const [input, setInput] = useState("");
  const [mode, setMode] = useState("");
  const [instructionInput, setInstructionInput] = useState("");
  const [savedInstructions, setSavedInstructions] = useState<Instruction[]>([]);
  const [editingInstructionId, setEditingInstructionId] = useState<
    string | null
  >(null);

  const [messages, setMessages] = useState<Message[]>([]);
  const [connecting, setConnecting] = useState(true);
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [isThinking, setIsThinking] = useState(false);
  const [guestQuotaExceeded, setGuestQuotaExceeded] = useState(false);

  const socketRef = useRef<Socket | null>(null);
  const assistantBufferRef = useRef<string>("");
  const finalizeTimerRef = useRef<number | null>(null);

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
    const el = document.querySelector("textarea");
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 160)}px`;
  }, [input]);

  useEffect(() => {
    // OAuth token in URL handling (same as before)
    const urlToken =
      typeof window !== "undefined"
        ? new URLSearchParams(window.location.search).get("token")
        : null;
    if (urlToken) {
      localStorage.setItem("infoai_token", urlToken);
      const newUrl = window.location.pathname;
      window.history.replaceState({}, "", newUrl);
    }

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

    s.on("auth_result", (data: any) => {
      if (data?.success) setIsLoggedIn(true);
      else {
        setIsLoggedIn(false);
        if (urlToken) {
          alert("Sign-in failed. Redirecting to landing page.");
          localStorage.removeItem("infoai_token");
          router.replace("/");
        }
      }
    });

    s.on("init", (data: any) => {
      setIsLoggedIn(!!data?.user);
      if (data?.user) {
        // persist user locally so layout + other pages can read it immediately
        try {
          localStorage.setItem("infoai_user", JSON.stringify(data.user));
          // inform same-window listeners (layout) that user changed
          window.dispatchEvent(new Event("infoai_user_changed"));
        } catch (e) {
          // ignore
        }
      } else {
        // make sure user key removed when server says no user
        localStorage.removeItem("infoai_user");
        window.dispatchEvent(new Event("infoai_user_changed"));
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

    s.on("thinking", () => setIsThinking(true));
    s.on("token", (data: { token: string }) => {
      setIsThinking(false);
      handleToken(String(data.token));
    });
    s.on("done", () => {
      setIsThinking(false);
      finalizeAssistantBuffer();
    });

    s.on("instruction_added", (data: any) => {
      if (data?.success && data.instruction) {
        setSavedInstructions((prev) => [...prev, data.instruction]);
        setInstructionInput("");
        setEditingInstructionId(null);
      }
    });
    s.on("instruction_updated", (data: any) => {
      if (data?.success && data.instruction) {
        setSavedInstructions((prev) =>
          prev.map((i) => (i.id === data.instruction.id ? data.instruction : i))
        );
        setInstructionInput("");
        setEditingInstructionId(null);
      }
    });
    s.on("instruction_deleted", (data: any) => {
      if (data?.success) {
        setSavedInstructions((prev) => prev.filter((i) => i.id !== data.id));
      }
    });

    s.on("instructions_set", (d) => {
      // backward compat - not used typically now
      if (d?.instructions) setSavedInstructions(d.instructions);
    });

    s.on("instructions_cleared", () => {
      // backward compat - not used typically now
      setSavedInstructions([]);
    });

    s.on("guest_quota", (data: any) => {
      setGuestQuotaExceeded(true);
      alert(
        `Guest daily quota reached (${data.limit}). Please sign in to continue.`
      );
    });

    // if urlToken present, also emit authenticate in case the handshake didn't have it
    if (urlToken) {
      s.emit("authenticate", urlToken);
    }

    return () => {
      s.disconnect();
      socketRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Helper to render markdown bold (**text**) as HTML <strong>
  const escapeHtml = (str: string) =>
    str.replace(
      /[&<>"'`=\/]/g,
      (s) =>
        ((
          {
            "&": "&amp;",
            "<": "&lt;",
            ">": "&gt;",
            '"': "&quot;",
            "'": "&#39;",
            "/": "&#x2F;",
            "`": "&#x60;",
            "=": "&#x3D;",
          } as any
        )[s])
    );

  const renderMessage = (text: string) => {
    const escaped = escapeHtml(text ?? "");
    // support **bold** and __bold__ across lines
    const withStrong = escaped
      .replace(/\*\*([\s\S]+?)\*\*/g, "<strong>$1</strong>")
      .replace(/__([\s\S]+?)__/g, "<strong>$1</strong>");
    // optional: support *em* -> <em>
    const withEm = withStrong.replace(/\*([\s\S]+?)\*/g, "<em>$1</em>");
    return { __html: withEm };
  };

  const saveInstructions = () => {
    const s = socketRef.current;
    if (!s) return;
    // if editing, call edit_instruction
    if (editingInstructionId) {
      s.emit("edit_instruction", {
        id: editingInstructionId,
        text: instructionInput,
      });
      return;
    }
    // else add
    if (instructionInput.trim())
      s.emit("add_instruction", instructionInput.trim());
  };

  const startEditInstruction = (ins: Instruction) => {
    setEditingInstructionId(ins.id);
    setInstructionInput(ins.text);
  };

  const deleteInstruction = (id: string) => {
    if (!socketRef.current) return;
    if (!confirm("Delete this instruction?")) return;
    socketRef.current.emit("delete_instruction", id);
  };

  const clearInstructionField = () => {
    // only clears input field, does NOT delete persisted instructions
    setInstructionInput("");
    setEditingInstructionId(null);
  };

  const sendPrompt = () => {
    if (!input || !socketRef.current) return;

    // client-side guest daily limit UX
    const token = localStorage.getItem("infoai_token");
    if (!token) {
      const todayKey = `guest_prompt_count_${new Date()
        .toISOString()
        .slice(0, 10)}`;
      let count = Number(localStorage.getItem(todayKey) || 0);
      if (count >= 10) {
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

  // show current mode config in UI
  const currentModeConfig = MODE_CONFIG[mode] ?? MODE_CONFIG["general"];

  return (
    <Layout>
      <div className="max-w-7xl mx-auto p-4 grid grid-cols-1 md:grid-cols-3 gap-4" style={{marginLeft:-50,marginTop:-25}}>
        <aside className="md:col-span-1 bg-white p-4 rounded-xl shadow-md border border-slate-200 h-[80vh] flex flex-col">
          {/* Mode Section */}
          <div>
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

            <div className="mt-2 text-xs text-slate-600">
              Temp: <strong>{currentModeConfig.temperature}</strong> · Max
              tokens: <strong>{currentModeConfig.maxOutputTokens}</strong>
            </div>
          </div>

          {/* Instructions Section (scrollable) */}
          <div className="mt-6 flex-1 flex flex-col overflow-hidden">
            <label className="block text-sm font-medium text-slate-700">
              Custom instructions
            </label>

            <div className="flex gap-2 mt-2">
              <input
                value={instructionInput}
                onChange={(e) => setInstructionInput(e.target.value)}
                placeholder="Add an instruction..."
                className="flex-1 border rounded p-2"
              />
            </div>

            <div className="flex gap-2 mt-3">
              <button
                onClick={saveInstructions}
                className="bg-green-600 text-white px-3 py-1 rounded"
                disabled={!instructionInput.trim()}
              >
                {editingInstructionId ? "Save edit" : "Add"}
              </button>

              <button
                onClick={clearInstructionField}
                className="bg-gray-200 px-3 py-1 rounded"
              >
                Clear
              </button>
            </div>

            {/* Scrollable saved instructions list */}
            <div className="mt-3 text-sm text-slate-600 overflow-y-auto pr-2 custom-scroll flex-1">
              Saved instructions:
              <ul className="space-y-2 mt-2">
                {savedInstructions.length === 0 && (
                  <li className="text-xs text-slate-400">
                    No saved instructions
                  </li>
                )}

                {savedInstructions.map((ins) => (
                  <li
                    key={ins.id}
                    className="flex items-center justify-between gap-2"
                  >
                    <div className="text-sm text-slate-800">{ins.text}</div>
                    <div className="flex gap-2">
                      <button
                        onClick={() => startEditInstruction(ins)}
                        className="text-sm text-blue-600"
                      >
                        Edit
                      </button>
                      <button
                        onClick={() => deleteInstruction(ins.id)}
                        className="text-sm text-red-600"
                      >
                        Delete
                      </button>
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </aside>

        <section className="md:col-span-2 flex flex-col h-[70vh]" style={{marginRight:-250}}>
          <div className="flex-1 bg-white p-4 rounded-xl shadow-md border border-slate-200 overflow-y-auto custom-scroll">
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
                    {/* render message with bold support */}
                    <div
                      className="text-sm"
                      dangerouslySetInnerHTML={renderMessage(m.text)}
                    />
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

          <div className="mt-3 bg-white p-3 rounded-lg shadow flex items-start gap-3" style={{marginBottom:-60}}>
            <textarea
              value={input}
              onChange={(e) => setInput(e.target.value)}
              rows={1}
              placeholder={
                guestQuotaExceeded
                  ? "Guest daily quota reached — sign in to continue"
                  : "Type your message..."
              }
              className="w-full border rounded-lg p-3 resize-none overflow-y-auto max-h-25"
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
