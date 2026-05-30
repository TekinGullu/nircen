'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import type { User } from '@supabase/supabase-js';
import {
  ResponsiveContainer,
  LineChart,
  Line,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
} from 'recharts';
import { createClient } from '@/lib/supabase/client';

type Durum = 'guclu' | 'ogreniliyor' | 'zayif' | 'yetersiz_veri';

type GrammarTopic = {
  topic_code: string;
  topic_name: string;
  category: string;
  times_correct: number;
  times_wrong: number;
  total_attempts: number;
  mastery_score: number;
  next_review: string | null;
  durum: Durum;
};

type RecentTest = {
  id: number;
  score: number;
  total: number;
  completed_at: string;
};

type ErrorTopic = {
  topic_code: string;
  error_count: number;
};

type DueReview = {
  topic_name: string;
  topic_code: string;
  mastery_score: number;
  next_review: string | null;
  days_overdue: number;
};

type DashboardData = {
  user: {
    id: number;
    first_name: string;
    last_active: string | null;
    created_at: string | null;
  };
  vocabulary: {
    total_words: number;
    mastered_words: number;
    learning_words: number;
  };
  grammar_summary: {
    guclu: number;
    ogreniliyor: number;
    zayif: number;
    yetersiz_veri: number;
    avg_mastery_evaluable: number | null;
  };
  grammar_topics: GrammarTopic[];
  test_stats: {
    total_tests: number;
    total_correct: number;
    total_questions: number;
  };
  recent_tests: RecentTest[];
  errors: {
    total_errors: number;
    top_error_topics: ErrorTopic[];
  };
  due_review: DueReview[];
  streak: {
    active_days_30d: number;
  };
};

export default function DashboardPage() {
  const router = useRouter();
  const supabase = createClient();

  const [user, setUser] = useState<User | null>(null);
  const [checkingAuth, setCheckingAuth] = useState(true);
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

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
      setLoading(true);
      try {
        const res = await fetch('/api/dashboard', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ user_id: user.id }),
        });
        if (!active) return;
        if (!res.ok) {
          const body = await res.json().catch(() => null);
          const detail = body?.error
            ? `${body.error}${body.status ? ` (${body.status})` : ''}`
            : '';
          setErrorMsg(
            `Dashboard verisi yüklenemedi.${detail ? ` — ${detail}` : ''}`
          );
          return;
        }
        const raw = (await res.json()) as
          | DashboardData
          | { dashboard_data?: DashboardData };
        const normalized =
          (raw && 'dashboard_data' in raw && raw.dashboard_data
            ? raw.dashboard_data
            : (raw as DashboardData));
        console.log('[dashboard] raw response:', raw);
        console.log('[dashboard] vocabulary:', normalized?.vocabulary);
        setData(normalized);
      } catch {
        if (active) setErrorMsg('Bağlantı hatası. Tekrar dene.');
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => {
      active = false;
    };
  }, [router, supabase]);

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
        <div className="max-w-6xl mx-auto p-4 flex items-center justify-between gap-3">
          <div className="min-w-0">
            <h1 className="text-xl font-bold">📊 İlerleme Dashboard&apos;u</h1>
            <p className="text-sm text-blue-100 truncate">{user?.email}</p>
          </div>
          <div className="shrink-0 flex items-center gap-2">
            <Link
              href="/"
              className="text-sm bg-blue-700 hover:bg-blue-800 rounded-full px-3 py-1.5"
            >
              ← Sohbete dön
            </Link>
            <Link
              href="/test"
              className="text-sm bg-blue-700 hover:bg-blue-800 rounded-full px-3 py-1.5"
            >
              Test
            </Link>
          </div>
        </div>
      </header>

      <main className="max-w-6xl mx-auto p-4 space-y-6">
        {errorMsg && (
          <div className="rounded-lg border border-red-200 bg-red-50 text-red-700 px-4 py-3 text-sm">
            {errorMsg}
          </div>
        )}

        {loading && !data && <DashboardSkeleton />}

        {data && (
          <>
            <SummaryCards data={data} />
            <GrammarStatus topics={data.grammar_topics ?? []} />
            <ChartsRow
              recentTests={data.recent_tests ?? []}
              topErrors={data.errors?.top_error_topics ?? []}
            />
            <DueReviewCard items={data.due_review ?? []} />
            <RecentTestsList tests={data.recent_tests ?? []} />
          </>
        )}
      </main>
    </div>
  );
}

