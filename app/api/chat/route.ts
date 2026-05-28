import { NextRequest, NextResponse } from 'next/server';

export async function POST(req: NextRequest) {
  try {
    const { user_id, first_name, message } = await req.json();

    const response = await fetch(process.env.N8N_WEBHOOK_URL!, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        secret: process.env.N8N_SECRET,
        user_id,
        first_name,
        message,
      }),
    });

    if (!response.ok) {
      return NextResponse.json(
        { error: 'Webhook error', status: response.status },
        { status: 500 }
      );
    }

    const data = await response.json();
    return NextResponse.json(data);
  } catch (error) {
    return NextResponse.json(
      { error: 'Request failed', detail: String(error) },
      { status: 500 }
    );
  }
}