import { NextResponse } from 'next/server';
export async function POST(request) {
  try {
    const { prompt, dataContext, messages, system } = await request.json();
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) return NextResponse.json({ error: 'API key not configured' }, { status: 500 });

    const apiMessages = messages
      ? messages
      : [{ role: 'user', content: `${prompt}\n\n${dataContext}\n\nResponde en español argentino, directo y práctico. Viñetas y secciones claras. Sin markdown. Específico con nombres y números reales.` }];

    const body = {
      model: 'claude-haiku-4-5',
      max_tokens: messages ? 1000 : 1500,
      messages: apiMessages,
    };
    if (system) body.system = system;

    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-api-key': apiKey, 'anthropic-version': '2023-06-01' },
      body: JSON.stringify(body),
    });
    if (!response.ok) {
      const errData = await response.json().catch(() => ({}));
      return NextResponse.json({ error: errData?.error?.message || 'Error calling AI' }, { status: 500 });
    }
    const data = await response.json();
    return NextResponse.json({ text: (data.content || []).map(c => c.text || '').join('') });
  } catch (error) { return NextResponse.json({ error: error.message }, { status: 500 }); }
}
