"use client";

import { ChangeEvent, FormEvent, useEffect, useMemo, useState } from "react";
import dynamic from "next/dynamic";
import type { User } from "@supabase/supabase-js";
import { supabase } from "../lib/supabase/browser";
import { createSupabaseOpportunitySyncGateway, syncLocalOpportunities } from "../lib/sync/local-opportunity-sync";

const OpportunityMap = dynamic(() => import("../components/opportunity-map"), { ssr: false });

type Operation = "alquiler" | "venta" | "";
type LegacyStatus = "captured" | "extracting" | "needs_review" | "ready_to_contact" | "contact_opened" | "sent";
type OpportunityStatus = "new" | "contacted" | "visited" | "discarded";
type Origin = "Calle" | "Airbnb" | "Facebook" | "Adondevivir" | "Otro";
type Search = { id: string; name: string; createdAt: string };
type Hallazgo = {
  id: string; capturedAt: string; photo: File | null; previewUrl: string; status: LegacyStatus;
  operation: Operation; propertyType: string; phones: string[]; selectedPhone: string;
  location: string; notes: string; ocrText: string;
  searchId?: string; origin?: Origin; opportunityStatus?: OpportunityStatus; favorite?: boolean;
  url?: string; latitude?: number; longitude?: number; locationKind?: "exact" | "approximate";
};
type StoredHallazgo = Omit<Hallazgo, "previewUrl">;

const databaseName = "contacto-letreros";
const storeName = "hallazgos";
const searchesKey = "contacto-letreros-searches-v1";
const unclassifiedSearch: Search = { id: "sin-clasificar", name: "Sin clasificar", createdAt: "2026-07-22T00:00:00.000Z" };
const origins: Origin[] = ["Calle", "Airbnb", "Facebook", "Adondevivir", "Otro"];
const statusLabels: Record<OpportunityStatus, string> = { new: "Nueva", contacted: "Contactada", visited: "Visitada", discarded: "Descartada" };

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
  await new Promise<void>((resolve, reject) => { transaction.oncomplete = () => resolve(); transaction.onerror = () => reject(transaction.error); });
  database.close();
}

async function loadHallazgos() {
  const database = await openDatabase();
  const request = database.transaction(storeName, "readonly").objectStore(storeName).getAll();
  const stored = await new Promise<StoredHallazgo[]>((resolve, reject) => { request.onsuccess = () => resolve(request.result as StoredHallazgo[]); request.onerror = () => reject(request.error); });
  database.close();
  return stored.map((item) => ({
    ...item,
    previewUrl: item.photo ? URL.createObjectURL(item.photo) : "",
    searchId: item.searchId || unclassifiedSearch.id,
    origin: item.origin || "Calle",
    opportunityStatus: item.opportunityStatus || (item.status === "sent" ? "contacted" : "new"),
    favorite: item.favorite || false,
    locationKind: item.locationKind || (item.latitude ? "exact" : "approximate"),
  })).sort((a, b) => b.capturedAt.localeCompare(a.capturedAt));
}

