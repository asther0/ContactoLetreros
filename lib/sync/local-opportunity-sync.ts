import type { SupabaseClient } from "@supabase/supabase-js";

import type {
  LocationPrecision,
  OpportunityOperation,
  OpportunityOrigin,
  OpportunityStatus,
  SearchCriteria,
} from "../domain/opportunities";
import type { Database } from "../supabase/database.types";

const unclassifiedLocalId = "sin-clasificar";

export interface LocalSearchRecord {
  /** Stable ID from IndexedDB/localStorage. */
  id: string;
  name: string;
  criteria?: SearchCriteria;
  /** Set after a successful prior sync, if the caller persists it locally. */
  remoteId?: string;
}

export interface LocalPhotoRecord {
  /** Stable ID from IndexedDB. Defaults to the opportunity ID if omitted. */
  id?: string;
  blob: Blob;
  fileName?: string;
  contentType?: string;
  width?: number;
  height?: number;
  extractedText?: string;
}

export interface LocalOpportunityRecord {
  /** Stable ID from IndexedDB; used as the remote idempotency key. */
  id: string;
  searchId?: string;
  remoteId?: string;
  origin?: string;
  status?: string;
  operation?: string;
  propertyType?: string;
  phoneNumbers?: string[];
  selectedPhone?: string;
  sourceUrl?: string;
  note?: string;
  favorite?: boolean;
  location?: string;
  locationKind?: string;
  latitude?: number;
  longitude?: number;
  photo?: LocalPhotoRecord | null;
}

/**
 * Caller-owned local store. `markSynced` is deliberately metadata-only: this
 * contract has no delete method, so a failed sync can never erase local data.
 */
export interface LocalOpportunitySyncStore {
  listSearches(): Promise<LocalSearchRecord[]>;
  listOpportunities(): Promise<LocalOpportunityRecord[]>;
  markSearchSynced?(localId: string, remoteId: string): Promise<void>;
  markOpportunitySynced?(localId: string, remoteId: string): Promise<void>;
  markPhotoSynced?(localOpportunityId: string, remotePath: string): Promise<void>;
}

export interface RemoteSearchRecord {
  id: string;
}

export interface RemoteOpportunityRecord {
  id: string;
}

export interface OpportunitySyncGateway {
  upsertSearch(userId: string, local: LocalSearchRecord): Promise<RemoteSearchRecord>;
  upsertOpportunity(
    userId: string,
    searchId: string,
    local: LocalOpportunityRecord,
  ): Promise<RemoteOpportunityRecord>;
  uploadPhoto(
    userId: string,
    opportunityId: string,
    localOpportunityId: string,
    photo: LocalPhotoRecord,
  ): Promise<string>;
  upsertPhotoMetadata(
    userId: string,
    opportunityId: string,
    localOpportunityId: string,
    storagePath: string,
    photo: LocalPhotoRecord,
  ): Promise<void>;
}

export interface SyncFailure {
  localId: string;
  stage: "search" | "opportunity" | "photo";
  error: string;
}

export interface LocalSyncReport {
  searchesSynced: number;
  opportunitiesSynced: number;
  photosSynced: number;
  failures: SyncFailure[];
}

function normalizeOrigin(value?: string): OpportunityOrigin {
  switch (value?.trim().toLowerCase()) {
    case "calle":
    case "street":
      return "street";
    case "airbnb":
      return "airbnb";
    case "facebook":
      return "facebook";
    case "adondevivir":
      return "adondevivir";
    default:
      return "other";
  }
}

function normalizeStatus(value?: string): OpportunityStatus {
  switch (value?.trim().toLowerCase()) {
    case "contacted":
    case "contactada":
    case "contact_opened":
    case "sent":
      return "contacted";
    case "visited":
    case "visitada":
      return "visited";
    case "discarded":
    case "descartada":
      return "discarded";
    default:
      return "new";
  }
}

function normalizeOperation(value?: string): OpportunityOperation | null {
  switch (value?.trim().toLowerCase()) {
    case "rent":
    case "alquiler":
      return "rent";
    case "sale":
    case "venta":
      return "sale";
    default:
      return null;
  }
}

function normalizeLocationPrecision(value?: string, latitude?: number): LocationPrecision {
  return value?.trim().toLowerCase() === "exact" || Number.isFinite(latitude)
    ? "exact"
    : "approximate";
}

function photoFileName(photo: LocalPhotoRecord, localOpportunityId: string): string {
  const raw = photo.fileName?.trim() || `${photo.id ?? localOpportunityId}.jpg`;
  return raw.replace(/[^a-zA-Z0-9._-]/g, "-").replace(/^-+/, "") || "photo.jpg";
}

function detailFromError(error: unknown): string {
  return error instanceof Error ? error.message : "Unknown sync failure";
}

/**
 * Syncs records independently. It never deletes local data, and uses stable
 * local IDs as remote upsert keys, so retrying after a network interruption is
 * safe even if the server wrote the first attempt before the client timed out.
 */
