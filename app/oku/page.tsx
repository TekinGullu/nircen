'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
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
  const [selectedWord, setSelectedWord] = useState<HighlightedWord | null>(null);

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
      setSelectedWord(null);
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
    setSelectedWord(null);
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
            answers={answers}
            setAnswers={setAnswers}
            clickedIds={clickedIds}
            setClickedIds={setClickedIds}
            selectedWord={selectedWord}
            setSelectedWord={setSelectedWord}
            onReset={resetToSetup}
            onSubmit={submitAnswers}
            submitting={submitting}
          />
        )}

        {stage === 'result' && result && (
          <ResultStage
            result={result}
            onNewReading={resetToSetup}
          />
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

function ReadingStage({
  story,
  answers,
  setAnswers,
  clickedIds,
  setClickedIds,
  selectedWord,
  setSelectedWord,
  onReset,
  onSubmit,
  submitting,
}: {
  story: StoryResponse;
  answers: Record<number, string>;
  setAnswers: React.Dispatch<React.SetStateAction<Record<number, string>>>;
  clickedIds: Set<number>;
  setClickedIds: React.Dispatch<React.SetStateAction<Set<number>>>;
  selectedWord: HighlightedWord | null;
  setSelectedWord: React.Dispatch<React.SetStateAction<HighlightedWord | null>>;
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

  function openWord(w: HighlightedWord) {
    setSelectedWord(w);
    setClickedIds((prev) => {
      if (prev.has(w.word_id)) return prev;
      const next = new Set(prev);
      next.add(w.word_id);
      return next;
    });
  }

  const tokens = useMemo(
    () => tokenizeStory(story.story, story.highlighted_words),
    [story.story, story.highlighted_words]
  );

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

      <article className="bg-white rounded-2xl shadow p-5 sm:p-6 text-gray-900 leading-relaxed whitespace-pre-wrap text-[17px]">
        {tokens.map((tok, i) => {
          if (tok.type === 'text') return <span key={i}>{tok.value}</span>;
          const isClicked = clickedIds.has(tok.word.word_id);
          return (
            <button
              key={i}
              type="button"
              onClick={() => openWord(tok.word)}
              className={`inline rounded px-0.5 underline decoration-dotted underline-offset-4 transition ${
                isClicked
                  ? 'bg-green-100 text-green-800 hover:bg-green-200'
                  : 'text-blue-600 hover:text-blue-800 hover:bg-blue-50'
              }`}
            >
              {tok.value}
            </button>
          );
        })}
      </article>

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

      {selectedWord && (
        <WordModal
          word={selectedWord}
          onClose={() => setSelectedWord(null)}
        />
      )}
    </div>
  );
}

function WordModal({
  word,
  onClose,
}: {
  word: HighlightedWord;
  onClose: () => void;
}) {
  const [open, setOpen] = useState(false);
  const dialogRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const id = requestAnimationFrame(() => setOpen(true));
    return () => cancelAnimationFrame(id);
  }, []);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose();
    }
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div
      className={`fixed inset-0 z-50 flex items-center justify-center p-4 transition-opacity duration-150 ${
        open ? 'bg-black/50 opacity-100' : 'bg-black/0 opacity-0'
      }`}
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        className={`w-full max-w-md bg-white rounded-2xl shadow-xl p-5 space-y-3 transition-all duration-150 ${
          open ? 'opacity-100 scale-100' : 'opacity-0 scale-95'
        }`}
      >
        <div>
          <div className="text-2xl font-bold text-gray-900">{word.word}</div>
          {word.base_word && word.base_word.toLowerCase() !== word.word.toLowerCase() && (
            <div className="text-sm text-gray-500">{word.base_word}</div>
          )}
        </div>

        {word.meaning_tr && (
          <div className="text-lg font-medium text-red-700">
            {word.meaning_tr}
          </div>
        )}
        {word.meaning_en && (
          <div className="text-sm italic text-gray-600">{word.meaning_en}</div>
        )}

        {word.example_sentence && (
          <div className="space-y-1 pt-1">
            <div className="text-xs font-semibold text-gray-500 uppercase tracking-wide">
              Bu hikayedeki kullanım
            </div>
            <blockquote className="border-l-4 border-blue-400 pl-3 italic text-gray-700">
              {word.example_sentence}
            </blockquote>
          </div>
        )}

        <div className="pt-2 flex justify-end">
          <button
            type="button"
            onClick={onClose}
            className="bg-blue-600 hover:bg-blue-700 text-white rounded-lg px-4 py-2 font-medium"
          >
            Kapat
          </button>
        </div>
      </div>
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

function Spinner() {
  return (
    <span
      aria-hidden
      className="inline-block w-4 h-4 border-2 border-white/40 border-t-white rounded-full animate-spin"
    />
  );
}

type Token =
  | { type: 'text'; value: string }
  | { type: 'word'; value: string; word: HighlightedWord };

function tokenizeStory(text: string, highlights: HighlightedWord[]): Token[] {
  if (!text) return [];
  if (!highlights || highlights.length === 0) {
    return [{ type: 'text', value: text }];
  }

  const surfaceToHighlight = new Map<string, HighlightedWord>();
  for (const h of highlights) {
    if (h?.word) {
      const k = h.word.toLowerCase();
      if (!surfaceToHighlight.has(k)) surfaceToHighlight.set(k, h);
    }
    if (h?.base_word) {
      const k = h.base_word.toLowerCase();
      if (!surfaceToHighlight.has(k)) surfaceToHighlight.set(k, h);
    }
  }

  const surfaces = Array.from(surfaceToHighlight.keys())
    .filter((s) => s.length > 0)
    .sort((a, b) => b.length - a.length);

  if (surfaces.length === 0) return [{ type: 'text', value: text }];

  const pattern = new RegExp(
    `\\b(${surfaces.map(escapeRegex).join('|')})\\b`,
    'gi'
  );

  const tokens: Token[] = [];
  let lastIdx = 0;
  let m: RegExpExecArray | null;
  while ((m = pattern.exec(text)) !== null) {
    if (m.index > lastIdx) {
      tokens.push({ type: 'text', value: text.slice(lastIdx, m.index) });
    }
    const matched = m[0];
    const hw = surfaceToHighlight.get(matched.toLowerCase());
    if (hw) {
      tokens.push({ type: 'word', value: matched, word: hw });
    } else {
      tokens.push({ type: 'text', value: matched });
    }
    lastIdx = m.index + matched.length;
    if (matched.length === 0) pattern.lastIndex++;
  }
  if (lastIdx < text.length) {
    tokens.push({ type: 'text', value: text.slice(lastIdx) });
  }
  return tokens;
}

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
