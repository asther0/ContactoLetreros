export const runtime = "nodejs";

const geocoderBaseUrl = process.env.GEOCODER_BASE_URL ?? "https://nominatim.openstreetmap.org";

function validCoordinate(value: string | null, minimum: number, maximum: number) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= minimum && parsed <= maximum ? parsed : null;
}

function text(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const latitude = validCoordinate(searchParams.get("lat"), -90, 90);
  const longitude = validCoordinate(searchParams.get("lon"), -180, 180);

  if (latitude === null || longitude === null) {
    return Response.json({ error: "INVALID_COORDINATES" }, { status: 400 });
  }

  const endpoint = new URL("/reverse", geocoderBaseUrl);
  endpoint.search = new URLSearchParams({
    format: "jsonv2",
    lat: latitude.toFixed(4),
    lon: longitude.toFixed(4),
    addressdetails: "1",
    zoom: "18",
    "accept-language": "es",
  }).toString();

  try {
    const response = await fetch(endpoint, {
      headers: { "User-Agent": "ContactoLetreros/0.1 (https://github.com/asther0/ContactoLetreros)" },
      signal: AbortSignal.timeout(4000),
    });

    if (response.status === 429) return Response.json({ error: "RATE_LIMITED" }, { status: 429 });
    if (!response.ok) return Response.json({ error: "GEOCODER_UNAVAILABLE" }, { status: 503 });

    const result = (await response.json()) as { address?: Record<string, unknown> };
    const address = result.address ?? {};
    const street = [text(address.road), text(address.house_number)].filter(Boolean).join(" ") || null;
    const district = text(address.city_district) ?? text(address.municipality) ?? text(address.borough) ?? text(address.suburb);
    const city = text(address.city) ?? text(address.town) ?? text(address.village);
    const label = [...new Set([street, district, city].filter((part): part is string => Boolean(part)))].join(", ") || district || city;

    return Response.json({
      location: {
        label,
        street,
        district,
        city,
        country: text(address.country),
        isApproximate: true,
      },
    });
  } catch {
    return Response.json({ error: "GEOCODER_UNAVAILABLE" }, { status: 503 });
  }
}