function loadSearches(): Search[] {
  try {
    const saved = JSON.parse(localStorage.getItem(searchesKey) || "[]") as Search[];
    return saved.some((search) => search.id === unclassifiedSearch.id) ? saved : [unclassifiedSearch, ...saved];
  } catch { return [unclassifiedSearch]; }
}
function saveSearches(searches: Search[]) { localStorage.setItem(searchesKey, JSON.stringify(searches)); }
function buildMessage(operation: Operation, location: string, propertyType: string) {
  const action = operation || "alquiler o venta";
  const property = propertyType ? ` de ${propertyType.toLowerCase()}` : "";
  const place = location ? ` cerca de ${location}` : " en la zona donde vi el letrero";
  return `Hola, vi su letrero de ${action}${property}${place}. ¿Sigue disponible? Me interesa recibir más información.`;
}
function phoneNumbersFromText(text: string) { const matches = text.match(/(?:\+?51[\s.-]?)?9\d{2}[\s.-]?\d{3}[\s.-]?\d{3}/g) ?? []; return [...new Set(matches.map((phone) => phone.replace(/\D/g, "").replace(/^51(?=9\d{8}$)/, "")))]; }
function inferOperation(text: string): Operation { const n = text.normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase(); return /\b(se\s+)?alquila(?:n|mos)?\b|\balquiler\b/.test(n) ? "alquiler" : /\b(se\s+)?vende(?:n|mos)?\b|\bventa\b/.test(n) ? "venta" : ""; }
function inferPropertyType(text: string) { const candidate = ["departamento", "dpto", "casa", "cuarto", "habitación", "habitacion", "oficina", "local", "terreno"].find((property) => text.toLowerCase().includes(property)); return candidate === "dpto" ? "Departamento" : candidate === "habitacion" ? "Habitación" : candidate ? `${candidate.slice(0, 1).toUpperCase()}${candidate.slice(1)}` : ""; }
function getCurrentCoordinates() { return new Promise<{ latitude: number; longitude: number } | null>((resolve) => { if (!navigator.geolocation) return resolve(null); navigator.geolocation.getCurrentPosition(({ coords }) => resolve({ latitude: coords.latitude, longitude: coords.longitude }), () => resolve(null), { enableHighAccuracy: true, timeout: 10000, maximumAge: 60000 }); }); }
function statusText(status: LegacyStatus) { return { captured: "Guardado", extracting: "Leyendo en tu teléfono…", needs_review: "Revisar", ready_to_contact: "Listo", contact_opened: "WhatsApp abierto", sent: "Enviado" }[status]; }
function titleFor(item: Hallazgo) { return [item.operation ? item.operation === "alquiler" ? "Alquiler" : "Venta" : "Oportunidad", item.propertyType].filter(Boolean).join(" · "); }

