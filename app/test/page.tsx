'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import type { User } from '@supabase/supabase-js';
import { createClient } from '@/lib/supabase/client';

type QuestionType =
  | 'fill_blank'
  | 'multiple_choice'
  | 'correction'
  | 'translation';

type Question = {
  no: number;
  type: QuestionType;
  question: string;
  context_tr: string | null;
  options: string[] | null;
  topic_code: string;
};

type GenerateResponse = {
  test_id: number;
  questions: Question[];
};

type ResultItem = {
  no: number;
  topic_code: string;
  type: QuestionType;
  question: string;
  user_answer: string;
  correct_answer: string;
  correct: boolean;
  explanation_tr: string;
};

type TopicScore = { correct: number; total: number };

type TopicSummary = {
  weakest: string[];
  by_topic: Record<string, TopicScore>;
};

type SubmitResponse = {
  test_id: number;
  score: number;
  total: number;
  results: ResultItem[];
  topic_summary?: TopicSummary | null;
};

type Stage = 'prep' | 'solving' | 'result';

const QUESTION_COUNTS = [5, 10, 15] as const;

const TYPE_LABEL: Record<QuestionType, string> = {
  fill_blank: 'Boşluk Doldurma',
  multiple_choice: 'Çoktan Seçmeli',
  correction: 'Hata Düzeltme',
  translation: 'Çeviri',
};

