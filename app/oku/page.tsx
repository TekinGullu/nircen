'use client';

import {
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import type { User } from '@supabase/supabase-js';
import { createClient } from '@/lib/supabase/client';

type TextType = 'story' | 'article' | 'dialogue' | 'fact';

type CefrLevel = '' | 'A1' | 'A2' | 'B1' | 'B2' | 'C1' | 'C2';

const CEFR_OPTIONS: { value: CefrLevel; label: string }[] = [
  { value: '', label: 'Hepsi' },
  { value: 'A1', label: 'A1' },
  { value: 'A2', label: 'A2' },
  { value: 'B1', label: 'B1' },
  { value: 'B2', label: 'B2' },
  { value: 'C1', label: 'C1' },
  { value: 'C2', label: 'C2' },
];

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

interface HighlightedWord {
  word_id: number;
  word: string;
  base_word: string;
  meaning_tr: string | null;
  meaning_en: string | null;
  example_sentence: string | null;
}

interface Question {
  no: number;
  question: string;
  options: string[];
  correct_answer?: string;
  explanation_en?: string;
}

interface StoryResponse {
  session_id: number;
  text_type: string;
  story: string;
  highlighted_words: HighlightedWord[];
  questions: Question[];
}

interface LookupResponse {
  word_id: number;
  word: string;
  base_word: string;
  meaning_tr: string | null;
  meaning_en: string | null;
  example_sentence: string | null;
  cefr_level: string | null;
  already_in_list: boolean;
  status?: 'learning' | 'mastered' | string | null;
  source: string;
}

type WordSignalKind =
  | 'clicked_for_help'
  | 'inferred_known'
  | 'inferred_weak'
  | 'seen_only';

interface WordSignal {
  word_id: number;
  word: string;
  signal: WordSignalKind;
  wasClicked: boolean;
}

interface AnswerResultItem {
  no: number;
  question: string;
  user_answer: string;
  correct_answer: string;
  correct: boolean;
  explanation_en: string;
}

interface AnswerResponse {
  session_id: number;
  score: number;
  total: number;
  results: AnswerResultItem[];
  word_signals: WordSignal[];
  summary: {
    questions_correct: number;
    questions_total: number;
    words_total: number;
    words_clicked: number;
    comprehension_ratio: number;
  };
}

type Stage = 'setup' | 'reading' | 'result';

const COUNT_OPTIONS = [6, 10, 14] as const;

const TEXT_TYPES: { value: TextType; emoji: string; label: string }[] = [
  { value: 'story', emoji: '📖', label: 'Hikaye' },
  { value: 'article', emoji: '📰', label: 'Makale' },
  { value: 'dialogue', emoji: '💬', label: 'Diyalog' },
  { value: 'fact', emoji: '💡', label: 'İlginç Bilgi' },
];

const TEXT_TYPE_LABEL: Record<string, { emoji: string; label: string }> = {
  story: { emoji: '📖', label: 'Hikaye' },
  article: { emoji: '📰', label: 'Makale' },
  dialogue: { emoji: '💬', label: 'Diyalog' },
  fact: { emoji: '💡', label: 'İlginç Bilgi' },
};

export default function OkuPage() {
  const router = useRouter();
  const supabase = createClient();

  const [user, setUser] = useState<User | null>(null);
  const [checkingAuth, setCheckingAuth] = useState(true);

  const [stage, setStage] = useState<Stage>('setup');
  const [count, setCount] = useState<6 | 10 | 14>(10);
  const [textType, setTextType] = useState<TextType>('story');
  const [cefrLevel, setCefrLevel] = useState<CefrLevel>('');

  const [story, setStory] = useState<StoryResponse | null>(null);
  const [answers, setAnswers] = useState<Record<number, string>>({});
  const [clickedIds, setClickedIds] = useState<Set<number>>(new Set());

  const [generating, setGenerating] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const [result, setResult] = useState<AnswerResponse | null>(null);

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
    })();
    return () => {
      active = false;
    };
  }, [router, supabase]);

  async function startReading() {
    if (!user || generating) return;
    setErrorMsg(null);
    setGenerating(true);
    try {
      const wordsRes = await fetch('/api/vocabulary/words', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          user_id: user.id,
          count,
          cefr_level: cefrLevel || null,
        }),
      });
      if (!wordsRes.ok) {
        const body = await wordsRes.json().catch(() => null);
        const detail = body?.error
          ? `${body.error}${body.status ? ` (${body.status})` : ''}`
          : '';
        setErrorMsg(
          `Kelimeler alınamadı. Tekrar dene.${detail ? ` — ${detail}` : ''}`
        );
        return;
      }
      const wordsData = (await wordsRes.json()) as { words: VocabWord[] };
      const wordIds = (wordsData.words ?? []).map((w) => w.word_id);
      if (wordIds.length === 0) {
        setErrorMsg(
          cefrLevel
            ? `${cefrLevel} seviyesinde uygun kelime bulunamadı. Başka bir seviye dene.`
            : 'Hiç kelime gelmedi. Daha sonra tekrar dene.'
        );
        return;
      }

      const storyRes = await fetch('/api/vocabulary/story', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          user_id: user.id,
          word_ids: wordIds,
          text_type: textType,
        }),
      });
      if (!storyRes.ok) {
        const body = await storyRes.json().catch(() => null);
        const detail = body?.error
          ? `${body.error}${body.status ? ` (${body.status})` : ''}`
          : '';
        setErrorMsg(
          `Hikaye hazırlanamadı. Tekrar dene.${detail ? ` — ${detail}` : ''}`
        );
        return;
      }
      const storyData = (await storyRes.json()) as StoryResponse;
      if (!storyData?.story || !Array.isArray(storyData?.questions)) {
        setErrorMsg('Geçersiz hikaye verisi.');
        return;
      }

      setStory(storyData);
      setAnswers({});
      setClickedIds(new Set());
      setStage('reading');
    } catch {
      setErrorMsg('Bağlantı hatası. Tekrar dene.');
    } finally {
      setGenerating(false);
    }
  }

  async function submitAnswers() {
    if (!user || !story || submitting) return;
    const totalQs = story.questions.length;
    if (Object.keys(answers).length < totalQs) return;

    setErrorMsg(null);
    setSubmitting(true);
    try {
      const payload = {
        user_id: user.id,
        session_id: story.session_id,
        answers: story.questions.map((q) => ({
          no: q.no,
          answer: answers[q.no] ?? '',
        })),
        clicked_word_ids: Array.from(clickedIds),
      };
      const res = await fetch('/api/vocabulary/answer', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => null);
        const detail = body?.error
          ? `${body.error}${body.status ? ` (${body.status})` : ''}`
          : '';
        setErrorMsg(
          `Cevaplar gönderilemedi.${detail ? ` — ${detail}` : ''}`
        );
        return;
      }
      const data = (await res.json()) as AnswerResponse;
      if (!Array.isArray(data?.results)) {
        setErrorMsg('Geçersiz sonuç verisi.');
        return;
      }
      setResult(data);
      setStage('result');
    } catch {
      setErrorMsg('Bağlantı hatası. Tekrar dene.');
    } finally {
      setSubmitting(false);
    }
  }

  function resetToSetup() {
    setStage('setup');
    setStory(null);
    setAnswers({});
    setClickedIds(new Set());
    setResult(null);
    setErrorMsg(null);
  }

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
            <h1 className="text-xl font-bold">📖 Bağlamsal Kelime Öğrenme</h1>
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

      <main className="max-w-3xl mx-auto p-4">
        {errorMsg && (
          <div className="mb-4 rounded-lg border border-red-200 bg-red-50 text-red-700 px-4 py-3 text-sm">
            {errorMsg}
          </div>
        )}

        {stage === 'setup' && (
          <SetupStage
            count={count}
            setCount={setCount}
            textType={textType}
            setTextType={setTextType}
            cefrLevel={cefrLevel}
            setCefrLevel={setCefrLevel}
            onStart={startReading}
            generating={generating}
          />
        )}

        {stage === 'reading' && story && (
          <ReadingStage
            story={story}
            userId={user?.id ?? ''}
            answers={answers}
            setAnswers={setAnswers}
            setClickedIds={setClickedIds}
            onReset={resetToSetup}
            onSubmit={submitAnswers}
            submitting={submitting}
          />
        )}

        {stage === 'result' && result && (
          <ResultStage result={result} onNewReading={resetToSetup} />
        )}
      </main>
    </div>
  );
}