function DashboardSkeleton() {
  return (
    <div className="space-y-6 animate-pulse">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="h-32 bg-white rounded-2xl shadow" />
        ))}
      </div>
      <div className="grid md:grid-cols-3 gap-4">
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="h-64 bg-white rounded-2xl shadow" />
        ))}
      </div>
      <div className="grid md:grid-cols-2 gap-4">
        <div className="h-72 bg-white rounded-2xl shadow" />
        <div className="h-72 bg-white rounded-2xl shadow" />
      </div>
    </div>
  );
}

function SummaryCards({ data }: { data: DashboardData }) {
  const vocab = data.vocabulary ?? { total_words: 0, mastered_words: 0, learning_words: 0 };
  const vocabPct =
    vocab.total_words > 0
      ? Math.round((vocab.mastered_words / vocab.total_words) * 100)
      : 0;

  const avg = data.grammar_summary?.avg_mastery_evaluable;
  const avgColor =
    avg == null
      ? 'text-gray-400'
      : avg >= 60
        ? 'text-green-600'
        : avg >= 30
          ? 'text-yellow-600'
          : 'text-red-600';

  const ts = data.test_stats ?? { total_tests: 0, total_correct: 0, total_questions: 0 };
  const successPct =
    ts.total_questions > 0
      ? Math.round((ts.total_correct / ts.total_questions) * 100)
      : 0;

  const streakDays = data.streak?.active_days_30d ?? 0;

  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
      <Card title="Kelime Hazinesi" icon="📚">
        <div className="text-3xl font-bold text-blue-600">
          {vocab.mastered_words}
        </div>
        <div className="text-sm text-gray-500">öğrenildi</div>
        <div className="mt-2 text-xs text-gray-500 space-y-0.5 tabular-nums">
          <div>
            <span className="text-amber-700">Öğreniliyor:</span>{' '}
            {vocab.learning_words}
          </div>
          <div>
            <span className="text-gray-600">Toplam:</span> {vocab.total_words}
          </div>
        </div>
        <div className="mt-3 h-2 rounded-full bg-blue-100 overflow-hidden">
          <div
            className="h-full bg-blue-600 transition-all"
            style={{ width: `${vocabPct}%` }}
          />
        </div>
      </Card>

      <Card title="Gramer Skoru" icon="🎯">
        <div className={`text-3xl font-bold ${avgColor}`}>
          {avg == null ? '—' : avg.toFixed(1)}
        </div>
        <div className="text-sm text-gray-500">
          {avg == null ? 'Henüz yeterli veri yok' : '/ 100'}
        </div>
      </Card>

      <Card title="Toplam Test" icon="📝">
        <div className="text-3xl font-bold text-blue-600">{ts.total_tests}</div>
        <div className="text-sm text-gray-500">Başarı: %{successPct}</div>
      </Card>

      <Card title="Bu Ay Aktif" icon="🔥">
        <div className="text-3xl font-bold text-blue-600">{streakDays}</div>
        <div className="text-sm text-gray-500">/ 30 gün</div>
      </Card>
    </div>
  );
}

function Card({
  title,
  icon,
  children,
}: {
  title: string;
  icon: string;
  children: React.ReactNode;
}) {
  return (
    <div className="bg-white rounded-2xl shadow p-4 space-y-1">
      <div className="flex items-center gap-2 text-sm text-gray-500">
        <span aria-hidden>{icon}</span>
        <span className="font-medium">{title}</span>
      </div>
      {children}
    </div>
  );
}

