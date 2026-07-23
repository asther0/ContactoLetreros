import type {
  LocationPrecision,
  OpportunityOperation,
  OpportunityOrigin,
  OpportunityStatus,
  SearchCriteria,
} from "../domain/opportunities";

type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

export interface Database {
  public: {
    Tables: {
      searches: {
        Row: {
          id: string;
          user_id: string;
          name: string;
          criteria: SearchCriteria;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          name: string;
          criteria?: SearchCriteria;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          name?: string;
          criteria?: SearchCriteria;
          updated_at?: string;
        };
        Relationships: [];
      };
      opportunities: {
        Row: {
          id: string;
          user_id: string;
          search_id: string;
          origin: OpportunityOrigin;
          status: OpportunityStatus;
          title: string | null;
          property_type: string | null;
          operation: OpportunityOperation | null;
          phone_numbers: string[];
          source_url: string | null;
          note: string | null;
          is_favorite: boolean;
          location_precision: LocationPrecision | null;
          location_label: string | null;
          district: string | null;
          address: string | null;
          latitude: number | null;
          longitude: number | null;
          contacted_at: string | null;
          visited_at: string | null;
          discarded_at: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          search_id: string;
          origin: OpportunityOrigin;
          status?: OpportunityStatus;
          title?: string | null;
          property_type?: string | null;
          operation?: OpportunityOperation | null;
          phone_numbers?: string[];
          source_url?: string | null;
          note?: string | null;
          is_favorite?: boolean;
          location_precision?: LocationPrecision | null;
          location_label?: string | null;
          district?: string | null;
          address?: string | null;
          latitude?: number | null;
          longitude?: number | null;
          contacted_at?: string | null;
          visited_at?: string | null;
          discarded_at?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: Omit<Partial<Database["public"]["Tables"]["opportunities"]["Insert"]>, "id" | "user_id" | "search_id" | "origin">;
        Relationships: [];
      };
      opportunity_photos: {
        Row: {
          id: string;
          user_id: string;
          opportunity_id: string;
          storage_path: string;
          mime_type: string | null;
          width: number | null;
          height: number | null;
          extracted_text: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          opportunity_id: string;
          storage_path: string;
          mime_type?: string | null;
          width?: number | null;
          height?: number | null;
          extracted_text?: string | null;
          created_at?: string;
        };
        Update: {
          mime_type?: string | null;
          width?: number | null;
          height?: number | null;
          extracted_text?: string | null;
        };
        Relationships: [];
      };
      entitlements: {
        Row: {
          id: string;
          user_id: string;
          kind: "search_pass" | "ai_credits";
          provider: "polar" | "manual" | null;
          provider_reference: string | null;
          starts_at: string;
          ends_at: string | null;
          ai_credits: number | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          kind: "search_pass" | "ai_credits";
          provider?: "polar" | "manual" | null;
          provider_reference?: string | null;
          starts_at?: string;
          ends_at?: string | null;
          ai_credits?: number | null;
          created_at?: string;
        };
        Update: {
          ends_at?: string | null;
          ai_credits?: number | null;
        };
        Relationships: [];
      };
      ai_usage: {
        Row: {
          id: string;
          user_id: string;
          opportunity_id: string | null;
          usage_month: string;
          units: number;
          provider_request_id: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          opportunity_id?: string | null;
          usage_month?: string;
          units?: number;
          provider_request_id?: string | null;
          created_at?: string;
        };
        Update: never;
        Relationships: [];
      };
    };
    Views: Record<string, never>;
    Functions: Record<string, never>;
    Enums: {
      opportunity_origin: OpportunityOrigin;
      opportunity_status: OpportunityStatus;
      location_precision: LocationPrecision;
    };
    CompositeTypes: Record<string, never>;
  };
}

export type DatabaseJson = Json;