function SetupStage({
  count,
  setCount,
  textType,
  setTextType,
  cefrLevel,
  setCefrLevel,
  onStart,
  generating,
}: {
  count: 6 | 10 | 14;
  setCount: (n: 6 | 10 | 14) => void;
  textType: TextType;
  setTextType: (t: TextType) => void;
  cefrLevel: CefrLevel;
  setCefrLevel: (l: CefrLevel) => void;
  onStart: () => void;
  generating: boolean;
}) {
  return (
    <div className="space-y-4">
      <div className="bg-white rounded-2xl shadow p-5 space-y-3">
        <h2 className="font-semibold text-gray-800">
          Kaç kelimeyle başlamak istersin?
        </h2>
        <div className="flex gap-2">
          {COUNT_OPTIONS.map((n) => {
            const active = count === n;
            return (
              <button
                key={n}
                type="button"
                onClick={() => setCount(n)}
                disabled={generating}
                className={`flex-1 py-3 rounded-xl font-semibold border transition ${
                  active
                    ? 'bg-blue-600 text-white border-blue-600'
                    : 'bg-white text-gray-700 border-gray-300 hover:border-blue-400'
                } disabled:opacity-50`}
              >
                {n}
              </button>
            );
          })}
        </div>
      </div>

      <div className="bg-white rounded-2xl shadow p-5 space-y-3">
        <h2 className="font-semibold text-gray-800">
          Nasıl bir metin okuyalım?
        </h2>
        <div className="grid grid-cols-2 gap-2">
          {TEXT_TYPES.map((t) => {
            const active = textType === t.value;
            return (
              <button
                key={t.value}
                type="button"
                onClick={() => setTextType(t.value)}
                disabled={generating}
                className={`py-3 rounded-xl font-medium border transition flex items-center justify-center gap-2 ${
                  active
                    ? 'bg-blue-600 text-white border-blue-600'
                    : 'bg-white text-gray-700 border-gray-300 hover:border-blue-400'
                } disabled:opacity-50`}
              >
                <span aria-hidden>{t.emoji}</span>
                <span>{t.label}</span>
              </button>
            );
          })}
        </div>
      </div>

      <div className="bg-white rounded-2xl shadow p-5 space-y-3">
        <h2 className="font-semibold text-gray-800">Kelime seviyesi (CEFR)</h2>
        <div className="grid grid-cols-4 sm:grid-cols-7 gap-2">
          {CEFR_OPTIONS.map((o) => {
            const active = cefrLevel === o.value;
            return (
              <button
                key={o.value || 'all'}
                type="button"
                onClick={() => setCefrLevel(o.value)}
                disabled={generating}
                className={`py-2.5 rounded-xl font-semibold border text-sm transition ${
                  active
                    ? 'bg-blue-600 text-white border-blue-600'
                    : 'bg-white text-gray-700 border-gray-300 hover:border-blue-400'
                } disabled:opacity-50`}
              >
                {o.label}
              </button>
            );
          })}
        </div>
        <p className="text-xs text-gray-500">
          Seçilen seviyedeki kelimelerden hikaye hazırlanır. &quot;Hepsi&quot; tüm
          seviyelerden karışık getirir.
        </p>
      </div>

      <button
        type="button"
        onClick={onStart}
        disabled={generating}
        className="w-full bg-blue-600 hover:bg-blue-700 text-white rounded-xl py-4 text-lg font-semibold disabled:opacity-50 flex items-center justify-center gap-2"
      >
        {generating ? (
          <>
            <Spinner /> Hikaye hazırlanıyor...
          </>
        ) : (
          <>🚀 Başla</>
        )}
      </button>
    </div>
  );
}

