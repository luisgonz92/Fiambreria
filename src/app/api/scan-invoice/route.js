import { NextResponse } from 'next/server';

export async function POST(request) {
  try {
    const { image, mimeType } = await request.json();

    if (!image) {
      return NextResponse.json({ error: 'No image provided' }, { status: 400 });
    }

    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      return NextResponse.json({ error: 'API key not configured' }, { status: 500 });
    }

    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 2000,
        messages: [
          {
            role: 'user',
            content: [
              {
                type: 'image',
                source: {
                  type: 'base64',
                  media_type: mimeType || 'image/jpeg',
                  data: image,
                },
              },
              {
                type: 'text',
                text: `Analizá esta factura/recibo de compra de una fiambrería/almacén y extraé la siguiente información en formato JSON puro (sin markdown, sin backticks, solo el JSON):

{
  "supplier": "nombre del proveedor o tienda",
  "invoiceNumber": "número de factura si es visible, o vacío",
  "items": [
    {
      "name": "nombre del producto",
      "quantity": 1,
      "unit": "kg",
      "unitCost": 0.00
    }
  ]
}

Reglas:
- "unit" debe ser uno de: "kg", "g", "und", "lt"
- Si no podés determinar la unidad, usá "und"
- Si no podés determinar la cantidad, poné 1
- El precio debe ser el precio unitario de compra
- Si un producto aparece con precio total y cantidad, calculá el precio unitario
- Devolvé SOLO el JSON, nada más`
              },
            ],
          },
        ],
      }),
    });

    if (!response.ok) {
      const errorData = await response.text();
      console.error('Anthropic API error:', errorData);
      return NextResponse.json({ error: 'Error processing image' }, { status: 500 });
    }

    const data = await response.json();
    const text = data.content
      .filter((block) => block.type === 'text')
      .map((block) => block.text)
      .join('');

    // Parse the JSON response, handling potential markdown fences
    const cleaned = text.replace(/```json\s?|```/g, '').trim();
    const parsed = JSON.parse(cleaned);

    return NextResponse.json(parsed);
  } catch (error) {
    console.error('Scan invoice error:', error);
    return NextResponse.json({ error: 'Failed to process invoice: ' + error.message }, { status: 500 });
  }
}