export default function TestPage() {
  const router = useRouter();
  const supabase = createClient();

  const [user, setUser] = useState<User | null>(null);
  const [checkingAuth, setCheckingAuth] = useState(true);

  const [stage, setStage] = useState<Stage>('prep');
  const [questionCount, setQuestionCount] = useState<number>(5);

  const [testId, setTestId] = useState<number | null>(null);
  const [questions, setQuestions] = useState<Question[]>([]);
  const [answers, setAnswers] = useState<Record<number, string>>({});

  const [generating, setGenerating] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [warnMsg, setWarnMsg] = useState<string | null>(null);

  const [result, setResult] = useState<SubmitResponse | null>(null);

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

  async function startTest() {
    if (!user || generating) return;
    setErrorMsg(null);
    setWarnMsg(null);
    setGenerating(true);
    try {
      const res = await fetch('/api/test/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          user_id: user.id,
          question_count: questionCount,
        }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => null);
        const detail = body?.error
          ? `${body.error}${body.status ? ` (${body.status})` : ''}`
          : '';
        setErrorMsg(
          `Test hazırlanamadı. Lütfen tekrar dene.${detail ? ` — ${detail}` : ''}`
        );
        return;
      }
      const data = (await res.json()) as GenerateResponse;
      if (
        typeof data?.test_id !== 'number' ||
        !Array.isArray(data?.questions) ||
        data.questions.length === 0
      ) {
        setErrorMsg('Geçersiz test verisi alındı.');
        return;
      }
      setTestId(data.test_id);
      setQuestions(data.questions);
      setAnswers({});
      setStage('solving');
    } catch {
      setErrorMsg('Bağlantı hatası. Tekrar dene.');
    } finally {
      setGenerating(false);
    }
  }

  async function submitAnswers() {
    if (!user || submitting || testId == null) return;
    const filledCount = questions.reduce(
      (n, q) => n + (answers[q.no]?.trim() ? 1 : 0),
      0
    );
    if (filledCount === 0) {
      setWarnMsg('En az bir soru cevaplamalısın.');
      return;
    }
    setWarnMsg(null);
    setErrorMsg(null);
    setSubmitting(true);
    try {
      const payload = {
        user_id: user.id,
        test_id: testId,
        answers: questions.map((q) => ({
          no: q.no,
          answer: (answers[q.no] ?? '').trim(),
        })),
      };
      const res = await fetch('/api/test/submit', {
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
          `Cevaplar gönderilemedi. Tekrar dene.${detail ? ` — ${detail}` : ''}`
        );
        return;
      }
      const data = (await res.json()) as SubmitResponse;
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

  function resetForNewTest() {
    setStage('prep');
    setTestId(null);
    setQuestions([]);
    setAnswers({});
    setResult(null);
    setErrorMsg(null);
    setWarnMsg(null);
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
      {/* Header */}
      <header className="bg-blue-600 text-white shadow">
        <div className="max-w-2xl mx-auto p-4 flex items-center justify-between gap-3">
          <h1 className="text-xl font-bold">Karma Test</h1>
          <Link
            href="/"
            className="shrink-0 text-sm bg-blue-700 hover:bg-blue-800 rounded-full px-3 py-1.5"
          >
            ← Sohbete dön
          </Link>
        </div>
      </header>

      <main className="max-w-2xl mx-auto p-4">
        {errorMsg && (
          <div className="mb-4 rounded-lg border border-red-200 bg-red-50 text-red-700 px-4 py-3 text-sm">
            {errorMsg}
          </div>
        )}

        {stage === 'prep' && (
          <PrepStage
            questionCount={questionCount}
            setQuestionCount={setQuestionCount}
            onStart={startTest}
            generating={generating}
          />
        )}

        {stage === 'solving' && (
          <SolvingStage
            questions={questions}
            answers={answers}
            setAnswers={setAnswers}
            onSubmit={submitAnswers}
            submitting={submitting}
            warnMsg={warnMsg}
          />
        )}

        {stage === 'result' && result && (
          <ResultStage
            result={result}
            onNewTest={resetForNewTest}
          />
        )}
      </main>
    </div>
  );
}

function PrepStage({
  questionCount,
  setQuestionCount,
  onStart,
  generating,
}: {
  questionCount: number;
  setQuestionCount: (n: number) => void;
  onStart: () => void;
  generating: boolean;
}) {
  return (
    <div className="bg-white rounded-2xl shadow p-6 space-y-6">
      <p className="text-gray-700">
        Zayıf konularından ve yeni konulardan karma sorular gelecek.
      </p>

      <div>
        <div className="text-sm font-medium text-gray-700 mb-2">
          Soru sayısı
        </div>
        <div className="flex gap-2">
          {QUESTION_COUNTS.map((n) => {
            const active = questionCount === n;
            return (
              <button
                key={n}
                type="button"
                onClick={() => setQuestionCount(n)}
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

      <button
        type="button"
        onClick={onStart}
        disabled={generating}
        className="w-full bg-blue-600 hover:bg-blue-700 text-white rounded-xl py-4 text-lg font-semibold disabled:opacity-50"
      >
        {generating ? 'Test hazırlanıyor...' : 'Testi Başlat'}
      </button>
    </div>
  );
}

function SolvingStage({
  questions,
  answers,
  setAnswers,
  onSubmit,
  submitting,
  warnMsg,
}: {
  questions: Question[];
  answers: Record<number, string>;
  setAnswers: React.Dispatch<React.SetStateAction<Record<number, string>>>;
  onSubmit: () => void;
  submitting: boolean;
  warnMsg: string | null;
}) {
  return (
    <div className="space-y-4">
      {questions.map((q) => (
        <div key={q.no} className="bg-white rounded-2xl shadow p-5 space-y-3">
          <div className="flex items-center justify-between gap-2">
            <div className="text-sm font-semibold text-blue-600">
              Soru {q.no} — {TYPE_LABEL[q.type]}
            </div>
            <span className="text-[10px] uppercase tracking-wide bg-gray-100 text-gray-600 rounded-full px-2 py-0.5">
              {q.topic_code}
            </span>
          </div>

          <div className="text-lg text-gray-900 whitespace-pre-wrap leading-relaxed">
            {q.question}
          </div>

          {q.context_tr && (
            <div className="text-sm italic text-gray-500">{q.context_tr}</div>
          )}

          {q.type === 'multiple_choice' && Array.isArray(q.options) ? (
            <div className="space-y-2 pt-1">
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
          ) : (
            <input
              type="text"
              value={answers[q.no] ?? ''}
              onChange={(e) =>
                setAnswers((prev) => ({ ...prev, [q.no]: e.target.value }))
              }
              disabled={submitting}
              placeholder="Cevabını yaz..."
              className="w-full border rounded-xl px-4 py-3 focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:bg-gray-100"
            />
          )}
        </div>
      ))}

      {warnMsg && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 text-amber-800 px-4 py-3 text-sm">
          {warnMsg}
        </div>
      )}

      <button
        type="button"
        onClick={onSubmit}
        disabled={submitting}
        className="w-full bg-blue-600 hover:bg-blue-700 text-white rounded-xl py-4 text-lg font-semibold disabled:opacity-50"
      >
        {submitting ? 'Puanlanıyor...' : 'Cevapları Gönder'}
      </button>
    </div>
  );
}

function ResultStage({
  result,
  onNewTest,
}: {
  result: SubmitResponse;
  onNewTest: () => void;
}) {
  const pct = result.total > 0
    ? Math.round((result.score / result.total) * 100)
    : 0;

  return (
    <div className="space-y-4">
      <div className="bg-white rounded-2xl shadow p-6 text-center space-y-1">
        <div className="text-4xl font-bold text-blue-600">
          {result.score} / {result.total} doğru
        </div>
        <div className="text-gray-500">%{pct} başarı</div>
      </div>

      {renderTopicSummary(result.topic_summary)}

      <div className="space-y-3">
        {result.results.map((r) => {
          const ok = r.correct;
          return (
            <div
              key={r.no}
              className={`rounded-2xl shadow p-5 space-y-3 border ${
                ok
                  ? 'bg-green-50 border-green-200'
                  : 'bg-red-50 border-red-200'
              }`}
            >
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2 text-sm font-semibold">
                  <span
                    className={`inline-flex items-center justify-center w-6 h-6 rounded-full text-white text-xs ${
                      ok ? 'bg-green-600' : 'bg-red-600'
                    }`}
                  >
                    {ok ? '✓' : '✗'}
                  </span>
                  <span className={ok ? 'text-green-700' : 'text-red-700'}>
                    Soru {r.no} — {TYPE_LABEL[r.type]}
                  </span>
                </div>
                <span className="text-[10px] uppercase tracking-wide bg-white/70 text-gray-600 rounded-full px-2 py-0.5 border">
                  {r.topic_code}
                </span>
              </div>

              <div className="text-gray-900 whitespace-pre-wrap">
                {r.question}
              </div>

              <div className="text-sm space-y-1">
                <div>
                  <span className="text-gray-500">Senin cevabın: </span>
                  <span
                    className={
                      ok
                        ? 'text-green-800 font-medium'
                        : 'text-red-800 font-medium'
                    }
                  >
                    {r.user_answer?.trim() ? r.user_answer : '(boş)'}
                  </span>
                </div>
                {!ok && (
                  <div>
                    <span className="text-gray-500">Doğru cevap: </span>
                    <span className="text-green-800 font-semibold">
                      {r.correct_answer}
                    </span>
                  </div>
                )}
              </div>

              {r.explanation_tr && (
                <div className="text-sm bg-white/70 rounded-lg p-3 text-gray-700 border">
                  {r.explanation_tr}
                </div>
              )}
            </div>
          );
        })}
      </div>

      <div className="flex flex-col sm:flex-row gap-3 pt-2">
        <button
          type="button"
          onClick={onNewTest}
          className="flex-1 bg-blue-600 hover:bg-blue-700 text-white rounded-xl py-3 font-semibold"
        >
          Yeni Test
        </button>
        <Link
          href="/"
          className="flex-1 text-center bg-white hover:bg-gray-100 text-gray-800 border rounded-xl py-3 font-semibold"
        >
          Sohbete Dön
        </Link>
      </div>
    </div>
  );
}

function renderTopicSummary(summary: SubmitResponse['topic_summary']) {
  if (!summary) return null;

  const weakest = summary.weakest ?? [];
  const entries = Object.entries(summary.by_topic ?? {});
  if (weakest.length === 0 && entries.length === 0) return null;

  return (
    <div className="bg-blue-50 border border-blue-200 rounded-2xl p-4 text-sm text-blue-900 space-y-3">
      {weakest.length > 0 && (
        <div>
          <span className="font-semibold">En çok zorlandığın konular: </span>
          {weakest.map(prettifyTopic).join(', ')}
        </div>
      )}

      {entries.length > 0 && (
        <ul className="space-y-2">
          {entries.map(([code, { correct, total }]) => {
            const pct = total > 0 ? Math.round((correct / total) * 100) : 0;
            return (
              <li key={code} className="space-y-1">
                <div className="flex items-baseline justify-between gap-3">
                  <span className="font-medium">{prettifyTopic(code)}</span>
                  <span className="text-blue-800/80 text-xs tabular-nums">
                    {correct}/{total} doğru
                  </span>
                </div>
                <div className="h-2 rounded-full bg-blue-100 overflow-hidden">
                  <div
                    className="h-full bg-blue-600"
                    style={{ width: `${pct}%` }}
                  />
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

function prettifyTopic(code: string): string {
  if (!code) return code;
  const spaced = code.replace(/_/g, ' ');
  return spaced.charAt(0).toUpperCase() + spaced.slice(1);
}