interface Anchor {
  centerX: number;
  top: number;
  bottom: number;
}

interface CardState {
  word: string;
  anchor: Anchor;
  nonce: number;
}

function ReadingStage({
  story,
  userId,
  answers,
  setAnswers,
  setClickedIds,
  onReset,
  onSubmit,
  submitting,
}: {
  story: StoryResponse;
  userId: string;
  answers: Record<number, string>;
  setAnswers: React.Dispatch<React.SetStateAction<Record<number, string>>>;
  setClickedIds: React.Dispatch<React.SetStateAction<Set<number>>>;
  onReset: () => void;
  onSubmit: () => void;
  submitting: boolean;
}) {
  const typeMeta = TEXT_TYPE_LABEL[story.text_type] ?? {
    emoji: '📄',
    label: story.text_type,
  };

  const totalQs = story.questions.length;
  const answeredCount = Object.keys(answers).filter(
    (k) => answers[Number(k)]
  ).length;
  const allAnswered = answeredCount >= totalQs;

  // Coarse pointer (mobile) → single tap opens; otherwise double-click is
  // required so accidental clicks don't trigger the card. Resolved on the
  // client to avoid hydration mismatches.
  const coarseRef = useRef(false);
  useEffect(() => {
    coarseRef.current =
      typeof window !== 'undefined' &&
      typeof window.matchMedia === 'function' &&
      window.matchMedia('(pointer: coarse)').matches;
  }, []);

  const [card, setCard] = useState<CardState | null>(null);
  const [activeIndex, setActiveIndex] = useState<number | null>(null);

  // Map highlighted-word surfaces → word_id so opening a card on a target/
  // support word still records the "clicked for help" signal the answer
  // endpoint expects, without showing any visual distinction in the text.
  const helpMap = useMemo(() => {
    const m = new Map<string, number>();
    for (const h of story.highlighted_words ?? []) {
      if (h?.word) {
        const k = h.word.toLowerCase();
        if (!m.has(k)) m.set(k, h.word_id);
      }
      if (h?.base_word) {
        const k = h.base_word.toLowerCase();
        if (!m.has(k)) m.set(k, h.word_id);
      }
    }
    return m;
  }, [story.highlighted_words]);

  const tokens = useMemo(() => tokenizeText(story.story), [story.story]);

  function openCard(rawWord: string, index: number | null, anchor: Anchor) {
    const clean = cleanWord(rawWord);
    if (!clean) return;
    const helpId = helpMap.get(clean.toLowerCase());
    if (helpId != null) {
      setClickedIds((prev) => {
        if (prev.has(helpId)) return prev;
        const next = new Set(prev);
        next.add(helpId);
        return next;
      });
    }
    setActiveIndex(index);
    setCard((c) => ({ word: clean, anchor, nonce: (c?.nonce ?? 0) + 1 }));
  }

  function closeCard() {
    setCard(null);
    setActiveIndex(null);
  }

  function handleArticleContextMenu(e: React.MouseEvent) {
    if (coarseRef.current) return;
    const selection =
      typeof window !== 'undefined'
        ? window.getSelection?.()?.toString() ?? ''
        : '';
    if (!cleanWord(selection)) return;
    e.preventDefault();
    openCard(selection, null, {
      centerX: e.clientX,
      top: e.clientY,
      bottom: e.clientY,
    });
  }

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between gap-3 text-sm">
        <button
          type="button"
          onClick={onReset}
          disabled={submitting}
          className="text-gray-600 hover:text-gray-900 disabled:opacity-50"
        >
          ← Yeniden başla
        </button>
        <div className="flex items-center gap-2 font-medium text-gray-700">
          <span aria-hidden>{typeMeta.emoji}</span>
          <span>{typeMeta.label}</span>
        </div>
        <span className="rounded-full bg-blue-100 text-blue-800 text-xs font-medium px-2.5 py-1">
          {story.highlighted_words.length} kelime
        </span>
      </div>

      <article
        onContextMenu={handleArticleContextMenu}
        className="bg-white rounded-2xl shadow p-5 sm:p-6 text-gray-900 leading-relaxed whitespace-pre-wrap text-[17px]"
      >
        {tokens.map((tok, i) => {
          if (tok.type === 'text') return <span key={i}>{tok.value}</span>;
          const active = i === activeIndex;
          return (
            <span
              key={i}
              onClick={(e) => {
                if (!coarseRef.current) return;
                const r = (
                  e.currentTarget as HTMLElement
                ).getBoundingClientRect();
                openCard(tok.value, i, {
                  centerX: r.left + r.width / 2,
                  top: r.top,
                  bottom: r.bottom,
                });
              }}
              onDoubleClick={(e) => {
                if (coarseRef.current) return;
                openCard(tok.value, i, {
                  centerX: e.clientX,
                  top: e.clientY,
                  bottom: e.clientY,
                });
              }}
              className={`rounded transition-colors ${
                active ? 'bg-blue-100' : ''
              }`}
            >
              {tok.value}
            </span>
          );
        })}
      </article>

      <p className="text-xs text-gray-400 -mt-2 px-1">
        💡 Bir kelimeye dokun (masaüstünde çift tıkla) ya da bir ifade seçip sağ
        tıkla — anlamını gör ve öğreneceklerine ekle.
      </p>

      <section className="bg-white rounded-2xl shadow p-5 space-y-4">
        <h2 className="font-semibold text-gray-800">📝 Anlama Soruları</h2>

        <div className="space-y-5">
          {story.questions.map((q) => (
            <div key={q.no} className="space-y-2">
              <div className="font-medium text-gray-900">
                Soru {q.no}: {q.question}
              </div>
              <div className="space-y-2">
                {q.options.map((opt, i) => {
                  const selected = answers[q.no] === opt;
                  return (
                    <label
                      key={i}
                      className={`flex items-start gap-3 p-3 rounded-xl border cursor-pointer transition ${
                        selected
                          ? 'border-blue-500 bg-blue-50'
                          : 'border-gray-200 hover:border-blue-300'
                      } ${submitting ? 'opacity-60 cursor-not-allowed' : ''}`}
                    >
                      <input
                        type="radio"
                        name={`q-${q.no}`}
                        className="mt-1 accent-blue-600"
                        checked={selected}
                        disabled={submitting}
                        onChange={() =>
                          setAnswers((prev) => ({ ...prev, [q.no]: opt }))
                        }
                      />
                      <span className="text-gray-800">{opt}</span>
                    </label>
                  );
                })}
              </div>
            </div>
          ))}
        </div>

        <div className="flex items-center justify-between gap-3 pt-2">
          <span className="text-xs text-gray-500 tabular-nums">
            {answeredCount} / {totalQs} cevaplandı
          </span>
          <button
            type="button"
            onClick={onSubmit}
            disabled={!allAnswered || submitting}
            className="bg-blue-600 hover:bg-blue-700 text-white rounded-xl px-5 py-3 font-semibold disabled:opacity-50 flex items-center gap-2"
          >
            {submitting ? (
              <>
                <Spinner /> Gönderiliyor...
              </>
            ) : (
              <>✓ Cevapları Gönder</>
            )}
          </button>
        </div>
      </section>

      {card && (
        <WordCard
          key={card.nonce}
          word={card.word}
          anchor={card.anchor}
          userId={userId}
          onClose={closeCard}
        />
      )}
    </div>
  );
}

