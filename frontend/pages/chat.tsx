import { useEffect, useRef, useState } from 'react';
import { io, Socket } from 'socket.io-client';

export default function Chat() {
  const [input, setInput] = useState('');
  const [mode, setMode] = useState(''); // empty => general
  const [instructionInput, setInstructionInput] = useState('');
  const [savedInstructions, setSavedInstructions] = useState<string | null>(null);
  const [messages, setMessages] = useState<string[]>([]);

  const socketRef = useRef<Socket | null>(null);

  useEffect(() => {
    const s = io(process.env.NEXT_PUBLIC_API_WS_URL || 'http://localhost:3000');
    socketRef.current = s;

    s.on('token', (data: { token: string }) => {
      setMessages((prev) => [...prev, data.token]);
    });

    s.on('instructions_set', (data: { success: boolean; instructions?: string }) => {
      if (data?.success) setSavedInstructions(data.instructions || instructionInput);
    });

    s.on('instructions_cleared', () => {
      setSavedInstructions(null);
    });

    return () => {
      s.disconnect();
      socketRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const saveInstructions = () => {
    if (!socketRef.current) return;
    socketRef.current.emit('set_instructions', instructionInput || '');
  };

  const clearInstructions = () => {
    if (!socketRef.current) return;
    socketRef.current.emit('clear_instructions');
    setInstructionInput('');
  };

  const sendPrompt = () => {
    if (!input || !socketRef.current) return;
    socketRef.current.emit('send_prompt', { text: input, mode: mode || undefined });
    setInput('');
    // do NOT clear savedInstructions - they are persistent until cleared explicitly
  };

  return (
    <div className="p-4 max-w-xl mx-auto">
      <div className="mb-4 flex flex-col gap-2">
        <div>
          <label className="mr-2">Mode:</label>
          <select
            value={mode}
            onChange={(e) => {
              const selectedMode = e.target.value;
              setMode(selectedMode);
            }}
            className="border p-1 rounded"
          >
            <option value="">General</option>
            <option value="Health">Health</option>
            <option value="Sports">Sports</option>
            <option value="Tech">Tech</option>
            <option value="News">News</option>
            <option value="Programming">Programming</option>
          </select>
        </div>

        <div>
          <label className="mr-2">Set Custom Instructions (applies to all prompts):</label>
          <div className="flex gap-2 mt-1">
            <input
              className="border p-1 rounded flex-1"
              placeholder="E.g., Explain like I'm 5"
              value={instructionInput}
              onChange={(e) => setInstructionInput(e.target.value)}
            />
            <button className="bg-green-600 text-white px-3 rounded" onClick={saveInstructions}>
              Save
            </button>
            <button className="bg-gray-400 text-white px-3 rounded" onClick={clearInstructions}>
              Clear
            </button>
          </div>
          <div className="text-sm mt-2">
            Active instructions: <strong>{savedInstructions ?? 'None'}</strong>
          </div>
        </div>
      </div>

      <div className="border p-4 h-96 overflow-y-auto mb-4">
        {messages.join(' ')}
      </div>

      <div className="flex">
        <input
          className="flex-1 border p-2 rounded-l"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Type your question..."
        />
        <button className="bg-blue-600 text-white px-4 rounded-r" onClick={sendPrompt}>
          Send
        </button>
      </div>
    </div>
  );
}
