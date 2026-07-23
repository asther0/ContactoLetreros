import OpenAI from "openai";

export const runtime = "nodejs";

type Extraction = {
  operation: "alquiler" | "venta" | null;
  phoneNumbers: string[];
  propertyType: string | null;
  confidence: "high" | "medium" | "low";
};

const extractionPrompt = `Examina este letrero inmobiliario. Devuelve solo JSON válido con exactamente estas claves: operation ("alquiler" | "venta" | null), phone_numbers (array de strings, solo dígitos que puedas leer con confianza), advertised_property (string | null), visible_text (string con todo el texto legible), confidence ("high" | "medium" | "low"). No inventes dígitos. Si un número es ambiguo, omítelo.`;

function phoneNumbersFromText(text: string) {
  const matches = text.match(/(?:\+?51[\s.-]?)?9\d{2}[\s.-]?\d{3}[\s.-]?\d{3}/g) ?? [];
  return matches.map((phone) => phone.replace(/\D/g, "").replace(/^51(?=9\d{8}$)/, ""));
}

function parseExtraction(text: string): Extraction {
  const cleaned = text.replace(/^```json\s*|\s*```$/g, "").trim();
  const parsed = JSON.parse(cleaned) as {
    operation?: Extraction["operation"];
    phone_numbers?: unknown;
    advertised_property?: unknown;
    visible_text?: unknown;
    confidence?: Extraction["confidence"];
  };

  const modelPhones = Array.isArray(parsed.phone_numbers)
    ? parsed.phone_numbers
        .filter((phone): phone is string => typeof phone === "string")
        .map((phone) => phone.replace(/\D/g, ""))
        .filter((phone) => phone.length >= 7 && phone.length <= 15)
    : [];
  const visibleText = typeof parsed.visible_text === "string" ? parsed.visible_text : "";
  const phoneNumbers = [...new Set([...modelPhones, ...phoneNumbersFromText(visibleText)])];

  return {
    operation: parsed.operation === "alquiler" || parsed.operation === "venta" ? parsed.operation : null,
    phoneNumbers,
    propertyType: typeof parsed.advertised_property === "string" ? parsed.advertised_property : null,
    confidence: parsed.confidence === "high" || parsed.confidence === "medium" ? parsed.confidence : "low",
  };
}

export async function POST(request: Request) {
  if (!process.env.OPENAI_API_KEY) {
    return Response.json({ error: "Falta configurar OPENAI_API_KEY en el servidor." }, { status: 500 });
  }

  const formData = await request.formData();
  const photo = formData.get("photo");

  if (!(photo instanceof File) || !photo.type.startsWith("image/")) {
    return Response.json({ error: "Envía una foto válida del letrero." }, { status: 400 });
  }

  if (photo.size > 10 * 1024 * 1024) {
    return Response.json({ error: "La foto debe pesar menos de 10 MB." }, { status: 400 });
  }

  try {
    const imageBase64 = Buffer.from(await photo.arrayBuffer()).toString("base64");
    const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
    const response = await client.responses.create({
      model: "gpt-5-mini",
      input: [
        {
          role: "user",
          content: [
            { type: "input_text", text: extractionPrompt },
            {
              type: "input_image",
              image_url: `data:${photo.type};base64,${imageBase64}`,
              detail: "high",
            },
          ],
        },
      ],
    });

    return Response.json(parseExtraction(response.output_text));
  } catch (error) {
    console.error("No se pudo extraer el letrero", error);
    return Response.json(
      { error: "No pudimos leer el letrero. Puedes completar los datos manualmente." },
      { status: 502 },
    );
  }
}