function GrammarStatus({ topics }: { topics: GrammarTopic[] }) {
  const groups: Record<Durum, GrammarTopic[]> = {
    guclu: [],
    ogreniliyor: [],
    zayif: [],
    yetersiz_veri: [],
  };
  for (const t of topics) {
    if (t?.durum && groups[t.durum]) groups[t.durum].push(t);
  }

  return (
    <section className="space-y-4">
      <h2 className="text-lg font-semibold text-gray-800">Gramer Konuları</h2>

      <div className="grid md:grid-cols-3 gap-4">
        <GrammarColumn
          title="Güçlü"
          color="green"
          emoji="🟢"
          items={groups.guclu}
        />
        <GrammarColumn
          title="Öğreniliyor"
          color="yellow"
          emoji="🟡"
          items={groups.ogreniliyor}
        />
        <GrammarColumn
          title="Zayıf"
          color="red"
          emoji="🔴"
          items={groups.zayif}
        />
      </div>

      <div className="bg-white rounded-2xl shadow p-4 space-y-3">
        <div className="flex items-center justify-between gap-3">
          <h3 className="font-semibold text-gray-700">
            ⚪ Yetersiz Veri{' '}
            <span className="text-gray-400 font-normal">
              ({groups.yetersiz_veri.length})
            </span>
          </h3>
        </div>
        <p className="text-xs text-gray-500">
          Bu konularda en az 3 deneme yapınca güvenilir bir mastery skoru olacak.
        </p>
        {groups.yetersiz_veri.length === 0 ? (
          <div className="text-sm text-gray-400">Henüz konu yok</div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {groups.yetersiz_veri.map((t) => (
              <TopicCard key={t.topic_code} topic={t} color="gray" />
            ))}
          </div>
        )}
      </div>
    </section>
  );
}

function GrammarColumn({
  title,
  color,
  emoji,
  items,
}: {
  title: string;
  color: 'green' | 'yellow' | 'red';
  emoji: string;
  items: GrammarTopic[];
}) {
  const headerColor =
    color === 'green'
      ? 'text-green-700'
      : color === 'yellow'
        ? 'text-yellow-700'
        : 'text-red-700';

  return (
    <div className="bg-white rounded-2xl shadow p-4 space-y-3">
      <div className={`font-semibold ${headerColor}`}>
        {emoji} {title}{' '}
        <span className="text-gray-400 font-normal">({items.length})</span>
      </div>
      {items.length === 0 ? (
        <div className="text-sm text-gray-400">Henüz konu yok</div>
      ) : (
        <div className="space-y-3">
          {items.map((t) => (
            <TopicCard key={t.topic_code} topic={t} color={color} />
          ))}
        </div>
      )}
    </div>
  );
}

function TopicCard({
  topic,
  color,
}: {
  topic: GrammarTopic;
  color: 'green' | 'yellow' | 'red' | 'gray';
}) {
  const total = topic.total_attempts ?? 0;
  const correct = topic.times_correct ?? 0;
  const wrong = topic.times_wrong ?? 0;
  const correctPct = total > 0 ? (correct / total) * 100 : 0;
  const wrongPct = total > 0 ? (wrong / total) * 100 : 0;

  const badgeColor =
    color === 'green'
      ? 'bg-green-100 text-green-800'
      : color === 'yellow'
        ? 'bg-yellow-100 text-yellow-800'
        : color === 'red'
          ? 'bg-red-100 text-red-800'
          : 'bg-gray-100 text-gray-700';

  return (
    <div className="border border-gray-100 rounded-xl p-3 space-y-2 bg-gray-50/50">
      <div className="flex items-start justify-between gap-2">
        <div className="font-medium text-gray-800 text-sm">
          {topic.topic_name}
        </div>
        <span className={`text-[10px] uppercase tracking-wide rounded-full px-2 py-0.5 ${badgeColor}`}>
          {topic.mastery_score?.toFixed(0) ?? '—'}
        </span>
      </div>

      {topic.category && (
        <div className="inline-block text-[10px] uppercase tracking-wide bg-white border text-gray-500 rounded-full px-2 py-0.5">
          {topic.category}
        </div>
      )}

      <div className="flex h-2 rounded-full overflow-hidden bg-gray-200">
        <div
          className="bg-green-500"
          style={{ width: `${correctPct}%` }}
        />
        <div
          className="bg-red-400"
          style={{ width: `${wrongPct}%` }}
        />
      </div>

      <div className="text-xs text-gray-500 tabular-nums">
        {correct} doğru / {total} deneme
      </div>
    </div>
  );
}

