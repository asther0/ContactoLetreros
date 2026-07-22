"use client";

import { ChangeEvent, useEffect, useMemo, useState } from "react";

type Operation = "alquiler" | "venta" | "";

type Hallazgo = {
  id: string;
  capturedAt: string;
  photoDataUrl: string;
  operation: Operation;
  propertyType: string;
  phones: string[];
  location: string;
  notes: string;
};

type Extraction = {
  operation: Exclude<Operation, ""> | null;
  phoneNumbers: string[];
  propertyType: string | null;
  confidence: "high" | "medium" | "low";
  notes: string;
};

const storageKey = "contacto-letreros-hallazgos";

function readFileAsDataUrl(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

function buildMessage(operation: Operation, location: string, propertyType: string) {
  const action = operation || "alquiler o venta";
  const property = propertyType ? ` de ${propertyType.toLowerCase()}` : "";
  const place = location ? ` cerca de ${location}` : " en la zona donde vi el letrero";
  return `Hola, vi su letrero de ${action}${property}${place}. ¿Sigue disponible? Me interesa recibir más información.`;
}

export default function Home() {
  const [photo, setPhoto] = useState<File | null>(null);
  const [photoDataUrl, setPhotoDataUrl] = useState("");
  const [operation, setOperation] = useState<Operation>("");
  const [propertyType, setPropertyType] = useState("");
  const [phones, setPhones] = useState<string[]>([]);
  const [location, setLocation] = useState("");
  const [notes, setNotes] = useState("");
  const [extracting, setExtracting] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [hallazgos, setHallazgos] = useState<Hallazgo[]>([]);

  useEffect(() => {
    const saved = window.localStorage.getItem(storageKey);
    if (saved) setHallazgos(JSON.parse(saved) as Hallazgo[]);
  }, []);

  const whatsappMessage = useMemo(
    () => buildMessage(operation, location, propertyType),
    [location, operation, propertyType],
  );

  function persistHallazgos(next: Hallazgo[]) {
    setHallazgos(next);
    window.localStorage.setItem(storageKey, JSON.stringify(next));
  }

  async function getLocation() {
    if (!navigator.geolocation) {
      setError("Este navegador no permite usar el GPS.");
      return;
    }

    navigator.geolocation.getCurrentPosition(
      ({ coords }) => setLocation(`${coords.latitude.toFixed(5)}, ${coords.longitude.toFixed(5)}`),
      () => setError("No pudimos obtener tu ubicación. Puedes escribirla después."),
      { enableHighAccuracy: true, timeout: 10000 },
    );
  }

  async function handlePhoto(event: ChangeEvent<HTMLInputElement>) {
    const selected = event.target.files?.[0];
    if (!selected) return;

    setError("");
    setMessage("");
    setPhoto(selected);
    setPhotoDataUrl(await readFileAsDataUrl(selected));
    void getLocation();
  }

  async function extract() {
    if (!photo) return;
    setExtracting(true);
    setError("");
    setMessage("");

    try {
      const body = new FormData();
      body.set("photo", photo);
      const response = await fetch("/api/extract", { method: "POST", body });
      const data = (await response.json()) as Extraction & { error?: string };
      if (!response.ok) throw new Error(data.error);

      setOperation(data.operation ?? "");
      setPropertyType(data.propertyType ?? "");
      setPhones(data.phoneNumbers);
      setNotes(data.notes);
      setMessage(`Lectura lista (${data.confidence === "high" ? "alta" : data.confidence === "medium" ? "media" : "baja"} confianza). Confirma los datos antes de contactar.`);
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "No pudimos leer la foto.");
    } finally {
      setExtracting(false);
    }
  }

  function saveHallazgo() {
    if (!photoDataUrl) {
      setError("Toma o sube una foto antes de guardar.");
      return;
    }

    const hallazgo: Hallazgo = {
      id: crypto.randomUUID(),
      capturedAt: new Date().toISOString(),
      photoDataUrl,
      operation,
      propertyType,
      phones,
      location,
      notes,
    };
    persistHallazgos([hallazgo, ...hallazgos]);
    setMessage("Hallazgo guardado en este dispositivo.");
  }

  function openWhatsApp(phone: string) {
    const normalizedPhone = phone.replace(/\D/g, "");
    if (!normalizedPhone) {
      setError("Escribe o confirma un teléfono antes de abrir WhatsApp.");
      return;
    }
    window.open(`https://wa.me/${normalizedPhone}?text=${encodeURIComponent(whatsappMessage)}`, "_blank", "noopener,noreferrer");
  }

  return (
    <main>
      <section className="hero">
        <p className="eyebrow">CAPTURA RÁPIDA</p>
        <h1>Contacto<br />Letreros</h1>
        <p>Foto, contexto y WhatsApp. Sin perder la oportunidad mientras caminas.</p>
      </section>

      <section className="card capture-card">
        <label className="photo-picker">
          <input accept="image/*" capture="environment" onChange={handlePhoto} type="file" />
          {photoDataUrl ? <img alt="Letrero capturado" src={photoDataUrl} /> : <span><b>＋</b> Tomar foto o subir letrero</span>}
        </label>

        {photo && (
          <div className="actions">
            <button className="primary" disabled={extracting} onClick={extract} type="button">
              {extracting ? "Leyendo letrero…" : "Leer con IA"}
            </button>
            <button className="secondary" onClick={getLocation} type="button">Actualizar GPS</button>
          </div>
        )}

        {message && <p className="notice success">{message}</p>}
        {error && <p className="notice error">{error}</p>}
      </section>

      {photo && (
        <section className="card review-card">
          <div className="section-heading"><span>02</span><h2>Confirma el Hallazgo</h2></div>
          <div className="field-row">
            <label>Operación
              <select value={operation} onChange={(event) => setOperation(event.target.value as Operation)}>
                <option value="">Sin definir</option>
                <option value="alquiler">Alquiler</option>
                <option value="venta">Venta</option>
              </select>
            </label>
            <label>Tipo anunciado
              <input value={propertyType} onChange={(event) => setPropertyType(event.target.value)} placeholder="Departamento, cuarto…" />
            </label>
          </div>
          <label>Teléfonos
            <input value={phones.join(", ")} onChange={(event) => setPhones(event.target.value.split(",").map((phone) => phone.trim()).filter(Boolean))} placeholder="999 999 999, 988 888 888" inputMode="tel" />
          </label>
          <label>Ubicación capturada
            <input value={location} onChange={(event) => setLocation(event.target.value)} placeholder="Obteniendo GPS…" />
          </label>
          <label>Notas de lectura
            <textarea value={notes} onChange={(event) => setNotes(event.target.value)} rows={3} />
          </label>
          <button className="save" onClick={saveHallazgo} type="button">Guardar Hallazgo</button>
        </section>
      )}

      {phones.length > 0 && (
        <section className="card contact-card">
          <div className="section-heading"><span>03</span><h2>Contactar</h2></div>
          <p className="message-preview">{whatsappMessage}</p>
          <div className="phone-actions">
            {phones.map((phone) => <button key={phone} onClick={() => openWhatsApp(phone)} type="button">WhatsApp · {phone}</button>)}
          </div>
        </section>
      )}

      <section className="saved">
        <div className="section-heading"><span>{String(hallazgos.length).padStart(2, "0")}</span><h2>Hallazgos guardados</h2></div>
        {hallazgos.length === 0 ? <p>Aún no guardaste Hallazgos en este dispositivo.</p> : (
          <div className="saved-grid">
            {hallazgos.map((hallazgo) => (
              <article key={hallazgo.id}>
                <img alt="Letrero guardado" src={hallazgo.photoDataUrl} />
                <p>{hallazgo.operation || "Sin operación"} · {hallazgo.propertyType || "Sin tipo"}</p>
                <small>{hallazgo.phones.join(" · ") || "Sin teléfono"}</small>
              </article>
            ))}
          </div>
        )}
      </section>
    </main>
  );
}