function WordCard({
  word,
  anchor,
  userId,
  onClose,
}: {
  word: string;
  anchor: Anchor;
  userId: string;
  onClose: () => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [data, setData] = useState<LookupResponse | null>(null);

  const [adding, setAdding] = useState(false);
  const [added, setAdded] = useState(false);

  const [knowing, setKnowing] = useState(false);
  const [known, setKnown] = useState(false);

  // Lookup (may take 1–2s when the meaning is AI-generated). The card is keyed
  // by selection, so it mounts fresh each time — no need to reset state here.
  useEffect(() => {
    let active = true;
    fetch('/api/vocabulary/lookup', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ user_id: userId, word }),
    })
      .then((r) => {
        if (!r.ok) throw new Error('lookup failed');
        return r.json();
      })
      .then((d: LookupResponse) => {
        if (active) setData(d);
      })
      .catch(() => {
        if (active) setError(true);
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [word, userId]);

  // Position next to the anchor, clamped inside the viewport. Re-runs when the
  // content (and therefore height) changes.
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const margin = 8;

    let left = anchor.centerX - rect.width / 2;
    left = Math.max(margin, Math.min(left, vw - rect.width - margin));

    let top: number;
    if (vh - anchor.bottom >= rect.height + margin) {
      top = anchor.bottom + margin;
    } else if (anchor.top - margin >= rect.height) {
      top = anchor.top - rect.height - margin;
    } else {
      top = Math.max(margin, vh - rect.height - margin);
    }
    setPos({ top, left });
  }, [anchor, loading, error, data, added, adding, known, knowing]);

  // Close on Escape or on any interaction outside the card.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose();
    }
    function onDown(e: PointerEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    }
    document.addEventListener('keydown', onKey);
    const t = setTimeout(() => {
      document.addEventListener('pointerdown', onDown);
    }, 0);
    return () => {
      document.removeEventListener('keydown', onKey);
      document.removeEventListener('pointerdown', onDown);
      clearTimeout(t);
    };
  }, [onClose]);

  async function addToList() {
    if (!data || adding || added || knowing || known) return;
    setAdding(true);
    setAdded(true); // optimistic
    try {
      const r = await fetch('/api/vocabulary/add', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ user_id: userId, word_id: data.word_id }),
      });
      if (!r.ok) throw new Error('add failed');
      const j = await r.json();
      if (!j?.success) throw new Error('add failed');
    } catch {
      setAdded(false); // revert on error
    } finally {
      setAdding(false);
    }
  }

  async function markKnown() {
    if (!data || knowing || known || adding || added) return;
    setKnowing(true);
    setKnown(true); // optimistic
    try {
      const r = await fetch('/api/vocabulary/mark-known', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ user_id: userId, word_id: data.word_id }),
      });
      if (!r.ok) throw new Error('mark-known failed');
      const j = await r.json();
      if (!j?.success) throw new Error('mark-known failed');
    } catch {
      setKnown(false); // revert on error
    } finally {
      setKnowing(false);
    }
  }

  const displayWord = data?.word || word;

  // Resolve which (if any) passive status label to show instead of the buttons.
  // Local optimistic actions win; otherwise fall back to the looked-up status.
  let statusLabel: string | null = null;
  if (known) statusLabel = 'Biliniyor ✓';
  else if (added) statusLabel = 'Eklendi ✓';
  else if (data?.already_in_list) {
    statusLabel = data.status === 'mastered' ? 'Biliniyor ✓' : 'Listende ✓';
  }

  return (
    <div
      ref={ref}
      role="dialog"
      aria-label="Kelime kartı"
      style={{
        top: pos?.top ?? -9999,
        left: pos?.left ?? -9999,
        visibility: pos ? 'visible' : 'hidden',
      }}
      className="fixed z-50 w-72 max-w-[calc(100vw-16px)] bg-white rounded-xl shadow-xl border border-gray-200 p-4"
    >
      {loading && (
        <div className="flex items-center gap-2 text-sm text-gray-500 py-1">
          <Spinner className="border-gray-300 border-t-gray-600" />
          Aranıyor...
        </div>
      )}

      {!loading && error && (
        <div className="text-sm text-gray-500 py-1">
          &quot;{word}&quot; için anlam bulunamadı.
        </div>
      )}

      {!loading && !error && data && (
        <div className="space-y-2">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <div className="text-lg font-bold text-gray-900 break-words">
                {displayWord}
              </div>
              {data.base_word &&
                data.base_word.toLowerCase() !==
                  displayWord.toLowerCase() && (
                  <div className="text-xs text-gray-500">{data.base_word}</div>
                )}
            </div>
            {data.cefr_level && (
              <span className="shrink-0 text-[11px] font-semibold bg-blue-100 text-blue-700 rounded-full px-2 py-0.5">
                {data.cefr_level}
              </span>
            )}
          </div>

          {data.meaning_tr && (
            <div className="text-base font-medium text-red-700">
              {data.meaning_tr}
            </div>
          )}
          {data.meaning_en && (
            <div className="text-xs italic text-gray-500">{data.meaning_en}</div>
          )}

          {data.example_sentence && (
            <blockquote className="border-l-4 border-blue-300 pl-2 text-sm italic text-gray-600">
              {data.example_sentence}
            </blockquote>
          )}

          <div className="pt-1">
            {statusLabel ? (
              <div className="text-sm font-semibold text-green-700">
                {statusLabel}
              </div>
            ) : (
              <div className="flex flex-col sm:flex-row gap-2">
                <button
                  type="button"
                  onClick={addToList}
                  disabled={adding}
                  className="flex-1 bg-blue-600 hover:bg-blue-700 text-white rounded-lg px-3 py-2 text-sm font-medium disabled:opacity-50 flex items-center justify-center gap-2"
                >
                  {adding ? (
                    <>
                      <Spinner /> Ekleniyor...
                    </>
                  ) : (
                    <>+ Öğreneceklerime Ekle</>
                  )}
                </button>
                <button
                  type="button"
                  onClick={markKnown}
                  disabled={knowing}
                  className="flex-1 border border-green-600 text-green-700 hover:bg-green-50 rounded-lg px-3 py-2 text-sm font-medium disabled:opacity-50 flex items-center justify-center gap-2"
                >
                  {knowing ? (
                    <>
                      <Spinner className="border-green-300 border-t-green-600" />{' '}
                      Kaydediliyor...
                    </>
                  ) : (
                    <>✓ Biliyorum</>
                  )}
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function ResultStage({
  result,
  onNewReading,
}: {
  result: AnswerResponse;
  onNewReading: () => void;
}) {
  const score = result.score;
  const total = result.total;
  const tone =
    total > 0 && score === total
      ? 'green'
      : score >= Math.ceil(total / 2)
        ? 'yellow'
        : 'red';

  const toneText: Record<typeof tone, string> = {
    green: 'Mükemmel! Hikayeyi tam anladın.',
    yellow: 'İyi gidiyorsun! Eksikleri inceleyelim.',
    red: 'Hikayeyi tekrar okumak isteyebilirsin.',
  };

  const toneClasses: Record<typeof tone, string> = {
    green: 'bg-green-50 border-green-200 text-green-800',
    yellow: 'bg-yellow-50 border-yellow-200 text-yellow-800',
    red: 'bg-red-50 border-red-200 text-red-800',
  };

  return (
    <div className="space-y-5">
      <div className="bg-white rounded-2xl shadow p-6 text-center space-y-2">
        <div className="text-lg font-semibold text-gray-700">🎉 Sonuçlar</div>
        <div className="text-4xl font-bold text-blue-600">
          {score} / {total} Doğru
        </div>
      </div>

      <div
        className={`rounded-2xl border px-4 py-3 text-sm font-medium ${toneClasses[tone]}`}
      >
        {toneText[tone]}
      </div>

      <section className="space-y-3">
        {result.results.map((r) => (
          <div
            key={r.no}
            className={`rounded-2xl shadow p-5 space-y-2 border ${
              r.correct
                ? 'bg-green-50 border-green-200'
                : 'bg-red-50 border-red-200'
            }`}
          >
            <div className="flex items-center gap-2 text-sm font-semibold">
              <span
                className={`inline-flex items-center justify-center w-6 h-6 rounded-full text-white text-xs ${
                  r.correct ? 'bg-green-600' : 'bg-red-600'
                }`}
                aria-hidden
              >
                {r.correct ? '✓' : '✗'}
              </span>
              <span className={r.correct ? 'text-green-700' : 'text-red-700'}>
                Soru {r.no}
              </span>
            </div>
            <div className="text-gray-900">{r.question}</div>
            <div className="text-sm">
              <span className="text-gray-500">Senin cevabın: </span>
              <span
                className={
                  r.correct
                    ? 'text-green-800 font-medium'
                    : 'text-red-800 font-medium'
                }
              >
                {r.user_answer?.trim() ? r.user_answer : '(boş)'}
              </span>
            </div>
            {!r.correct && (
              <div className="text-sm">
                <span className="text-gray-500">Doğru cevap: </span>
                <span className="text-green-800 font-semibold">
                  {r.correct_answer}
                </span>
              </div>
            )}
            {r.explanation_en && (
              <div className="text-sm bg-white/70 rounded-lg p-3 text-gray-700 italic border">
                {r.explanation_en}
              </div>
            )}
          </div>
        ))}
      </section>

      <section className="bg-white rounded-2xl shadow p-5 space-y-3">
        <h3 className="font-semibold text-gray-800">📚 Kelime İlerlemen</h3>
        {result.word_signals.length === 0 ? (
          <div className="text-sm text-gray-400">Kelime verisi yok</div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {result.word_signals.map((s) => (
              <div
                key={s.word_id}
                className="border border-gray-100 rounded-xl p-3 flex items-start justify-between gap-3 bg-gray-50/50"
              >
                <div className="min-w-0">
                  <div className="font-medium text-gray-900 truncate">
                    {s.word}
                  </div>
                </div>
                <SignalBadge signal={s.signal} />
              </div>
            ))}
          </div>
        )}
      </section>

      <div className="flex flex-col sm:flex-row gap-3">
        <button
          type="button"
          onClick={onNewReading}
          className="flex-1 bg-blue-600 hover:bg-blue-700 text-white rounded-xl py-3 font-semibold"
        >
          ← Yeni Okuma
        </button>
        <Link
          href="/dashboard"
          className="flex-1 text-center bg-white hover:bg-gray-100 text-gray-800 border rounded-xl py-3 font-semibold"
        >
          📊 Dashboard&apos;a Git
        </Link>
      </div>
    </div>
  );
}

function SignalBadge({ signal }: { signal: WordSignalKind }) {
  const map: Record<
    WordSignalKind,
    { emoji: string; label: string; cls: string }
  > = {
    clicked_for_help: {
      emoji: '🆘',
      label: 'Yardım istedin',
      cls: 'bg-red-100 text-red-800',
    },
    inferred_known: {
      emoji: '🎯',
      label: 'Anladın',
      cls: 'bg-green-100 text-green-800',
    },
    inferred_weak: {
      emoji: '🤔',
      label: 'Bilmiyor olabilirsin',
      cls: 'bg-yellow-100 text-yellow-800',
    },
    seen_only: {
      emoji: '👁️',
      label: 'Gördün',
      cls: 'bg-gray-100 text-gray-700',
    },
  };
  const m = map[signal];
  return (
    <span
      className={`shrink-0 inline-flex items-center gap-1 text-[11px] rounded-full px-2 py-0.5 ${m.cls}`}
    >
      <span aria-hidden>{m.emoji}</span>
      <span className="whitespace-nowrap">{m.label}</span>
    </span>
  );
}

function Spinner({
  className = 'border-white/40 border-t-white',
}: {
  className?: string;
}) {
  return (
    <span
      aria-hidden
      className={`inline-block w-4 h-4 border-2 rounded-full animate-spin ${className}`}
    />
  );
}

type Token =
  | { type: 'text'; value: string }
  | { type: 'word'; value: string };

// Words keep internal apostrophes/hyphens (don't, well-known) but leading/
// trailing punctuation falls into the surrounding text tokens, so each word
// span already carries a clean lookup term.
const WORD_RE = /[\p{L}\p{M}\p{N}]+(?:['’\-‐][\p{L}\p{M}\p{N}]+)*/gu;

function tokenizeText(text: string): Token[] {
  if (!text) return [];
  const tokens: Token[] = [];
  let lastIdx = 0;
  let m: RegExpExecArray | null;
  WORD_RE.lastIndex = 0;
  while ((m = WORD_RE.exec(text)) !== null) {
    if (m.index > lastIdx) {
      tokens.push({ type: 'text', value: text.slice(lastIdx, m.index) });
    }
    tokens.push({ type: 'word', value: m[0] });
    lastIdx = m.index + m[0].length;
  }
  if (lastIdx < text.length) {
    tokens.push({ type: 'text', value: text.slice(lastIdx) });
  }
  return tokens;
}

const TRIM_RE =
  /^[\s.,!?"'’“”:;()[\]{}\-–—…«»]+|[\s.,!?"'’“”:;()[\]{}\-–—…«»]+$/g;

function cleanWord(s: string): string {
  return (s ?? '').replace(TRIM_RE, '').trim();
}
