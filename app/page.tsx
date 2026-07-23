"use client";

import { ChangeEvent, useEffect, useMemo, useState } from "react";

type Operation = "alquiler" | "venta" | "";
type Status = "captured" | "extracting" | "needs_review" | "ready_to_contact" | "contact_opened" | "sent";

type Hallazgo = {
  id: string;
  capturedAt: string;
  photo: File;
  previewUrl: string;
  status: Status;
  operation: Operation;
  propertyType: string;
  phones: string[];
  selectedPhone: string;
  location: string;
  notes: string;
  ocrText: string;
};

type StoredHallazgo = Omit<Hallazgo, "previewUrl">;

const databaseName = "contacto-letreros";
const storeName = "hallazgos";

function openDatabase() {
  return new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open(databaseName, 1);
    request.onupgradeneeded = () => request.result.createObjectStore(storeName, { keyPath: "id" });
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function saveHallazgo(hallazgo: Hallazgo) {
  const database = await openDatabase();
  const transaction = database.transaction(storeName, "readwrite");
  const { previewUrl: _previewUrl, ...stored } = hallazgo;
  transaction.objectStore(storeName).put(stored satisfies StoredHallazgo);
  await new Promise<void>((resolve, reject) => {
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error);
  });
  database.close();
}

async function loadHallazgos() {
  const database = await openDatabase();
  const transaction = database.transaction(storeName, "readonly");
  const request = transaction.objectStore(storeName).getAll();
  const stored = await new Promise<StoredHallazgo[]>((resolve, reject) => {
    request.onsuccess = () => resolve(request.result as StoredHallazgo[]);
    request.onerror = () => reject(request.error);
  });
  database.close();
  return stored
    .map((hallazgo) => ({ ...hallazgo, previewUrl: URL.createObjectURL(hallazgo.photo) }))
    .sort((a, b) => b.capturedAt.localeCompare(a.capturedAt));
}

function buildMessage(operation: Operation, location: string, propertyType: string) {
  const action = operation || "alquiler o venta";
  const property = propertyType ? ` de ${propertyType.toLowerCase()}` : "";
  const place = location ? ` cerca de ${location}` : " en la zona donde vi el letrero";
  return `Hola, vi su letrero de ${action}${property}${place}. ¿Sigue disponible? Me interesa recibir más información.`;
}

function statusText(status: Status) {
  return { captured: "Guardado", extracting: "Leyendo en tu teléfono…", needs_review: "Revisar", ready_to_contact: "Listo", contact_opened: "WhatsApp abierto", sent: "Enviado" }[status];
}

function phoneNumbersFromText(text: string) {
  const matches = text.match(/(?:\+?51[\s.-]?)?9\d{2}[\s.-]?\d{3}[\s.-]?\d{3}/g) ?? [];
  return [...new Set(matches.map((phone) => phone.replace(/\D/g, "").replace(/^51(?=9\d{8}$)/, "")))];
}

function inferOperation(text: string): Operation {
  const normalized = text.normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase();
  if (/\b(se\s+)?alquila(?:n|mos)?\b|\balquiler\b/.test(normalized)) return "alquiler";
  if (/\b(se\s+)?vende(?:n|mos)?\b|\bventa\b/.test(normalized)) return "venta";
  return "";
}

function inferPropertyType(text: string) {
  const normalized = text.toLowerCase();
  const candidate = ["departamento", "dpto", "casa", "cuarto", "habitación", "habitacion", "oficina", "local", "terreno"]
    .find((property) => normalized.includes(property));
  if (candidate === "dpto") return "Departamento";
  if (candidate === "habitacion") return "Habitación";
  return candidate ? `${candidate.slice(0, 1).toUpperCase()}${candidate.slice(1)}` : "";
}

function getCurrentCoordinates() {
  return new Promise<{ latitude: number; longitude: number } | null>((resolve) => {
    if (!navigator.geolocation) return resolve(null);
    navigator.geolocation.getCurrentPosition(
      ({ coords }) => resolve({ latitude: coords.latitude, longitude: coords.longitude }),
      () => resolve(null),
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 60000 },
    );
  });
}

