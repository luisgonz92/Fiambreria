import { NextResponse } from 'next/server';
export async function POST(request) {
  try {
    const { prompt, dataContext } = await request.json();
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) return NextResponse.json({ error: 'API key not configured' }, { status: 500 });
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-api-key': apiKey, 'anthropic-version': '2023-06-01' },
      body: JSON.stringify({
        model: 'claude-sonnet-4-20250514', max_tokens: 1500,
        messages: [{ role: 'user', content: `${prompt}\n\n${dataContext}\n\nResponde en español argentino, directo y práctico. Viñetas y secciones claras. Sin markdown. Específico con nombres y números reales.` }]
      }),
    });
    if (!response.ok) return NextResponse.json({ error: 'Error calling AI' }, { status: 500 });
    const data = await response.json();
    return NextResponse.json({ text: (data.content||[]).map(c=>c.text||'').join('') });
  } catch (error) { return NextResponse.json({ error: error.message }, { status: 500 }); }
}
