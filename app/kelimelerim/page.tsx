'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import type { User } from '@supabase/supabase-js';
import { createClient } from '@/lib/supabase/client';

type WordStatus = 'mastered' | 'learning' | 'unknown';

interface VocabWord {
  word_id: number;
  word: string;
  meaning_tr: string | null;
  example_sentence: string | null;
  cefr_level: string | null;
  mastery_score: number | null;
  status: string;
  source: string;
}

type FilterKey = 'all' | WordStatus;

const BATCH_SIZE = 20;

const STATUS_META: Record<WordStatus, {
  label: string;
  emoji: string;
  pill: string;
  border: string;
  cardBg: string;
}> = {
  mastered: {
    label: 'Öğrenildi',
    emoji: '✓',
    pill: 'bg-green-100 text-green-800',
    border: 'border-l-green-500',
    cardBg: 'bg-green-50/40',
  },
  learning: {
    label: 'Öğreniliyor',
    emoji: '📖',
    pill: 'bg-blue-100 text-blue-800',
    border: 'border-l-blue-500',
    cardBg: 'bg-white',
  },
  unknown: {
    label: 'Bilinmiyor',
    emoji: '❓',
    pill: 'bg-gray-200 text-gray-700',
    border: 'border-l-gray-400',
    cardBg: 'bg-white',
  },
};

const FILTERS: { key: FilterKey; label: string }[] = [
  { key: 'all', label: 'Hepsi' },
  { key: 'learning', label: '📖 Öğreniliyor' },
  { key: 'mastered', label: '✓ Öğrenildi' },
  { key: 'unknown', label: '❓ Bilinmiyor' },
];

function normalizeStatus(s: string): WordStatus {
  if (s === 'mastered' || s === 'learning' || s === 'unknown') return s;
  return 'unknown';
}

