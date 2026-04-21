import { NextResponse } from 'next/server';
export async function POST(request) {
  try {
    const { image, mimeType } = await request.json();
    if (!image) return NextResponse.json({ error: 'No image' }, { status: 400 });
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) return NextResponse.json({ error: 'API key not configured' }, { status: 500 });
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-api-key': apiKey, 'anthropic-version': '2023-06-01' },
      body: JSON.stringify({
        model: 'claude-sonnet-4-20250514', max_tokens: 1500,
        messages: [{ role: 'user', content: [
          { type: 'image', source: { type: 'base64', media_type: mimeType || 'image/jpeg', data: image } },
          { type: 'text', text: 'Analiza esta imagen de una factura de compra de una fiambrería/almacén argentino. Extraé los datos en formato JSON puro sin backticks. Estructura: {"supplier":"","invoiceNum":"","items":[{"name":"","quantity":1,"unit":"kg","unitCost":0}]}. unit: kg/g/und/lt. Respondé SOLO el JSON.' }
        ]}]
      }),
    });
    if (!response.ok) return NextResponse.json({ error: 'Error processing image' }, { status: 500 });
    const data = await response.json();
    const text = (data.content||[]).filter(b=>b.type==='text').map(b=>b.text).join('');
    return NextResponse.json(JSON.parse(text.replace(/```json\s?|```/g,'').trim()));
  } catch (error) { return NextResponse.json({ error: error.message }, { status: 500 }); }
}
