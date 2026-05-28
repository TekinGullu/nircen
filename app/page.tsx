'use client';

import { useState, useRef, useEffect } from 'react';

type Message = {
  role: 'user' | 'bot';
  text: string;
};

export default function Home() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);

  // Geçici kullanıcı (sonra Supabase Auth ile değişecek)
  const userId = 'web-tekin-001';
  const firstName = 'Tekin';

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  async function sendMessage() {
    if (!input.trim() || loading) return;

    const userMsg = input.trim();
    setInput('');
    setMessages((prev) => [...prev, { role: 'user', text: userMsg }]);
    setLoading(true);

    try {
      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          user_id: userId,
          first_name: firstName,
          message: userMsg,
        }),
      });

      const data = await res.json();
      const reply = data.reply || 'Bir hata oluştu, tekrar dener misin?';
      setMessages((prev) => [...prev, { role: 'bot', text: reply }]);
    } catch (error) {
      setMessages((prev) => [
        ...prev,
        { role: 'bot', text: 'Bağlantı hatası. Tekrar dene.' },
      ]);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex flex-col h-screen max-w-2xl mx-auto bg-gray-50">
      {/* Header */}
      <header className="bg-blue-600 text-white p-4 shadow">
        <h1 className="text-xl font-bold">Nircen — İngilizce Öğretmenin</h1>
        <p className="text-sm text-blue-100">İngilizce yaz, hatalarını düzeltsin</p>
      </header>

      {/* Mesajlar */}
      <div className="flex-1 overflow-y-auto p-4 space-y-3">
        {messages.length === 0 && (
          <div className="text-center text-gray-400 mt-10">
            Bir şeyler yazarak başla. Örnek: "I goed to school yesterday"
          </div>
        )}
        {messages.map((msg, i) => (
          <div
            key={i}
            className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
          >
            <div
              className={`max-w-[80%] rounded-2xl px-4 py-2 whitespace-pre-wrap ${
                msg.role === 'user'
                  ? 'bg-blue-600 text-white'
                  : 'bg-white text-gray-800 shadow'
              }`}
            >
              {msg.text}
            </div>
          </div>
        ))}
        {loading && (
          <div className="flex justify-start">
            <div className="bg-white text-gray-400 rounded-2xl px-4 py-2 shadow">
              Düşünüyor...
            </div>
          </div>
        )}
        <div ref={bottomRef} />
      </div>

      {/* Giriş */}
      <div className="p-4 bg-white border-t flex gap-2">
        <input
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && sendMessage()}
          placeholder="Mesajını yaz..."
          className="flex-1 border rounded-full px-4 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
          disabled={loading}
        />
        <button
          onClick={sendMessage}
          disabled={loading}
          className="bg-blue-600 text-white rounded-full px-6 py-2 font-medium disabled:opacity-50"
        >
          Gönder
        </button>
      </div>
    </div>
  );
}