function ChartsRow({
  recentTests,
  topErrors,
}: {
  recentTests: RecentTest[];
  topErrors: ErrorTopic[];
}) {
  const lineData = [...recentTests]
    .filter((t) => t?.completed_at)
    .sort(
      (a, b) =>
        new Date(a.completed_at).getTime() - new Date(b.completed_at).getTime()
    )
    .map((t, i) => ({
      idx: i + 1,
      pct: t.total > 0 ? Math.round((t.score / t.total) * 100) : 0,
      label: formatShortDate(t.completed_at),
      score: t.score,
      total: t.total,
    }));

  const barData = topErrors.map((e) => ({
    topic: e.topic_code,
    errors: e.error_count,
  }));

  return (
    <section className="grid md:grid-cols-2 gap-4">
      <div className="bg-white rounded-2xl shadow p-4 space-y-3">
        <h3 className="font-semibold text-gray-700">Test Geçmişi</h3>
        {lineData.length === 0 ? (
          <EmptyChart text="Henüz test yok" />
        ) : (
          <ResponsiveContainer width="100%" height={260}>
            <LineChart data={lineData} margin={{ top: 10, right: 20, bottom: 0, left: -10 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
              <XAxis dataKey="idx" stroke="#9ca3af" fontSize={12} />
              <YAxis domain={[0, 100]} stroke="#9ca3af" fontSize={12} />
              <Tooltip
                contentStyle={{ fontSize: 12, borderRadius: 8 }}
                formatter={(_v, _n, ctx) => {
                  const p = ctx?.payload as
                    | { score: number; total: number; pct: number }
                    | undefined;
                  if (!p) return ['', ''];
                  return [`${p.score}/${p.total} (%${p.pct})`, 'Puan'];
                }}
                labelFormatter={(_l, payload) => {
                  const p = payload?.[0]?.payload as
                    | { label: string }
                    | undefined;
                  return p?.label ?? '';
                }}
              />
              <Line
                type="monotone"
                dataKey="pct"
                stroke="#2563eb"
                strokeWidth={2}
                dot={{ r: 4 }}
              />
            </LineChart>
          </ResponsiveContainer>
        )}
      </div>

      <div className="bg-white rounded-2xl shadow p-4 space-y-3">
        <h3 className="font-semibold text-gray-700">
          En Çok Hata Yapılan Konular
        </h3>
        {barData.length === 0 ? (
          <EmptyChart text="Henüz hata yok" />
        ) : (
          <ResponsiveContainer width="100%" height={260}>
            <BarChart data={barData} margin={{ top: 10, right: 20, bottom: 0, left: -10 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
              <XAxis
                dataKey="topic"
                stroke="#9ca3af"
                fontSize={11}
                interval={0}
                tickFormatter={(t) => String(t).replace(/_/g, ' ')}
              />
              <YAxis allowDecimals={false} stroke="#9ca3af" fontSize={12} />
              <Tooltip contentStyle={{ fontSize: 12, borderRadius: 8 }} />
              <Bar dataKey="errors" fill="#dc2626" radius={[6, 6, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        )}
      </div>
    </section>
  );
}

function EmptyChart({ text }: { text: string }) {
  return (
    <div className="h-[260px] flex items-center justify-center text-sm text-gray-400">
      {text}
    </div>
  );
}

function DueReviewCard({ items }: { items: DueReview[] }) {
  return (
    <section className="bg-white rounded-2xl shadow p-4 space-y-3">
      <h3 className="font-semibold text-gray-700">⏰ Tekrar Etmen Gerekenler</h3>

      {items.length === 0 ? (
        <div className="text-sm text-gray-500">
          Şu an tekrar edilecek konu yok ✓
        </div>
      ) : (
        <>
          <div className="rounded-lg border border-amber-200 bg-amber-50 text-amber-800 px-3 py-2 text-sm">
            {items.length} konu seni bekliyor
          </div>
          <ul className="divide-y divide-gray-100">
            {items.map((item) => (
              <li
                key={item.topic_code}
                className="py-2 flex items-center justify-between gap-3"
              >
                <div className="min-w-0">
                  <div className="font-medium text-gray-800 truncate">
                    {item.topic_name}
                  </div>
                  <div className="text-xs text-gray-500">
                    {item.days_overdue > 0
                      ? `${item.days_overdue} gündür bekliyor`
                      : 'Bugün'}
                  </div>
                </div>
                <span className="shrink-0 text-[10px] uppercase tracking-wide bg-gray-100 text-gray-700 rounded-full px-2 py-0.5 tabular-nums">
                  {item.mastery_score?.toFixed(0) ?? '—'}
                </span>
              </li>
            ))}
          </ul>
          <Link
            href="/test"
            className="block text-center bg-blue-600 hover:bg-blue-700 text-white rounded-xl py-2.5 font-semibold"
          >
            Hemen Test Çöz
          </Link>
        </>
      )}
    </section>
  );
}

function RecentTestsList({ tests }: { tests: RecentTest[] }) {
  const sorted = [...tests]
    .filter((t) => t?.completed_at)
    .sort(
      (a, b) =>
        new Date(b.completed_at).getTime() - new Date(a.completed_at).getTime()
    )
    .slice(0, 10);

  return (
    <section className="bg-white rounded-2xl shadow p-4 space-y-3">
      <h3 className="font-semibold text-gray-700">Son Testler</h3>

      {sorted.length === 0 ? (
        <div className="text-sm text-gray-400">Henüz test yok</div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-gray-500 border-b">
                <th className="py-2 pr-4 font-medium">Tarih</th>
                <th className="py-2 pr-4 font-medium">Puan</th>
                <th className="py-2 font-medium">Başarı</th>
              </tr>
            </thead>
            <tbody>
              {sorted.map((t) => {
                const pct =
                  t.total > 0 ? Math.round((t.score / t.total) * 100) : 0;
                return (
                  <tr key={t.id} className="border-b border-gray-100 last:border-0">
                    <td className="py-2 pr-4 text-gray-700">
                      {formatDateTr(t.completed_at)}
                    </td>
                    <td className="py-2 pr-4 tabular-nums text-gray-800">
                      {t.score} / {t.total}
                    </td>
                    <td className="py-2 tabular-nums text-gray-700">%{pct}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

const MONTHS_TR = [
  'Oca',
  'Şub',
  'Mar',
  'Nis',
  'May',
  'Haz',
  'Tem',
  'Ağu',
  'Eyl',
  'Eki',
  'Kas',
  'Ara',
];

function formatDateTr(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  const day = d.getDate();
  const month = MONTHS_TR[d.getMonth()];
  const hh = String(d.getHours()).padStart(2, '0');
  const mm = String(d.getMinutes()).padStart(2, '0');
  return `${day} ${month}, ${hh}:${mm}`;
}

function formatShortDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  const day = d.getDate();
  const month = MONTHS_TR[d.getMonth()];
  return `${day} ${month}`;
}
