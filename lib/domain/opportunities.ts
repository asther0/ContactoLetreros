export const opportunityOrigins = [
  "street",
  "airbnb",
  "facebook",
  "adondevivir",
  "other",
] as const;

export type OpportunityOrigin = (typeof opportunityOrigins)[number];

export const opportunityStatuses = [
  "new",
  "contacted",
  "visited",
  "discarded",
] as const;

export type OpportunityStatus = (typeof opportunityStatuses)[number];

export type LocationPrecision = "exact" | "approximate";
export type OpportunityOperation = "rent" | "sale";

export interface SearchCriteria {
  city?: string;
  districts?: string[];
  maxBudget?: number;
  currency?: string;
  moveInAfter?: string;
  bedrooms?: number;
}

export interface Search {
  id: string;
  userId: string;
  name: string;
  criteria: SearchCriteria;
  createdAt: string;
  updatedAt: string;
}

export interface OpportunityLocation {
  precision: LocationPrecision;
  label?: string | null;
  district?: string | null;
  address?: string | null;
  latitude?: number | null;
  longitude?: number | null;
}

export interface Opportunity {
  id: string;
  userId: string;
  searchId: string;
  origin: OpportunityOrigin;
  status: OpportunityStatus;
  title?: string | null;
  propertyType?: string | null;
  operation?: OpportunityOperation | null;
  phoneNumbers: string[];
  sourceUrl?: string | null;
  note?: string | null;
  isFavorite: boolean;
  location?: OpportunityLocation | null;
  contactedAt?: string | null;
  visitedAt?: string | null;
  discardedAt?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface OpportunityPhoto {
  id: string;
  userId: string;
  opportunityId: string;
  storagePath: string;
  mimeType?: string | null;
  width?: number | null;
  height?: number | null;
  extractedText?: string | null;
  createdAt: string;
}

export interface NewSearch {
  name: string;
  criteria?: SearchCriteria;
}

export interface NewOpportunity {
  searchId: string;
  origin: OpportunityOrigin;
  status?: OpportunityStatus;
  title?: string;
  propertyType?: string;
  operation?: OpportunityOperation;
  phoneNumbers?: string[];
  sourceUrl?: string;
  note?: string;
  isFavorite?: boolean;
  location?: OpportunityLocation;
}

export type OpportunityPatch = Omit<Partial<NewOpportunity>, "searchId" | "origin"> & {
  status?: OpportunityStatus;
};
