'use client';

import { useState, useRef, useEffect } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import type { User } from '@supabase/supabase-js';
import ReactMarkdown, { type Components } from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { createClient } from '@/lib/supabase/client';

type Message = {
  role: 'user' | 'bot';
  text: string;
};

export default function Home() {
  const router = useRouter();
  const supabase = createClient();

  const [user, setUser] = useState<User | null>(null);
  const [checkingAuth, setCheckingAuth] = useState(true);

  const [messages, setMessages] = useState<Message[]>([]);
  const [loadingHistory, setLoadingHistory] = useState(false);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let active = true;
    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!active) return;
      if (!user) {
        router.replace('/login');
        return;
      }
      setUser(user);
      setCheckingAuth(false);
      setLoadingHistory(true);
      try {
        const res = await fetch('/api/history', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ user_id: user.id }),
        });
        if (!active) return;
        if (res.ok) {
          const data = await res.json();
          if (Array.isArray(data?.messages)) {
            setMessages(data.messages as Message[]);
          }
        }
      } catch {
        // Geçmiş yüklenemezse sessizce boş başla.
      } finally {
        if (active) setLoadingHistory(false);
      }
    })();
    return () => {
      active = false;
    };
  }, [router, supabase]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  async function sendMessage() {
    if (!input.trim() || loading || !user) return;

    const userMsg = input.trim();
    const firstName = user.email ? user.email.split('@')[0] : 'kullanici';

    setInput('');
    setMessages((prev) => [...prev, { role: 'user', text: userMsg }]);
    setLoading(true);

    try {
      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          user_id: user.id,
          first_name: firstName,
          message: userMsg,
        }),
      });

      const data = await res.json();
      const reply = data.reply || 'Bir hata oluştu, tekrar dener misin?';
      setMessages((prev) => [...prev, { role: 'bot', text: reply }]);
    } catch {
      setMessages((prev) => [
        ...prev,
        { role: 'bot', text: 'Bağlantı hatası. Tekrar dene.' },
      ]);
    } finally {
      setLoading(false);
    }
  }

  async function handleLogout() {
    await supabase.auth.signOut();
    router.replace('/login');
    router.refresh();
  }

  if (checkingAuth) {
    return (
      <div className="flex items-center justify-center h-screen bg-gray-50 text-gray-500">
        Yükleniyor...
      </div>
    );
  }

  return (
    <div className="flex flex-col h-screen max-w-2xl mx-auto bg-gray-50">
      {/* Header */}
      <header className="bg-blue-600 text-white p-4 shadow flex items-center justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-xl font-bold">Nircen — İngilizce Öğretmenin</h1>
          <p className="text-sm text-blue-100 truncate">{user?.email}</p>
        </div>
        <div className="shrink-0 flex items-center gap-2">
          <Link
            href="/dashboard"
            className="text-sm bg-blue-700 hover:bg-blue-800 rounded-full px-3 py-1.5"
          >
            📊 Dashboard
          </Link>
          <Link
            href="/test"
            className="text-sm bg-blue-700 hover:bg-blue-800 rounded-full px-3 py-1.5"
          >
            Test
          </Link>
          <button
            onClick={handleLogout}
            className="text-sm bg-blue-700 hover:bg-blue-800 rounded-full px-3 py-1.5"
          >
            Çıkış
          </button>
        </div>
      </header>

      {/* Mesajlar */}
      <div className="flex-1 overflow-y-auto p-4 space-y-3">
        {loadingHistory && (
          <div className="text-center text-gray-400 mt-10">
            Geçmiş yükleniyor...
          </div>
        )}
        {!loadingHistory && messages.length === 0 && (
          <div className="text-center text-gray-400 mt-10">
            Bir şeyler yazarak başla. Örnek: &quot;I goed to school yesterday&quot;
          </div>
        )}
        {messages.map((msg, i) => (
          <div
            key={i}
            className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
          >
            <div
              className={`max-w-[80%] rounded-2xl px-4 py-2 ${
                msg.role === 'user'
                  ? 'bg-blue-600 text-white whitespace-pre-wrap'
                  : 'bg-white text-gray-800 shadow'
              }`}
            >
              {msg.role === 'user' ? (
                msg.text
              ) : (
                <ReactMarkdown
                  remarkPlugins={[remarkGfm]}
                  components={markdownComponents}
                >
                  {msg.text}
                </ReactMarkdown>
              )}
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

const markdownComponents: Components = {
  p: ({ children }) => (
    <p className="my-2 first:mt-0 last:mb-0 leading-relaxed">{children}</p>
  ),
  strong: ({ children }) => <strong className="font-semibold">{children}</strong>,
  em: ({ children }) => <em className="italic">{children}</em>,
  ul: ({ children }) => (
    <ul className="list-disc list-inside ml-2 my-2 space-y-0.5">{children}</ul>
  ),
  ol: ({ children }) => (
    <ol className="list-decimal list-inside ml-2 my-2 space-y-0.5">{children}</ol>
  ),
  li: ({ children }) => <li className="leading-relaxed">{children}</li>,
  h1: ({ children }) => (
    <h1 className="text-lg font-bold mt-3 mb-2 first:mt-0">{children}</h1>
  ),
  h2: ({ children }) => (
    <h2 className="text-base font-bold mt-3 mb-2 first:mt-0">{children}</h2>
  ),
  h3: ({ children }) => (
    <h3 className="text-sm font-bold mt-2 mb-1 first:mt-0">{children}</h3>
  ),
  a: ({ href, children }) => (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className="text-blue-600 underline hover:text-blue-800"
    >
      {children}
    </a>
  ),
  blockquote: ({ children }) => (
    <blockquote className="border-l-2 border-gray-300 pl-3 italic my-2 text-gray-700">
      {children}
    </blockquote>
  ),
  hr: () => <hr className="my-3 border-gray-200" />,
  code: ({ className, children, ...props }) => {
    const isBlock = /language-/.test(className ?? '');
    if (isBlock) {
      return (
        <code className={`${className ?? ''} font-mono text-sm`} {...props}>
          {children}
        </code>
      );
    }
    return (
      <code
        className="bg-gray-100 px-1 py-0.5 rounded text-sm font-mono"
        {...props}
      >
        {children}
      </code>
    );
  },
  pre: ({ children }) => (
    <pre className="bg-gray-900 text-gray-100 p-3 rounded my-2 overflow-x-auto text-sm">
      {children}
    </pre>
  ),
  table: ({ children }) => (
    <div className="overflow-x-auto my-2">
      <table className="w-full text-sm border-collapse">{children}</table>
    </div>
  ),
  thead: ({ children }) => <thead>{children}</thead>,
  th: ({ children }) => (
    <th className="text-left font-semibold border-b border-gray-300 px-2 py-1">
      {children}
    </th>
  ),
  td: ({ children }) => (
    <td className="border-b border-gray-100 px-2 py-1 align-top">{children}</td>
  ),
};