export default function KelimelerimPage() {
  const router = useRouter();
  const supabase = createClient();

  const [user, setUser] = useState<User | null>(null);
  const [checkingAuth, setCheckingAuth] = useState(true);

  const [words, setWords] = useState<VocabWord[]>([]);
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Optimistic status overrides (key: word_id, value: new status)
  const [statusOverrides, setStatusOverrides] = useState<
    Record<number, WordStatus>
  >({});
  const [pendingIds, setPendingIds] = useState<Set<number>>(new Set());

  const [filter, setFilter] = useState<FilterKey>('all');

  useEffect(() => {
    let active = true;
    (async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!active) return;
      if (!user) {
        router.replace('/login');
        return;
      }
      setUser(user);
      setCheckingAuth(false);
      void loadWords(user.id);
    })();
    return () => {
      active = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [router, supabase]);

  async function loadWords(userId: string) {
    setLoading(true);
    setErrorMsg(null);
    try {
      const res = await fetch('/api/vocabulary/words', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ user_id: userId, count: BATCH_SIZE }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => null);
        const detail = body?.error
          ? `${body.error}${body.status ? ` (${body.status})` : ''}`
          : '';
        setErrorMsg(
          `Kelimeler alınamadı. Tekrar dene.${detail ? ` — ${detail}` : ''}`
        );
        return;
      }
      const data = (await res.json()) as { words?: VocabWord[] };
      setWords(Array.isArray(data?.words) ? data.words : []);
      setStatusOverrides({});
    } catch {
      setErrorMsg('Bağlantı hatası. Tekrar dene.');
    } finally {
      setLoading(false);
    }
  }

  async function changeStatus(
    word: VocabWord,
    targetStatus: WordStatus,
    endpoint: '/api/vocabulary/mark-known' | '/api/vocabulary/mark-unknown'
  ) {
    if (!user) return;
    if (pendingIds.has(word.word_id)) return;

    const previous: WordStatus =
      statusOverrides[word.word_id] ?? normalizeStatus(word.status);
    if (previous === targetStatus) return;

    setPendingIds((prev) => {
      const next = new Set(prev);
      next.add(word.word_id);
      return next;
    });
    setStatusOverrides((prev) => ({ ...prev, [word.word_id]: targetStatus }));
    setErrorMsg(null);

    try {
      const res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ user_id: user.id, word_id: word.word_id }),
      });
      if (!res.ok) {
        setStatusOverrides((prev) => ({ ...prev, [word.word_id]: previous }));
        const body = await res.json().catch(() => null);
        const detail = body?.error
          ? `${body.error}${body.status ? ` (${body.status})` : ''}`
          : '';
        setErrorMsg(
          `Durum güncellenemedi. Tekrar dene.${detail ? ` — ${detail}` : ''}`
        );
        return;
      }
      const data = (await res.json().catch(() => null)) as
        | { status?: string }
        | null;
      if (data?.status) {
        setStatusOverrides((prev) => ({
          ...prev,
          [word.word_id]: normalizeStatus(data.status as string),
        }));
      }
    } catch {
      setStatusOverrides((prev) => ({ ...prev, [word.word_id]: previous }));
      setErrorMsg('Bağlantı hatası. Tekrar dene.');
    } finally {
      setPendingIds((prev) => {
        const next = new Set(prev);
        next.delete(word.word_id);
        return next;
      });
    }
  }

  const effectiveStatus = (w: VocabWord): WordStatus =>
    statusOverrides[w.word_id] ?? normalizeStatus(w.status);

  const counts = useMemo(() => {
    const c: Record<FilterKey, number> = {
      all: words.length,
      mastered: 0,
      learning: 0,
      unknown: 0,
    };
    for (const w of words) c[effectiveStatus(w)]++;
    return c;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [words, statusOverrides]);

  const visibleWords = useMemo(() => {
    if (filter === 'all') return words;
    return words.filter((w) => effectiveStatus(w) === filter);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [words, statusOverrides, filter]);

  if (checkingAuth) {
    return (
      <div className="flex items-center justify-center h-screen bg-gray-50 text-gray-500">
        Yükleniyor...
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="sticky top-0 z-10 bg-blue-600 text-white shadow">
        <div className="max-w-3xl mx-auto p-4 flex items-center justify-between gap-3">
          <div className="min-w-0">
            <h1 className="text-xl font-bold">📚 Kelimelerim</h1>
            <p className="text-sm text-blue-100 truncate">{user?.email}</p>
          </div>
          <div className="shrink-0 flex items-center gap-2">
            <Link
              href="/"
              className="text-sm bg-blue-700 hover:bg-blue-800 rounded-full px-3 py-1.5"
            >
              ← Sohbete dön
            </Link>
          </div>
        </div>
      </header>

      <main className="max-w-3xl mx-auto p-4 space-y-4">
        {errorMsg && (
          <div className="rounded-lg border border-red-200 bg-red-50 text-red-700 px-4 py-3 text-sm">
            {errorMsg}
          </div>
        )}

        <div className="flex items-center justify-between gap-3 flex-wrap">
          <p className="text-sm text-gray-600">
            Bildiklerini öğrenildi, henüz bilmediklerini öğreniliyor olarak işaretle.
          </p>
          <button
            type="button"
            onClick={() => user && loadWords(user.id)}
            disabled={loading}
            className="shrink-0 text-sm bg-white border border-gray-300 hover:border-blue-400 rounded-full px-3 py-1.5 disabled:opacity-50 flex items-center gap-2"
          >
            {loading ? (
              <>
                <Spinner /> Yükleniyor...
              </>
            ) : (
              <>🔄 Yeni kelimeler getir</>
            )}
          </button>
        </div>

        {/* Status filter tabs */}
        <div className="flex gap-2 overflow-x-auto -mx-1 px-1 pb-1">
          {FILTERS.map((f) => {
            const active = filter === f.key;
            return (
              <button
                key={f.key}
                type="button"
                onClick={() => setFilter(f.key)}
                className={`shrink-0 text-sm rounded-full px-3 py-1.5 border transition ${
                  active
                    ? 'bg-blue-600 text-white border-blue-600'
                    : 'bg-white text-gray-700 border-gray-300 hover:border-blue-400'
                }`}
              >
                {f.label}{' '}
                <span
                  className={`tabular-nums ${
                    active ? 'text-blue-100' : 'text-gray-400'
                  }`}
                >
                  ({counts[f.key]})
                </span>
              </button>
            );
          })}
        </div>

        {loading && words.length === 0 && <WordListSkeleton />}

        {!loading && words.length === 0 && !errorMsg && (
          <div className="bg-white rounded-2xl shadow p-6 text-center text-sm text-gray-500">
            Şu anda gösterilecek kelime yok.
          </div>
        )}

        {!loading && words.length > 0 && visibleWords.length === 0 && (
          <div className="bg-white rounded-2xl shadow p-6 text-center text-sm text-gray-500">
            Bu filtrede kelime yok.
          </div>
        )}

        <div className="space-y-3">
          {visibleWords.map((w) => (
            <WordCard
              key={w.word_id}
              word={w}
              status={effectiveStatus(w)}
              pending={pendingIds.has(w.word_id)}
              onMarkKnown={() =>
                changeStatus(w, 'mastered', '/api/vocabulary/mark-known')
              }
              onMarkUnknown={() =>
                changeStatus(w, 'learning', '/api/vocabulary/mark-unknown')
              }
            />
          ))}
        </div>
      </main>
    </div>
  );
}

function WordCard({
  word,
  status,
  pending,
  onMarkKnown,
  onMarkUnknown,
}: {
  word: VocabWord;
  status: WordStatus;
  pending: boolean;
  onMarkKnown: () => void;
  onMarkUnknown: () => void;
}) {
  const meta = STATUS_META[status];

  return (
    <div
      className={`rounded-2xl shadow p-4 space-y-3 border-l-4 ${meta.border} ${meta.cardBg}`}
    >
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div className="min-w-0 space-y-1">
          <div className="flex items-baseline gap-2 flex-wrap">
            <div className="text-xl font-bold text-gray-900">{word.word}</div>
            {word.cefr_level && (
              <span className="text-[10px] uppercase tracking-wide bg-gray-100 text-gray-700 rounded-full px-2 py-0.5">
                {word.cefr_level}
              </span>
            )}
            <SourceBadge source={word.source} />
          </div>
          {word.meaning_tr && (
            <div className="text-base text-gray-700">{word.meaning_tr}</div>
          )}
        </div>

        <span
          className={`shrink-0 inline-flex items-center gap-1 text-xs font-semibold rounded-full px-2.5 py-1 ${meta.pill}`}
        >
          <span aria-hidden>{meta.emoji}</span>
          <span>{meta.label}</span>
        </span>
      </div>

      {word.example_sentence && (
        <div className="text-sm italic text-gray-600 border-l-2 border-gray-200 pl-3">
          {word.example_sentence}
        </div>
      )}

      <div className="flex items-center justify-end gap-2">
        {status === 'mastered' ? (
          <button
            type="button"
            onClick={onMarkUnknown}
            disabled={pending}
            className="inline-flex items-center gap-2 text-sm font-medium bg-amber-500 hover:bg-amber-600 text-white rounded-full px-3 py-1.5 disabled:opacity-50"
          >
            {pending ? <Spinner /> : null}
            {pending ? 'Kaydediliyor...' : '↩ Bilmiyorum'}
          </button>
        ) : (
          <button
            type="button"
            onClick={onMarkKnown}
            disabled={pending}
            className="inline-flex items-center gap-2 text-sm font-medium bg-blue-600 hover:bg-blue-700 text-white rounded-full px-3 py-1.5 disabled:opacity-50"
          >
            {pending ? <Spinner /> : null}
            {pending ? 'Kaydediliyor...' : '✓ Biliyorum'}
          </button>
        )}
      </div>
    </div>
  );
}

function SourceBadge({ source }: { source: string }) {
  if (source === 'weak') {
    return (
      <span className="text-[10px] uppercase tracking-wide bg-amber-100 text-amber-800 rounded-full px-2 py-0.5">
        ⚠️ Zayıf
      </span>
    );
  }
  if (source === 'new') {
    return (
      <span className="text-[10px] uppercase tracking-wide bg-purple-100 text-purple-800 rounded-full px-2 py-0.5">
        ✨ Yeni
      </span>
    );
  }
  return null;
}

function WordListSkeleton() {
  return (
    <div className="space-y-3 animate-pulse">
      {Array.from({ length: 5 }).map((_, i) => (
        <div key={i} className="h-28 bg-white rounded-2xl shadow" />
      ))}
    </div>
  );
}

function Spinner() {
  return (
    <span
      aria-hidden
      className="inline-block w-4 h-4 border-2 border-current/30 border-t-current rounded-full animate-spin"
    />
  );
}
