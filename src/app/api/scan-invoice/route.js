import { NextResponse } from 'next/server';

export async function POST(request) {
  try {
    const { image, mimeType, prompt } = await request.json();
    if (!image) return NextResponse.json({ error: 'No image' }, { status: 400 });
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) return NextResponse.json({ error: 'API key not configured' }, { status: 500 });

    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-api-key': apiKey, 'anthropic-version': '2023-06-01' },
      body: JSON.stringify({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 1500,
        messages: [{
          role: 'user',
          content: [
            { type: 'image', source: { type: 'base64', media_type: mimeType || 'image/jpeg', data: image } },
            { type: 'text', text: prompt || `Analiza esta imagen de una factura de compra de una fiambrería/almacén argentino. Extraé los datos en formato JSON puro sin backticks ni texto adicional. El JSON debe tener esta estructura exacta:
{
  "supplier": "nombre del proveedor",
  "invoiceNum": "número de factura",
  "items": [
    { "name": "nombre del artículo", "quantity": 1.0, "unit": "kg", "unitCost": 1500.00 }
  ]
}
Reglas:
- "unit" debe ser uno de: "kg", "g", "und", "lt"
- Si no podés determinar un campo, usá "" para textos y 0 para números
- Los precios deben ser numéricos sin signo de pesos
- Si hay un precio total por item pero no unitario, calculá el unitario dividiendo por la cantidad
- Incluí TODOS los artículos que puedas identificar
- Respondé SOLO con el JSON` }
          ]
        }]
      }),
    });
    if (!response.ok) return NextResponse.json({ error: 'Error processing image' }, { status: 500 });
    const data = await response.json();
    const text = (data.content || []).filter(b => b.type === 'text').map(b => b.text).join('');
    const cleaned = text.replace(/```json\s?|```/g, '').trim();
    return NextResponse.json(JSON.parse(cleaned));
  } catch (error) {
    console.error('Scan error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