export default function Home() {
  const [hallazgos, setHallazgos] = useState<Hallazgo[]>([]);
  const [searches, setSearches] = useState<Search[]>([unclassifiedSearch]);
  const [view, setView] = useState<"capture" | "search" | "review" | "import">("search");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [activeSearchId, setActiveSearchId] = useState(unclassifiedSearch.id);
  const [mobileView, setMobileView] = useState<"list" | "map">("list");
  const [filter, setFilter] = useState<"all" | OpportunityStatus | "favorites">("all");
  const [notice, setNotice] = useState(""); const [error, setError] = useState(""); const [user, setUser] = useState<User | null>(null);
  const [localReady, setLocalReady] = useState(false);
  const [newSearchName, setNewSearchName] = useState(""); const [renaming, setRenaming] = useState(false);
  const [importData, setImportData] = useState({ origin: "Airbnb" as Origin, url: "", notes: "", photo: null as File | null });

  useEffect(() => { setSearches(loadSearches()); void loadHallazgos().then((items) => { setHallazgos(items); items.forEach((item) => void saveHallazgo(item)); }).catch(() => setError("No pudimos abrir las oportunidades guardadas.")).finally(() => setLocalReady(true)); }, []);
  useEffect(() => { if (!supabase) return; void supabase.auth.getUser().then(({ data }) => setUser(data.user)); const { data: subscription } = supabase.auth.onAuthStateChange((_event, session) => setUser(session?.user ?? null)); return () => subscription.subscription.unsubscribe(); }, []);
  useEffect(() => {
    if (!user || !supabase || !localReady) return;
    const timeout = window.setTimeout(() => void syncToCloud(), 900);
    return () => window.clearTimeout(timeout);
  }, [user, localReady, hallazgos, searches]);

  const selected = hallazgos.find((item) => item.id === selectedId) ?? null;
  const activeSearch = searches.find((search) => search.id === activeSearchId) ?? unclassifiedSearch;
  const visible = useMemo(() => hallazgos.filter((item) => item.searchId === activeSearchId).filter((item) => filter === "all" ? true : filter === "favorites" ? item.favorite : item.opportunityStatus === filter), [hallazgos, activeSearchId, filter]);
  const messagePreview = selected ? buildMessage(selected.operation, selected.location, selected.propertyType) : "";

  function updateHallazgo(id: string, changes: Partial<Hallazgo>) { setHallazgos((items) => items.map((item) => { if (item.id !== id) return item; const updated = { ...item, ...changes }; void saveHallazgo(updated); return updated; })); }
  function createSearch(event: FormEvent) { event.preventDefault(); const name = newSearchName.trim(); if (!name) return; const search = { id: crypto.randomUUID(), name, createdAt: new Date().toISOString() }; const next = [...searches, search]; setSearches(next); saveSearches(next); setNewSearchName(""); setActiveSearchId(search.id); setNotice(`Búsqueda “${name}” creada.`); }
  function renameSearch() { const name = window.prompt("Nombre de la búsqueda", activeSearch.name)?.trim(); if (!name || activeSearch.id === unclassifiedSearch.id) return; const next = searches.map((search) => search.id === activeSearch.id ? { ...search, name } : search); setSearches(next); saveSearches(next); }
  function moveToSearch(id: string, searchId: string) { updateHallazgo(id, { searchId }); setNotice("Oportunidad movida."); }

  async function enrichLocation(ids: string[]) {
    const coordinates = await getCurrentCoordinates(); if (!coordinates) return;
    try { const response = await fetch(`/api/location/reverse?lat=${coordinates.latitude}&lon=${coordinates.longitude}`); const data = await response.json() as { location?: { label?: string | null } }; if (!response.ok) return; ids.forEach((id) => updateHallazgo(id, { location: data.location?.label ?? "", latitude: coordinates.latitude, longitude: coordinates.longitude, locationKind: "exact" })); } catch { /* non-blocking */ }
  }
  async function extractHallazgoLocally(id: string, photo: File) { let worker: Awaited<ReturnType<typeof import("tesseract.js")["createWorker"]>> | null = null; try { const { createWorker } = await import("tesseract.js"); worker = await createWorker("spa"); const { data } = await worker.recognize(photo); const text = data.text.trim(); const phones = phoneNumbersFromText(text); updateHallazgo(id, { operation: inferOperation(text), propertyType: inferPropertyType(text), phones, selectedPhone: phones[0] ?? "", ocrText: text, status: phones.length ? "ready_to_contact" : "needs_review" }); } catch { updateHallazgo(id, { status: "needs_review", notes: "No se pudo leer localmente. Completa los datos cuando puedas." }); } finally { await worker?.terminate(); } }
  async function handleCapture(event: ChangeEvent<HTMLInputElement>) {
    const photos = Array.from(event.target.files ?? []); if (!photos.length) return; event.target.value = ""; setNotice(`${photos.length} ${photos.length === 1 ? "foto guardada" : "fotos guardadas"}. Se leerán en segundo plano.`);
    const captured = photos.map((photo): Hallazgo => ({ id: crypto.randomUUID(), capturedAt: new Date().toISOString(), photo, previewUrl: URL.createObjectURL(photo), status: "extracting", operation: "", propertyType: "", phones: [], selectedPhone: "", location: "", notes: "", ocrText: "", searchId: activeSearchId, origin: "Calle", opportunityStatus: "new", favorite: false, locationKind: "approximate" }));
    setHallazgos((items) => [...captured, ...items]); captured.forEach((item) => void saveHallazgo(item)); void enrichLocation(captured.map((item) => item.id)); void (async () => { for (const item of captured) await extractHallazgoLocally(item.id, item.photo!); })(); setView("search");
  }
  function createImport(event: FormEvent) { event.preventDefault(); const url = importData.url.trim(); const requiresUrl = ["Airbnb", "Facebook", "Adondevivir"].includes(importData.origin); if (requiresUrl && !url) { setError(`El link original es obligatorio para ${importData.origin}.`); return; } if (!url && !importData.notes.trim() && !importData.photo) { setError("Agrega al menos un enlace, nota o captura."); return; } const photo = importData.photo; const item: Hallazgo = { id: crypto.randomUUID(), capturedAt: new Date().toISOString(), photo, previewUrl: photo ? URL.createObjectURL(photo) : "", status: "needs_review", operation: "", propertyType: "", phones: [], selectedPhone: "", location: "", notes: importData.notes.trim(), ocrText: "", searchId: activeSearchId, origin: importData.origin, opportunityStatus: "new", favorite: false, url, locationKind: "approximate" }; setHallazgos((items) => [item, ...items]); void saveHallazgo(item); setImportData({ origin: "Airbnb", url: "", notes: "", photo: null }); setError(""); setView("search"); setNotice("Oportunidad importada a esta búsqueda."); }
  async function signIn() { if (!supabase) { setError("Falta configurar Supabase para iniciar sesión."); return; } const { error: signInError } = await supabase.auth.signInWithOAuth({ provider: "google", options: { redirectTo: window.location.origin } }); if (signInError) setError("No pudimos abrir el inicio de sesión con Google."); }
  async function syncToCloud() {
    if (!supabase || !user) return;
    const report = await syncLocalOpportunities(user.id, {
      listSearches: async () => searches.map((search) => ({ id: search.id, name: search.name })),
      listOpportunities: async () => hallazgos.map((item) => ({
        id: item.id,
        searchId: item.searchId,
        origin: item.origin,
        status: item.opportunityStatus,
        operation: item.operation,
        propertyType: item.propertyType,
        phoneNumbers: item.phones,
        selectedPhone: item.selectedPhone,
        sourceUrl: item.url,
        note: item.notes,
        favorite: item.favorite,
        location: item.location,
        locationKind: item.locationKind,
        latitude: item.latitude,
        longitude: item.longitude,
        photo: item.photo ? { id: item.id, blob: item.photo, fileName: item.photo.name, contentType: item.photo.type, extractedText: item.ocrText } : null,
      })),
    }, createSupabaseOpportunitySyncGateway(supabase));
    if (report.failures.length) setError("Algunas oportunidades siguen solo en este teléfono. Reintentaremos al próximo cambio.");
    else setNotice("Guardado en tu cuenta.");
  }
  function openWhatsApp() { if (!selected?.selectedPhone) { setError("Elige o escribe un teléfono antes de abrir WhatsApp."); return; } updateHallazgo(selected.id, { status: "contact_opened", opportunityStatus: "contacted" }); window.open(`https://wa.me/${selected.selectedPhone.replace(/\D/g, "")}?text=${encodeURIComponent(messagePreview)}`, "_blank", "noopener,noreferrer"); }

  if (view === "capture") return <main className="capture-view"><header><p className="eyebrow">CONTACTO LETREROS</p><h1>Ve. Foto.<br />Guarda.</h1><p>Captura varios letreros. Los detalles no te detienen en la calle.</p></header><label className="capture-button"><input accept="image/*" capture="environment" multiple onChange={handleCapture} type="file" /><span>＋</span> Tomar o subir fotos<br /><small>Se guardan en {activeSearch.name}</small></label><button className="inbox-link" onClick={() => setView("search")} type="button">← Volver a {activeSearch.name}</button></main>;
  if (view === "import") return <main className="form-view"><button className="back" onClick={() => setView("search")} type="button">← {activeSearch.name}</button><header><p className="eyebrow">IMPORTAR</p><h1>Guarda un link.</h1><p>Centraliza anuncios que viste en otras páginas, sin scraping.</p></header><form className="detail-card" onSubmit={createImport}><label>Origen<select value={importData.origin} onChange={(event) => setImportData({ ...importData, origin: event.target.value as Origin })}>{origins.map((origin) => <option key={origin}>{origin}</option>)}</select></label><label>Link del anuncio {(["Airbnb", "Facebook", "Adondevivir"].includes(importData.origin)) && <span className="required">obligatorio</span>}<input required={["Airbnb", "Facebook", "Adondevivir"].includes(importData.origin)} value={importData.url} onChange={(event) => setImportData({ ...importData, url: event.target.value })} placeholder="https://…" type="url" /></label><label>Nota opcional<textarea value={importData.notes} onChange={(event) => setImportData({ ...importData, notes: event.target.value })} placeholder="Precio, distrito, por qué interesa…" /></label><label>Captura opcional<input accept="image/*" onChange={(event) => setImportData({ ...importData, photo: event.target.files?.[0] ?? null })} type="file" /></label><button className="primary" type="submit">Guardar oportunidad</button></form>{error && <p className="notice error">{error}</p>}</main>;
  if (view === "review" && selected) return <main className="review-view"><button className="back" onClick={() => setView("search")} type="button">← {activeSearch.name}</button>{selected.previewUrl ? <img className="detail-photo" src={selected.previewUrl} alt={selected.origin === "Calle" ? "Letrero capturado" : "Captura del anuncio"} /> : <div className="no-photo">Sin captura</div>}<div className="detail-title"><span className="origin-chip">{selected.origin}</span><button aria-label="Marcar favorita" className={`favorite ${selected.favorite ? "is-favorite" : ""}`} onClick={() => updateHallazgo(selected.id, { favorite: !selected.favorite })} type="button">♥</button></div><section className="detail-card"><h2>Información de la oportunidad</h2><label>Estado<select value={selected.opportunityStatus} onChange={(event) => updateHallazgo(selected.id, { opportunityStatus: event.target.value as OpportunityStatus })}>{Object.entries(statusLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label><label>Origen<select value={selected.origin} onChange={(event) => updateHallazgo(selected.id, { origin: event.target.value as Origin })}>{origins.map((origin) => <option key={origin}>{origin}</option>)}</select></label><label>Búsqueda<select value={selected.searchId} onChange={(event) => moveToSearch(selected.id, event.target.value)}>{searches.map((search) => <option key={search.id} value={search.id}>{search.name}</option>)}</select></label><label>Link original<input value={selected.url ?? ""} onChange={(event) => updateHallazgo(selected.id, { url: event.target.value })} placeholder="https://…" type="url" /></label>{selected.origin === "Calle" && <><div className="choice-row"><button aria-pressed={selected.operation === "alquiler"} className={selected.operation === "alquiler" ? "chosen" : ""} onClick={() => updateHallazgo(selected.id, { operation: "alquiler" })} type="button">Alquiler</button><button aria-pressed={selected.operation === "venta"} className={selected.operation === "venta" ? "chosen" : ""} onClick={() => updateHallazgo(selected.id, { operation: "venta" })} type="button">Venta</button></div><label>Qué se anuncia<input value={selected.propertyType} onChange={(event) => updateHallazgo(selected.id, { propertyType: event.target.value })} placeholder="Departamento, cuarto…" /></label><label>Teléfonos<input value={selected.phones.join(", ")} onChange={(event) => { const phones = event.target.value.split(",").map((phone) => phone.trim()).filter(Boolean); updateHallazgo(selected.id, { phones, selectedPhone: selected.selectedPhone || phones[0] || "" }); }} inputMode="tel" placeholder="999 999 999" /></label></>}<label>Ubicación<input value={selected.location} onChange={(event) => updateHallazgo(selected.id, { location: event.target.value, locationKind: "approximate" })} placeholder="Distrito, zona o dirección" /></label><p className={`location-kind ${selected.locationKind}`}>{selected.locationKind === "exact" ? "● GPS capturado — ubicación exacta" : "○ Zona indicada — ubicación aproximada"}</p><label>Notas<textarea value={selected.notes} onChange={(event) => updateHallazgo(selected.id, { notes: event.target.value })} placeholder="Próximo paso, precio, dudas…" /></label></section>{selected.ocrText && <details className="ocr-text"><summary>Texto leído en tu teléfono</summary><p>{selected.ocrText}</p></details>}{selected.origin === "Calle" && <section className="message-card"><p className="eyebrow">VISTA PREVIA DE WHATSAPP</p><p>{messagePreview}</p><button className="whatsapp" onClick={openWhatsApp} type="button">Abrir WhatsApp</button></section>}</main>;

  return <main className="search-view"><header className="app-header"><div><p className="eyebrow">CONTACTO LETREROS</p><h1>Tu búsqueda.</h1></div>{user ? <button className="account-action" onClick={() => void supabase?.auth.signOut()} type="button">{user.email} · Salir</button> : <button className="account-action" onClick={signIn} type="button">Iniciar sesión</button>}</header><section className="search-switcher" aria-label="Búsquedas"><div className="search-select"><select aria-label="Búsqueda actual" value={activeSearchId} onChange={(event) => setActiveSearchId(event.target.value)}>{searches.map((search) => <option key={search.id} value={search.id}>{search.name}</option>)}</select>{activeSearch.id !== unclassifiedSearch.id && <button aria-label="Renombrar búsqueda" onClick={renameSearch} type="button">✎</button>}</div><form onSubmit={createSearch}><input aria-label="Nueva búsqueda" onChange={(event) => setNewSearchName(event.target.value)} placeholder="Nueva búsqueda" value={newSearchName} /><button type="submit">＋</button></form></section><div className="search-actions"><button className="primary" onClick={() => setView("capture")} type="button">＋ Capturar letreros</button><button className="secondary" onClick={() => setView("import")} type="button">↗ Guardar link</button></div>{notice && <p className="notice success">{notice}</p>}{error && <p className="notice error">{error}</p>}<section className="search-heading"><div><p className="eyebrow">BÚSQUEDA ACTIVA</p><h2>{activeSearch.name}</h2><p>{visible.length} oportunidades para decidir con calma.</p></div><button className="rename-link" onClick={() => setRenaming(!renaming)} type="button">{renaming ? "Cerrar filtros" : "Filtrar"}</button></section>{renaming && <div className="filters" role="group" aria-label="Filtros"><button className={filter === "all" ? "active" : ""} onClick={() => setFilter("all")} type="button">Todas</button><button className={filter === "favorites" ? "active" : ""} onClick={() => setFilter("favorites")} type="button">Favoritas</button>{Object.entries(statusLabels).map(([value, label]) => <button className={filter === value ? "active" : ""} key={value} onClick={() => setFilter(value as OpportunityStatus)} type="button">{label}</button>)}</div>}<div className="mobile-map-tabs" role="tablist"><button aria-selected={mobileView === "list"} className={mobileView === "list" ? "active" : ""} onClick={() => setMobileView("list")} role="tab" type="button">Lista</button><button aria-selected={mobileView === "map"} className={mobileView === "map" ? "active" : ""} onClick={() => setMobileView("map")} role="tab" type="button">Mapa</button></div><section className={`search-layout ${mobileView === "map" ? "show-map" : ""}`}><div className="opportunity-list">{visible.length ? visible.map((item) => <article className="opportunity-card" key={item.id}><button className="card-main" onClick={() => { setSelectedId(item.id); setView("review"); }} type="button">{item.previewUrl ? <img src={item.previewUrl} alt="" /> : <div className="card-empty">{item.origin}</div>}<span className="origin-chip">{item.origin}</span><strong>{titleFor(item)}</strong><small>{item.location || "Ubicación por completar"}</small><span className={`opportunity-status ${item.opportunityStatus}`}>{statusLabels[item.opportunityStatus || "new"]}</span></button><button aria-label="Marcar favorita" className={`favorite card-favorite ${item.favorite ? "is-favorite" : ""}`} onClick={() => updateHallazgo(item.id, { favorite: !item.favorite })} type="button">♥</button></article>) : <section className="empty"><p>Aún no hay oportunidades aquí.</p><button onClick={() => setView("capture")} type="button">Capturar letreros</button></section>}</div><MapPanel items={visible} onSelect={(id) => { setSelectedId(id); setView("review"); }} /></section></main>;
}

function MapPanel({ items, onSelect }: { items: Hallazgo[]; onSelect: (id: string) => void }) {
  const mappable = items.filter((item) => typeof item.latitude === "number" && typeof item.longitude === "number");
  const approximateWithoutCoordinates = items.filter((item) => item.locationKind === "approximate" && (typeof item.latitude !== "number" || typeof item.longitude !== "number")).length;
  const unlocated = items.length - mappable.length - approximateWithoutCoordinates;
  return <aside className="map-panel" aria-label="Mapa de oportunidades"><div className="map-copy"><strong>Mapa de {mappable.length} ubicaciones</strong><span>● Exacta &nbsp; ○ Aproximada con coordenadas</span></div><OpportunityMap items={mappable.map((item) => ({ id: item.id, title: titleFor(item), location: item.location, locationKind: item.locationKind, latitude: item.latitude, longitude: item.longitude, favorite: item.favorite }))} onSelect={onSelect} /><div className="map-summary">{approximateWithoutCoordinates > 0 && <p>○ {approximateWithoutCoordinates} zona{approximateWithoutCoordinates === 1 ? "" : "s"} aproximada{approximateWithoutCoordinates === 1 ? "" : "s"} sin coordenadas</p>}{unlocated > 0 && <p>{unlocated} oportunidad{unlocated === 1 ? "" : "es"} sin ubicación</p>}{!mappable.length && !approximateWithoutCoordinates && !unlocated && <p>Las ubicaciones aparecerán aquí.</p>}</div></aside>;
}