export default function Home() {
  const [hallazgos, setHallazgos] = useState<Hallazgo[]>([]);
  const [view, setView] = useState<"capture" | "inbox" | "review">("capture");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [inboxTab, setInboxTab] = useState<"new" | "sent">("new");
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    void loadHallazgos().then(setHallazgos).catch(() => setError("No pudimos abrir los Hallazgos guardados."));
  }, []);

  const selected = hallazgos.find((hallazgo) => hallazgo.id === selectedId) ?? null;
  const pendingCount = hallazgos.filter((hallazgo) => hallazgo.status !== "sent").length;
  const inboxHallazgos = hallazgos.filter((hallazgo) => inboxTab === "sent" ? hallazgo.status === "sent" : hallazgo.status !== "sent");
  const messagePreview = useMemo(
    () => selected ? buildMessage(selected.operation, selected.location, selected.propertyType) : "",
    [selected],
  );

  function updateHallazgo(id: string, changes: Partial<Hallazgo>) {
    setHallazgos((current) => current.map((hallazgo) => {
      if (hallazgo.id !== id) return hallazgo;
      const updated = { ...hallazgo, ...changes };
      void saveHallazgo(updated);
      return updated;
    }));
  }

  async function enrichLocation(ids: string[]) {
    const coordinates = await getCurrentCoordinates();
    if (!coordinates) return;

    try {
      const response = await fetch(`/api/location/reverse?lat=${coordinates.latitude}&lon=${coordinates.longitude}`);
      const data = (await response.json()) as { location?: { label?: string | null }; error?: string };
      if (!response.ok || !data.location?.label) return;
      ids.forEach((id) => updateHallazgo(id, { location: data.location?.label ?? "" }));
    } catch {
      // La ubicación no bloquea la Captura rápida.
    }
  }

  async function extractHallazgoLocally(id: string, photo: File) {
    let worker: Awaited<ReturnType<typeof import("tesseract.js")["createWorker"]>> | null = null;
    try {
      const { createWorker } = await import("tesseract.js");
      worker = await createWorker("spa");
      const { data } = await worker.recognize(photo);
      const text = data.text.trim();
      const phones = phoneNumbersFromText(text);
      updateHallazgo(id, {
        operation: inferOperation(text),
        propertyType: inferPropertyType(text),
        phones,
        selectedPhone: phones[0] ?? "",
        ocrText: text,
        status: phones.length > 0 ? "ready_to_contact" : "needs_review",
      });
    } catch {
      updateHallazgo(id, { status: "needs_review", notes: "No se pudo leer localmente. Completa los datos cuando puedas." });
    } finally {
      await worker?.terminate();
    }
  }

  async function handleCapture(event: ChangeEvent<HTMLInputElement>) {
    const photos = Array.from(event.target.files ?? []);
    if (!photos.length) return;
    setError("");
    setNotice(`${photos.length} ${photos.length === 1 ? "foto guardada" : "fotos guardadas"}. Las leeremos en segundo plano.`);
    event.target.value = "";

    const captured = photos.map((photo): Hallazgo => ({
      id: crypto.randomUUID(),
      capturedAt: new Date().toISOString(),
      photo,
      previewUrl: URL.createObjectURL(photo),
      status: "extracting",
      operation: "",
      propertyType: "",
      phones: [],
      selectedPhone: "",
      location: "",
      notes: "",
      ocrText: "",
    }));

    setHallazgos((current) => [...captured, ...current]);
    captured.forEach((hallazgo) => void saveHallazgo(hallazgo));
    void enrichLocation(captured.map((hallazgo) => hallazgo.id));
    void (async () => {
      for (const hallazgo of captured) await extractHallazgoLocally(hallazgo.id, hallazgo.photo);
    })();
  }

  function openReview(id: string) {
    setSelectedId(id);
    setView("review");
  }

  function openWhatsApp() {
    if (!selected?.selectedPhone) {
      setError("Elige o escribe un teléfono antes de abrir WhatsApp.");
      return;
    }
    const phone = selected.selectedPhone.replace(/\D/g, "");
    updateHallazgo(selected.id, { status: "contact_opened" });
    window.open(`https://wa.me/${phone}?text=${encodeURIComponent(messagePreview)}`, "_blank", "noopener,noreferrer");
  }

  function markAsSent() {
    if (!selected) return;
    updateHallazgo(selected.id, { status: "sent" });
    setNotice("Marcado como enviado.");
  }

  if (view === "capture") {
    return <main className="capture-view">
      <header><p className="eyebrow">CONTACTO LETREROS</p><h1>Ve. Foto.<br />Sigue.</h1><p>Guarda todos los letreros ahora. Revisa los detalles después.</p></header>
      <label className="capture-button"><input accept="image/*" capture="environment" multiple onChange={handleCapture} type="file" /><span>＋</span> Tomar o subir fotos</label>
      {notice && <p className="notice success">{notice}</p>}
      {error && <p className="notice error">{error}</p>}
      <button className="inbox-link" onClick={() => setView("inbox")} type="button">Revisar bandeja <b>{pendingCount}</b></button>
    </main>;
  }

  if (view === "review" && selected) {
    return <main className="review-view">
      <button className="back" onClick={() => setView("inbox")} type="button">← Bandeja</button>
      <img className="detail-photo" src={selected.previewUrl} alt="Letrero capturado" />
      <p className="status">{statusText(selected.status)}</p>
      <section className="detail-card"><h2>Completa solo lo necesario</h2>
        <div className="choice-row"><button aria-pressed={selected.operation === "alquiler"} className={selected.operation === "alquiler" ? "chosen" : ""} onClick={() => updateHallazgo(selected.id, { operation: "alquiler" })} type="button">Alquiler</button><button aria-pressed={selected.operation === "venta"} className={selected.operation === "venta" ? "chosen" : ""} onClick={() => updateHallazgo(selected.id, { operation: "venta" })} type="button">Venta</button></div>
        <label>Qué se anuncia<input value={selected.propertyType} onChange={(event) => updateHallazgo(selected.id, { propertyType: event.target.value })} placeholder="Departamento, cuarto…" /></label>
        <label>Teléfonos<input value={selected.phones.join(", ")} onChange={(event) => { const phones = event.target.value.split(",").map((phone) => phone.trim()).filter(Boolean); updateHallazgo(selected.id, { phones, selectedPhone: selected.selectedPhone || phones[0] || "" }); }} inputMode="tel" placeholder="999 999 999" /></label>
        {selected.phones.length > 1 && <div className="phone-choice">{selected.phones.map((phone) => <button aria-pressed={selected.selectedPhone === phone} className={selected.selectedPhone === phone ? "chosen" : ""} key={phone} onClick={() => updateHallazgo(selected.id, { selectedPhone: phone })} type="button">{phone}</button>)}</div>}
        <label>Zona aproximada<input value={selected.location} onChange={(event) => updateHallazgo(selected.id, { location: event.target.value })} placeholder="Distrito o dirección" /></label>
        <p className="attribution">Dirección aproximada · Datos © OpenStreetMap contributors</p>
      </section>
      {selected.ocrText && <details className="ocr-text"><summary>Texto leído en tu teléfono</summary><p>{selected.ocrText}</p></details>}
      <section className="message-card"><p className="eyebrow">VISTA PREVIA DE WHATSAPP</p><p>{messagePreview}</p><button className="whatsapp" onClick={openWhatsApp} type="button">Abrir WhatsApp</button>{selected.status !== "sent" && <button className="sent-button" onClick={markAsSent} type="button">Marcar como enviado</button>}</section>
    </main>;
  }

  return <main className="inbox-view">
    <button className="back" onClick={() => setView("capture")} type="button">← Seguir capturando</button>
    <header><p className="eyebrow">BANDEJA</p><h1>Tus Hallazgos</h1><p>La IA completa lo que puede. Tú confirmas antes de escribir.</p></header>
    {hallazgos.length === 0 ? <section className="empty"><p>Aún no hay fotos.</p><button onClick={() => setView("capture")} type="button">Capturar letreros</button></section> : <><div className="inbox-tabs" role="tablist" aria-label="Estado de Hallazgos"><button aria-selected={inboxTab === "new"} className={inboxTab === "new" ? "active" : ""} onClick={() => setInboxTab("new")} role="tab" type="button">Nuevos <b>{pendingCount}</b></button><button aria-selected={inboxTab === "sent"} className={inboxTab === "sent" ? "active" : ""} onClick={() => setInboxTab("sent")} role="tab" type="button">Enviados <b>{hallazgos.length - pendingCount}</b></button></div>{inboxHallazgos.length === 0 ? <p className="empty-tab">No hay Hallazgos en esta lista.</p> : <section className="inbox-grid">{inboxHallazgos.map((hallazgo) => <button className="hallazgo-card" key={hallazgo.id} onClick={() => openReview(hallazgo.id)} type="button"><img src={hallazgo.previewUrl} alt="Letrero guardado" /><span className={`status status-${hallazgo.status}`}>{statusText(hallazgo.status)}</span><strong>{hallazgo.operation || "Sin clasificar"}{hallazgo.propertyType ? ` · ${hallazgo.propertyType}` : ""}</strong><small>{hallazgo.phones[0] || "Completar datos"}</small></button>)}</section>}</>}
  </main>;
}