export async function syncLocalOpportunities(
  userId: string,
  store: LocalOpportunitySyncStore,
  gateway: OpportunitySyncGateway,
): Promise<LocalSyncReport> {
  const report: LocalSyncReport = {
    searchesSynced: 0,
    opportunitiesSynced: 0,
    photosSynced: 0,
    failures: [],
  };
  const searchIds = new Map<string, string>();
  const localSearches = await store.listSearches();
  const hasUnclassified = localSearches.some((search) => search.id === unclassifiedLocalId);
  const searches = hasUnclassified
    ? localSearches
    : [{ id: unclassifiedLocalId, name: "Sin clasificar" }, ...localSearches];

  for (const localSearch of searches) {
    try {
      const remote = await gateway.upsertSearch(userId, localSearch);
      searchIds.set(localSearch.id, remote.id);
      report.searchesSynced += 1;
      await store.markSearchSynced?.(localSearch.id, remote.id);
    } catch (error) {
      report.failures.push({
        localId: localSearch.id,
        stage: "search",
        error: detailFromError(error),
      });
    }
  }

  for (const localOpportunity of await store.listOpportunities()) {
    const localSearchId = localOpportunity.searchId || unclassifiedLocalId;
    const remoteSearchId = searchIds.get(localSearchId) ?? searchIds.get(unclassifiedLocalId);

    if (!remoteSearchId) {
      report.failures.push({
        localId: localOpportunity.id,
        stage: "opportunity",
        error: "No remote search is available for this local opportunity.",
      });
      continue;
    }

    let remoteOpportunity: RemoteOpportunityRecord;
    try {
      remoteOpportunity = await gateway.upsertOpportunity(
        userId,
        remoteSearchId,
        localOpportunity,
      );
      report.opportunitiesSynced += 1;
      await store.markOpportunitySynced?.(localOpportunity.id, remoteOpportunity.id);
    } catch (error) {
      report.failures.push({
        localId: localOpportunity.id,
        stage: "opportunity",
        error: detailFromError(error),
      });
      continue;
    }

    if (!localOpportunity.photo) {
      continue;
    }

    try {
      const path = await gateway.uploadPhoto(
        userId,
        remoteOpportunity.id,
        localOpportunity.id,
        localOpportunity.photo,
      );
      await gateway.upsertPhotoMetadata(
        userId,
        remoteOpportunity.id,
        localOpportunity.id,
        path,
        localOpportunity.photo,
      );
      report.photosSynced += 1;
      await store.markPhotoSynced?.(localOpportunity.id, path);
    } catch (error) {
      report.failures.push({
        localId: localOpportunity.id,
        stage: "photo",
        error: detailFromError(error),
      });
    }
  }

  return report;
}

/** Browser-side Supabase gateway. It only uses the authenticated user's JWT. */
export function createSupabaseOpportunitySyncGateway(
  client: SupabaseClient<Database>,
): OpportunitySyncGateway {
  return {
    async upsertSearch(userId, local) {
      const result = await client
        .from("searches")
        .upsert(
          {
            ...(local.remoteId ? { id: local.remoteId } : {}),
            user_id: userId,
            local_source_id: local.id,
            name: local.name.trim() || "Sin clasificar",
            criteria: local.criteria ?? {},
          },
          { onConflict: "user_id,local_source_id" },
        )
        .select("id")
        .single();

      if (result.error || !result.data) {
        throw new Error(result.error?.message || "Could not upsert search.");
      }

      return result.data;
    },

    async upsertOpportunity(userId, searchId, local) {
      const origin = normalizeOrigin(local.origin);
      const sourceUrl = local.sourceUrl?.trim() || null;
      if (["airbnb", "facebook", "adondevivir"].includes(origin) && !sourceUrl) {
        throw new Error("A web-origin opportunity requires its original URL.");
      }
      const phoneNumbers = [...new Set([...(local.phoneNumbers ?? []), local.selectedPhone ?? ""])]
        .map((phone) => phone.trim())
        .filter(Boolean);
      const precision = normalizeLocationPrecision(local.locationKind, local.latitude);
      const result = await client
        .from("opportunities")
        .upsert(
          {
            ...(local.remoteId ? { id: local.remoteId } : {}),
            user_id: userId,
            local_source_id: local.id,
            search_id: searchId,
            origin,
            status: normalizeStatus(local.status),
            property_type: local.propertyType?.trim() || null,
            operation: normalizeOperation(local.operation),
            phone_numbers: phoneNumbers,
            source_url: sourceUrl,
            note: local.note?.trim() || null,
            is_favorite: local.favorite ?? false,
            location_precision: local.location || Number.isFinite(local.latitude) ? precision : null,
            location_label: local.location?.trim() || null,
            latitude: Number.isFinite(local.latitude) ? local.latitude! : null,
            longitude: Number.isFinite(local.longitude) ? local.longitude! : null,
          },
          { onConflict: "user_id,local_source_id" },
        )
        .select("id")
        .single();

      if (result.error || !result.data) {
        throw new Error(result.error?.message || "Could not upsert opportunity.");
      }

      return result.data;
    },

    async uploadPhoto(userId, opportunityId, localOpportunityId, photo) {
      const path = `${userId}/${opportunityId}/${photoFileName(photo, localOpportunityId)}`;
      const result = await client.storage
        .from("opportunity-photos")
        .upload(path, photo.blob, {
          upsert: true,
          contentType: photo.contentType || photo.blob.type || "image/jpeg",
        });

      if (result.error) {
        throw new Error(result.error.message);
      }

      return path;
    },

    async upsertPhotoMetadata(userId, opportunityId, localOpportunityId, storagePath, photo) {
      const result = await client.from("opportunity_photos").upsert(
        {
          user_id: userId,
          local_source_id: photo.id ?? localOpportunityId,
          opportunity_id: opportunityId,
          storage_path: storagePath,
          mime_type: photo.contentType || photo.blob.type || null,
          width: photo.width ?? null,
          height: photo.height ?? null,
          extracted_text: photo.extractedText ?? null,
        },
        { onConflict: "user_id,local_source_id" },
      );

      if (result.error) {
        throw new Error(result.error.message);
      }
    },
  };
}
