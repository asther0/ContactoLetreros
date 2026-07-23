import type { SupabaseClient } from "@supabase/supabase-js";

import type {
  NewOpportunity,
  NewSearch,
  Opportunity,
  OpportunityLocation,
  OpportunityPatch,
  OpportunityPhoto,
  Search,
  SearchCriteria,
} from "../domain/opportunities";
import type { Database } from "../supabase/database.types";

type SearchRow = Database["public"]["Tables"]["searches"]["Row"];
type OpportunityRow = Database["public"]["Tables"]["opportunities"]["Row"];
type PhotoRow = Database["public"]["Tables"]["opportunity_photos"]["Row"];

export class OpportunityRepositoryError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "OpportunityRepositoryError";
  }
}

function unwrap<T>(
  result: { data: T | null; error: { message: string } | null },
  message: string,
): T {
  if (result.error) {
    throw new OpportunityRepositoryError(`${message}: ${result.error.message}`);
  }

  if (result.data === null) {
    throw new OpportunityRepositoryError(message);
  }

  return result.data;
}

function mapSearch(row: SearchRow): Search {
  return {
    id: row.id,
    userId: row.user_id,
    name: row.name,
    criteria: row.criteria,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function toLocation(row: OpportunityRow): OpportunityLocation | null {
  if (!row.location_precision) {
    return null;
  }

  return {
    precision: row.location_precision,
    label: row.location_label,
    district: row.district,
    address: row.address,
    latitude: row.latitude,
    longitude: row.longitude,
  };
}

function mapOpportunity(row: OpportunityRow): Opportunity {
  return {
    id: row.id,
    userId: row.user_id,
    searchId: row.search_id,
    origin: row.origin,
    status: row.status,
    title: row.title,
    propertyType: row.property_type,
    operation: row.operation,
    phoneNumbers: row.phone_numbers,
    sourceUrl: row.source_url,
    note: row.note,
    isFavorite: row.is_favorite,
    location: toLocation(row),
    contactedAt: row.contacted_at,
    visitedAt: row.visited_at,
    discardedAt: row.discarded_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function mapPhoto(row: PhotoRow): OpportunityPhoto {
  return {
    id: row.id,
    userId: row.user_id,
    opportunityId: row.opportunity_id,
    storagePath: row.storage_path,
    mimeType: row.mime_type,
    width: row.width,
    height: row.height,
    extractedText: row.extracted_text,
    createdAt: row.created_at,
  };
}

function locationColumns(location: OpportunityLocation | undefined) {
  if (!location) {
    return {
      location_precision: null,
      location_label: null,
      district: null,
      address: null,
      latitude: null,
      longitude: null,
    };
  }

  return {
    location_precision: location.precision,
    location_label: location.label ?? null,
    district: location.district ?? null,
    address: location.address ?? null,
    latitude: location.latitude ?? null,
    longitude: location.longitude ?? null,
  };
}

/**
 * Auth-scoped persistence contract. The caller supplies the authenticated user
 * id so inserts remain explicit; database RLS is the final authority.
 */
export class SupabaseOpportunityRepository {
  constructor(private readonly client: SupabaseClient<Database>) {}

  async listSearches(userId: string): Promise<Search[]> {
    const result = await this.client
      .from("searches")
      .select()
      .eq("user_id", userId)
      .order("updated_at", { ascending: false });

    if (result.error) {
      throw new OpportunityRepositoryError(`Could not load searches: ${result.error.message}`);
    }

    return (result.data ?? []).map(mapSearch);
  }

  async createSearch(userId: string, input: NewSearch): Promise<Search> {
    const result = await this.client
      .from("searches")
      .insert({
        user_id: userId,
        name: input.name.trim(),
        criteria: input.criteria ?? {},
      })
      .select()
      .single();

    return mapSearch(unwrap(result, "Could not create search"));
  }

  async updateSearch(
    userId: string,
    searchId: string,
    patch: { name?: string; criteria?: SearchCriteria },
  ): Promise<Search> {
    const update = {
      ...(patch.name === undefined ? {} : { name: patch.name.trim() }),
      ...(patch.criteria === undefined ? {} : { criteria: patch.criteria }),
    };
    const result = await this.client
      .from("searches")
      .update(update)
      .eq("id", searchId)
      .eq("user_id", userId)
      .select()
      .single();

    return mapSearch(unwrap(result, "Could not update search"));
  }

  async listOpportunities(searchId: string): Promise<Opportunity[]> {
    const result = await this.client
      .from("opportunities")
      .select()
      .eq("search_id", searchId)
      .order("updated_at", { ascending: false });

    if (result.error) {
      throw new OpportunityRepositoryError(
        `Could not load opportunities: ${result.error.message}`,
      );
    }

    return (result.data ?? []).map(mapOpportunity);
  }

  async createOpportunity(userId: string, input: NewOpportunity): Promise<Opportunity> {
    const result = await this.client
      .from("opportunities")
      .insert({
        user_id: userId,
        search_id: input.searchId,
        origin: input.origin,
        status: input.status ?? "new",
        title: input.title ?? null,
        property_type: input.propertyType ?? null,
        operation: input.operation ?? null,
        phone_numbers: input.phoneNumbers ?? [],
        source_url: input.sourceUrl ?? null,
        note: input.note ?? null,
        is_favorite: input.isFavorite ?? false,
        ...locationColumns(input.location),
      })
      .select()
      .single();

    return mapOpportunity(unwrap(result, "Could not create opportunity"));
  }

  async updateOpportunity(
    userId: string,
    opportunityId: string,
    patch: OpportunityPatch,
  ): Promise<Opportunity> {
    const update = {
      ...(patch.status === undefined ? {} : { status: patch.status }),
      ...(patch.title === undefined ? {} : { title: patch.title }),
      ...(patch.propertyType === undefined
        ? {}
        : { property_type: patch.propertyType }),
      ...(patch.operation === undefined ? {} : { operation: patch.operation }),
      ...(patch.phoneNumbers === undefined
        ? {}
        : { phone_numbers: patch.phoneNumbers }),
      ...(patch.sourceUrl === undefined ? {} : { source_url: patch.sourceUrl }),
      ...(patch.note === undefined ? {} : { note: patch.note }),
      ...(patch.isFavorite === undefined ? {} : { is_favorite: patch.isFavorite }),
      ...(patch.location === undefined ? {} : locationColumns(patch.location)),
    };
    const result = await this.client
      .from("opportunities")
      .update(update)
      .eq("id", opportunityId)
      .eq("user_id", userId)
      .select()
      .single();

    return mapOpportunity(unwrap(result, "Could not update opportunity"));
  }

  async attachPhoto(
    userId: string,
    input: Omit<OpportunityPhoto, "id" | "createdAt">,
  ): Promise<OpportunityPhoto> {
    const result = await this.client
      .from("opportunity_photos")
      .insert({
        user_id: userId,
        opportunity_id: input.opportunityId,
        storage_path: input.storagePath,
        mime_type: input.mimeType ?? null,
        width: input.width ?? null,
        height: input.height ?? null,
        extracted_text: input.extractedText ?? null,
      })
      .select()
      .single();

    return mapPhoto(unwrap(result, "Could not attach photo"));
  }
}
