function corsHeaders() {
  return {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
  };
}

export default {
  async fetch(request, env) {
    // CORS preflight
    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: corsHeaders() });
    }

    if (request.method !== "POST") {
      return new Response("Method Not Allowed", {
        status: 405,
        headers: corsHeaders(),
      });
    }

    let body;
    try {
      body = await request.json();
    } catch {
      return new Response(JSON.stringify({ error: "invalid json" }), {
        status: 400,
        headers: { "Content-Type": "application/json", ...corsHeaders() },
      });
    }

    const { image_data_url, filename } = body || {};

    if (!image_data_url) {
      return new Response(JSON.stringify({ error: "missing image_data_url" }), {
        status: 400,
        headers: { "Content-Type": "application/json", ...corsHeaders() },
      });
    }

    if (!env.OPENAI_API_KEY) {
      return new Response(
        JSON.stringify({ error: "missing OPENAI_API_KEY secret" }),
        {
          status: 500,
          headers: { "Content-Type": "application/json", ...corsHeaders() },
        },
      );
    }

    const prompt = `Mô tả ngắn gọn bức ảnh này bằng tiếng Việt (1-2 câu), sau đó liệt kê 5 từ khóa.
Nếu có tên ảnh: "${filename || ""}", hãy tận dụng để mô tả đúng hơn.`;

    const r = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${env.OPENAI_API_KEY}`,
      },
      body: JSON.stringify({
        model: "gpt-4.1-mini",
        input: [
          {
            role: "user",
            content: [
              { type: "input_text", text: prompt },
              { type: "input_image", image_url: image_data_url },
            ],
          },
        ],
      }),
    });

    const text = await r.text();

    if (!r.ok) {
      return new Response(text, {
        status: r.status,
        headers: { "Content-Type": "text/plain", ...corsHeaders() },
      });
    }

    let json;
    try {
      json = JSON.parse(text);
    } catch {
      return new Response(JSON.stringify({ error: "bad openai response" }), {
        status: 502,
        headers: { "Content-Type": "application/json", ...corsHeaders() },
      });
    }

    const description = (json.output_text || "").trim();

    return new Response(JSON.stringify({ description }), {
      headers: { "Content-Type": "application/json", ...corsHeaders() },
    });
  },
};
