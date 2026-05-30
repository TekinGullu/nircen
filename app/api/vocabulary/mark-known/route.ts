import { NextRequest, NextResponse } from 'next/server';

export async function POST(req: NextRequest) {
  try {
    const url = process.env.N8N_VOCAB_MARK_KNOWN_URL;
    const secret = process.env.N8N_SECRET;
    if (!url || !secret) {
      console.error('[vocab/mark-known] Missing env', {
        hasUrl: !!url,
        hasSecret: !!secret,
      });
      return NextResponse.json(
        { error: 'Server misconfigured: env missing' },
        { status: 500 }
      );
    }

    const { user_id, word_id } = await req.json();

    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ secret, user_id, word_id }),
    });

    if (!response.ok) {
      const detail = await response.text().catch(() => '');
      console.error('[vocab/mark-known] Upstream error', {
        status: response.status,
        detail,
      });
      return NextResponse.json(
        { error: 'Webhook error', status: response.status, detail },
        { status: 502 }
      );
    }

    const data = await response.json();
    return NextResponse.json(data);
  } catch (error) {
    console.error('[vocab/mark-known] Exception', error);
    return NextResponse.json(
      { error: 'Request failed', detail: String(error) },
      { status: 500 }
    );
  }
}
