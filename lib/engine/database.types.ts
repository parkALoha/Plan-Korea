export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.5"
  }
  public: {
    Tables: {
      bookings: {
        Row: {
          added_by_user: string | null
          book_by_days_before: number | null
          category: string
          confirmation_number: string | null
          created_at: string
          date: string | null
          deleted_at: string | null
          file_name: string | null
          file_path: string | null
          id: string
          legacy_added_by: string | null
          link: string | null
          note: string | null
          price_amount: number | null
          price_currency: string | null
          status: string
          time: string | null
          title: string
          trip_day_id: string | null
          trip_id: string
          updated_at: string
          updated_by_user: string | null
        }
        Insert: {
          added_by_user?: string | null
          book_by_days_before?: number | null
          category: string
          confirmation_number?: string | null
          created_at?: string
          date?: string | null
          deleted_at?: string | null
          file_name?: string | null
          file_path?: string | null
          id?: string
          legacy_added_by?: string | null
          link?: string | null
          note?: string | null
          price_amount?: number | null
          price_currency?: string | null
          status?: string
          time?: string | null
          title: string
          trip_day_id?: string | null
          trip_id: string
          updated_at?: string
          updated_by_user?: string | null
        }
        Update: {
          added_by_user?: string | null
          book_by_days_before?: number | null
          category?: string
          confirmation_number?: string | null
          created_at?: string
          date?: string | null
          deleted_at?: string | null
          file_name?: string | null
          file_path?: string | null
          id?: string
          legacy_added_by?: string | null
          link?: string | null
          note?: string | null
          price_amount?: number | null
          price_currency?: string | null
          status?: string
          time?: string | null
          title?: string
          trip_day_id?: string | null
          trip_id?: string
          updated_at?: string
          updated_by_user?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "bookings_added_by_user_fkey"
            columns: ["added_by_user"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bookings_day_fk"
            columns: ["trip_id", "trip_day_id"]
            isOneToOne: false
            referencedRelation: "trip_days"
            referencedColumns: ["trip_id", "id"]
          },
          {
            foreignKeyName: "bookings_trip_fk"
            columns: ["trip_id"]
            isOneToOne: false
            referencedRelation: "trips"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bookings_updated_by_user_fkey"
            columns: ["updated_by_user"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      catalog_cities: {
        Row: {
          country_id: string
          created_at: string
          id: string
          lat: number
          legacy_slug: string | null
          lng: number
          name_en: string
          name_local: string | null
          name_th: string
          timezone: string
          updated_at: string
        }
        Insert: {
          country_id: string
          created_at?: string
          id?: string
          lat: number
          legacy_slug?: string | null
          lng: number
          name_en: string
          name_local?: string | null
          name_th: string
          timezone: string
          updated_at?: string
        }
        Update: {
          country_id?: string
          created_at?: string
          id?: string
          lat?: number
          legacy_slug?: string | null
          lng?: number
          name_en?: string
          name_local?: string | null
          name_th?: string
          timezone?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "catalog_cities_country_id_fkey"
            columns: ["country_id"]
            isOneToOne: false
            referencedRelation: "catalog_countries"
            referencedColumns: ["id"]
          },
        ]
      }
      catalog_countries: {
        Row: {
          created_at: string
          id: string
          name_en: string
          name_th: string
          nav_providers: string[]
          supported: boolean
          updated_at: string
        }
        Insert: {
          created_at?: string
          id: string
          name_en: string
          name_th: string
          nav_providers?: string[]
          supported?: boolean
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          name_en?: string
          name_th?: string
          nav_providers?: string[]
          supported?: boolean
          updated_at?: string
        }
        Relationships: []
      }
      catalog_country_contacts: {
        Row: {
          country_id: string
          created_at: string
          detail: string | null
          icon: string | null
          id: string
          label: string
          local_number: string | null
          priority: number
          tel: string | null
          updated_at: string
          url: string | null
        }
        Insert: {
          country_id: string
          created_at?: string
          detail?: string | null
          icon?: string | null
          id?: string
          label: string
          local_number?: string | null
          priority?: number
          tel?: string | null
          updated_at?: string
          url?: string | null
        }
        Update: {
          country_id?: string
          created_at?: string
          detail?: string | null
          icon?: string | null
          id?: string
          label?: string
          local_number?: string | null
          priority?: number
          tel?: string | null
          updated_at?: string
          url?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "catalog_country_contacts_country_id_fkey"
            columns: ["country_id"]
            isOneToOne: false
            referencedRelation: "catalog_countries"
            referencedColumns: ["id"]
          },
        ]
      }
      catalog_place_access: {
        Row: {
          created_at: string
          from_label: string
          icon: string | null
          id: string
          label: string
          legacy_slug: string | null
          minutes: number
          note: string | null
          place_id: string
          priority: number
          updated_at: string
        }
        Insert: {
          created_at?: string
          from_label: string
          icon?: string | null
          id?: string
          label: string
          legacy_slug?: string | null
          minutes: number
          note?: string | null
          place_id: string
          priority?: number
          updated_at?: string
        }
        Update: {
          created_at?: string
          from_label?: string
          icon?: string | null
          id?: string
          label?: string
          legacy_slug?: string | null
          minutes?: number
          note?: string | null
          place_id?: string
          priority?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "catalog_place_access_place_id_fkey"
            columns: ["place_id"]
            isOneToOne: false
            referencedRelation: "catalog_places"
            referencedColumns: ["id"]
          },
        ]
      }
      catalog_place_descriptions: {
        Row: {
          created_at: string
          description: string
          locale: string
          place_id: string
          source: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          description: string
          locale: string
          place_id: string
          source?: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          description?: string
          locale?: string
          place_id?: string
          source?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "catalog_place_descriptions_place_id_fkey"
            columns: ["place_id"]
            isOneToOne: false
            referencedRelation: "catalog_places"
            referencedColumns: ["id"]
          },
        ]
      }
      catalog_place_names: {
        Row: {
          city_id: string
          created_at: string
          locale: string
          name: string
          place_id: string
          priority: number
          source: string
          updated_at: string
        }
        Insert: {
          city_id: string
          created_at?: string
          locale: string
          name: string
          place_id: string
          priority?: number
          source?: string
          updated_at?: string
        }
        Update: {
          city_id?: string
          created_at?: string
          locale?: string
          name?: string
          place_id?: string
          priority?: number
          source?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "cpn_place_fk"
            columns: ["city_id", "place_id"]
            isOneToOne: false
            referencedRelation: "catalog_places"
            referencedColumns: ["city_id", "id"]
          },
        ]
      }
      catalog_places: {
        Row: {
          address_local: string | null
          category: string
          city_id: string
          created_at: string
          google_place_id: string | null
          id: string
          lat: number
          legacy_slug: string | null
          lng: number
          maps_query: string | null
          picker_hidden: boolean
          source: string
          transfer_kind: string | null
          updated_at: string
          weather_sensitivity: string | null
          youtube_query: string | null
        }
        Insert: {
          address_local?: string | null
          category: string
          city_id: string
          created_at?: string
          google_place_id?: string | null
          id?: string
          lat: number
          legacy_slug?: string | null
          lng: number
          maps_query?: string | null
          picker_hidden?: boolean
          source?: string
          transfer_kind?: string | null
          updated_at?: string
          weather_sensitivity?: string | null
          youtube_query?: string | null
        }
        Update: {
          address_local?: string | null
          category?: string
          city_id?: string
          created_at?: string
          google_place_id?: string | null
          id?: string
          lat?: number
          legacy_slug?: string | null
          lng?: number
          maps_query?: string | null
          picker_hidden?: boolean
          source?: string
          transfer_kind?: string | null
          updated_at?: string
          weather_sensitivity?: string | null
          youtube_query?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "catalog_places_city_id_fkey"
            columns: ["city_id"]
            isOneToOne: false
            referencedRelation: "catalog_cities"
            referencedColumns: ["id"]
          },
        ]
      }
      checklist_items: {
        Row: {
          added_by_user: string | null
          category: string | null
          checked_by_user: string | null
          created_at: string
          deleted_at: string | null
          id: string
          is_checked: boolean
          legacy_added_by: string | null
          legacy_checked_by: string | null
          text: string
          trip_id: string
          updated_at: string
          updated_by_user: string | null
        }
        Insert: {
          added_by_user?: string | null
          category?: string | null
          checked_by_user?: string | null
          created_at?: string
          deleted_at?: string | null
          id?: string
          is_checked?: boolean
          legacy_added_by?: string | null
          legacy_checked_by?: string | null
          text: string
          trip_id: string
          updated_at?: string
          updated_by_user?: string | null
        }
        Update: {
          added_by_user?: string | null
          category?: string | null
          checked_by_user?: string | null
          created_at?: string
          deleted_at?: string | null
          id?: string
          is_checked?: boolean
          legacy_added_by?: string | null
          legacy_checked_by?: string | null
          text?: string
          trip_id?: string
          updated_at?: string
          updated_by_user?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "checklist_items_added_by_user_fkey"
            columns: ["added_by_user"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "checklist_items_checked_by_user_fkey"
            columns: ["checked_by_user"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "checklist_items_trip_id_fkey"
            columns: ["trip_id"]
            isOneToOne: false
            referencedRelation: "trips"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "checklist_items_updated_by_user_fkey"
            columns: ["updated_by_user"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      custom_place_descriptions: {
        Row: {
          created_at: string
          description: string
          locale: string
          place_id: string
          source: string
          trip_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          description: string
          locale: string
          place_id: string
          source?: string
          trip_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          description?: string
          locale?: string
          place_id?: string
          source?: string
          trip_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "cpd_custom_place_fk"
            columns: ["trip_id", "place_id"]
            isOneToOne: false
            referencedRelation: "custom_places"
            referencedColumns: ["trip_id", "id"]
          },
        ]
      }
      custom_place_names: {
        Row: {
          created_at: string
          locale: string
          name: string
          place_id: string
          priority: number
          source: string
          trip_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          locale: string
          name: string
          place_id: string
          priority?: number
          source?: string
          trip_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          locale?: string
          name?: string
          place_id?: string
          priority?: number
          source?: string
          trip_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "cpn_custom_place_fk"
            columns: ["trip_id", "place_id"]
            isOneToOne: false
            referencedRelation: "custom_places"
            referencedColumns: ["trip_id", "id"]
          },
        ]
      }
      custom_places: {
        Row: {
          added_by_user: string | null
          category: string
          city_id: string
          created_at: string
          deleted_at: string | null
          google_place_id: string | null
          id: string
          lat: number
          legacy_added_by: string | null
          lng: number
          maps_query: string | null
          trip_id: string
          updated_at: string
          updated_by_user: string | null
        }
        Insert: {
          added_by_user?: string | null
          category: string
          city_id: string
          created_at?: string
          deleted_at?: string | null
          google_place_id?: string | null
          id?: string
          lat: number
          legacy_added_by?: string | null
          lng: number
          maps_query?: string | null
          trip_id: string
          updated_at?: string
          updated_by_user?: string | null
        }
        Update: {
          added_by_user?: string | null
          category?: string
          city_id?: string
          created_at?: string
          deleted_at?: string | null
          google_place_id?: string | null
          id?: string
          lat?: number
          legacy_added_by?: string | null
          lng?: number
          maps_query?: string | null
          trip_id?: string
          updated_at?: string
          updated_by_user?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "custom_places_added_by_user_fkey"
            columns: ["added_by_user"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "custom_places_city_id_fkey"
            columns: ["city_id"]
            isOneToOne: false
            referencedRelation: "catalog_cities"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "custom_places_trip_id_fkey"
            columns: ["trip_id"]
            isOneToOne: false
            referencedRelation: "trips"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "custom_places_updated_by_user_fkey"
            columns: ["updated_by_user"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      hidden_places: {
        Row: {
          catalog_place_id: string | null
          custom_place_id: string | null
          hidden_at: string
          hidden_by_user: string | null
          id: string
          legacy_hidden_by: string | null
          trip_id: string
        }
        Insert: {
          catalog_place_id?: string | null
          custom_place_id?: string | null
          hidden_at?: string
          hidden_by_user?: string | null
          id?: string
          legacy_hidden_by?: string | null
          trip_id: string
        }
        Update: {
          catalog_place_id?: string | null
          custom_place_id?: string | null
          hidden_at?: string
          hidden_by_user?: string | null
          id?: string
          legacy_hidden_by?: string | null
          trip_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "hidden_places_catalog_place_id_fkey"
            columns: ["catalog_place_id"]
            isOneToOne: false
            referencedRelation: "catalog_places"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "hidden_places_custom_place_id_fkey"
            columns: ["custom_place_id"]
            isOneToOne: false
            referencedRelation: "custom_places"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "hidden_places_hidden_by_user_fkey"
            columns: ["hidden_by_user"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "hidden_places_trip_id_fkey"
            columns: ["trip_id"]
            isOneToOne: false
            referencedRelation: "trips"
            referencedColumns: ["id"]
          },
        ]
      }
      place_details_cache: {
        Row: {
          fetched_at: string
          google_place_id: string | null
          maps_query: string
          opening_hours: Json | null
          primary_type: string | null
          rating: number | null
          reviews: Json | null
          user_rating_count: number | null
        }
        Insert: {
          fetched_at?: string
          google_place_id?: string | null
          maps_query: string
          opening_hours?: Json | null
          primary_type?: string | null
          rating?: number | null
          reviews?: Json | null
          user_rating_count?: number | null
        }
        Update: {
          fetched_at?: string
          google_place_id?: string | null
          maps_query?: string
          opening_hours?: Json | null
          primary_type?: string | null
          rating?: number | null
          reviews?: Json | null
          user_rating_count?: number | null
        }
        Relationships: []
      }
      place_details_local_cache: {
        Row: {
          address_local: string | null
          fetched_at: string
          locale: string
          maps_query: string
          name_local: string | null
        }
        Insert: {
          address_local?: string | null
          fetched_at?: string
          locale: string
          maps_query: string
          name_local?: string | null
        }
        Update: {
          address_local?: string | null
          fetched_at?: string
          locale?: string
          maps_query?: string
          name_local?: string | null
        }
        Relationships: []
      }
      place_notes: {
        Row: {
          added_by_user: string | null
          catalog_place_id: string | null
          created_at: string
          custom_place_id: string | null
          deleted_at: string | null
          id: string
          legacy_added_by: string | null
          note: string | null
          photo_path: string | null
          plan_id: string
          trip_id: string
          updated_at: string
          updated_by_user: string | null
        }
        Insert: {
          added_by_user?: string | null
          catalog_place_id?: string | null
          created_at?: string
          custom_place_id?: string | null
          deleted_at?: string | null
          id?: string
          legacy_added_by?: string | null
          note?: string | null
          photo_path?: string | null
          plan_id: string
          trip_id: string
          updated_at?: string
          updated_by_user?: string | null
        }
        Update: {
          added_by_user?: string | null
          catalog_place_id?: string | null
          created_at?: string
          custom_place_id?: string | null
          deleted_at?: string | null
          id?: string
          legacy_added_by?: string | null
          note?: string | null
          photo_path?: string | null
          plan_id?: string
          trip_id?: string
          updated_at?: string
          updated_by_user?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "place_notes_added_by_user_fkey"
            columns: ["added_by_user"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "place_notes_catalog_place_id_fkey"
            columns: ["catalog_place_id"]
            isOneToOne: false
            referencedRelation: "catalog_places"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "place_notes_custom_place_fk"
            columns: ["trip_id", "custom_place_id"]
            isOneToOne: false
            referencedRelation: "custom_places"
            referencedColumns: ["trip_id", "id"]
          },
          {
            foreignKeyName: "place_notes_plan_fk"
            columns: ["trip_id", "plan_id"]
            isOneToOne: false
            referencedRelation: "trip_plans"
            referencedColumns: ["trip_id", "id"]
          },
          {
            foreignKeyName: "place_notes_updated_by_user_fkey"
            columns: ["updated_by_user"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      place_photo_cache: {
        Row: {
          fetched_at: string
          maps_query: string
          photo_names: string[]
        }
        Insert: {
          fetched_at?: string
          maps_query: string
          photo_names?: string[]
        }
        Update: {
          fetched_at?: string
          maps_query?: string
          photo_names?: string[]
        }
        Relationships: []
      }
      profiles: {
        Row: {
          created_at: string
          display_name: string
          home_country: string | null
          id: string
          locale: string
          updated_at: string
          updated_by_user: string | null
        }
        Insert: {
          created_at?: string
          display_name: string
          home_country?: string | null
          id: string
          locale?: string
          updated_at?: string
          updated_by_user?: string | null
        }
        Update: {
          created_at?: string
          display_name?: string
          home_country?: string | null
          id?: string
          locale?: string
          updated_at?: string
          updated_by_user?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "profiles_updated_by_user_fkey"
            columns: ["updated_by_user"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      travel_time_cache: {
        Row: {
          distance_meters: number | null
          duration_minutes: number
          fetched_at: string
          from_place_id: string
          to_place_id: string
          travel_mode: string
        }
        Insert: {
          distance_meters?: number | null
          duration_minutes: number
          fetched_at?: string
          from_place_id: string
          to_place_id: string
          travel_mode: string
        }
        Update: {
          distance_meters?: number | null
          duration_minutes?: number
          fetched_at?: string
          from_place_id?: string
          to_place_id?: string
          travel_mode?: string
        }
        Relationships: []
      }
      trip_day_plan_settings: {
        Row: {
          created_at: string
          is_locked: boolean
          note: string | null
          plan_id: string
          return_travel_mode: string | null
          start_time: string
          trip_day_id: string
          trip_id: string
          updated_at: string
          updated_by_user: string | null
        }
        Insert: {
          created_at?: string
          is_locked?: boolean
          note?: string | null
          plan_id: string
          return_travel_mode?: string | null
          start_time?: string
          trip_day_id: string
          trip_id: string
          updated_at?: string
          updated_by_user?: string | null
        }
        Update: {
          created_at?: string
          is_locked?: boolean
          note?: string | null
          plan_id?: string
          return_travel_mode?: string | null
          start_time?: string
          trip_day_id?: string
          trip_id?: string
          updated_at?: string
          updated_by_user?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "tdps_day_fk"
            columns: ["trip_id", "trip_day_id"]
            isOneToOne: false
            referencedRelation: "trip_days"
            referencedColumns: ["trip_id", "id"]
          },
          {
            foreignKeyName: "tdps_plan_fk"
            columns: ["trip_id", "plan_id"]
            isOneToOne: false
            referencedRelation: "trip_plans"
            referencedColumns: ["trip_id", "id"]
          },
          {
            foreignKeyName: "trip_day_plan_settings_updated_by_user_fkey"
            columns: ["updated_by_user"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      trip_days: {
        Row: {
          city_id: string | null
          created_at: string
          date: string
          id: string
          overnight_city_id: string | null
          overnight_kind: string | null
          timezone: string | null
          trip_id: string
          updated_at: string
          updated_by_user: string | null
        }
        Insert: {
          city_id?: string | null
          created_at?: string
          date: string
          id?: string
          overnight_city_id?: string | null
          overnight_kind?: string | null
          timezone?: string | null
          trip_id: string
          updated_at?: string
          updated_by_user?: string | null
        }
        Update: {
          city_id?: string | null
          created_at?: string
          date?: string
          id?: string
          overnight_city_id?: string | null
          overnight_kind?: string | null
          timezone?: string | null
          trip_id?: string
          updated_at?: string
          updated_by_user?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "trip_days_city_id_fkey"
            columns: ["city_id"]
            isOneToOne: false
            referencedRelation: "catalog_cities"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "trip_days_overnight_city_id_fkey"
            columns: ["overnight_city_id"]
            isOneToOne: false
            referencedRelation: "catalog_cities"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "trip_days_trip_id_fkey"
            columns: ["trip_id"]
            isOneToOne: false
            referencedRelation: "trips"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "trip_days_updated_by_user_fkey"
            columns: ["updated_by_user"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      trip_destinations: {
        Row: {
          city_id: string
          rank: number
          trip_id: string
        }
        Insert: {
          city_id: string
          rank: number
          trip_id: string
        }
        Update: {
          city_id?: string
          rank?: number
          trip_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "trip_destinations_city_id_fkey"
            columns: ["city_id"]
            isOneToOne: false
            referencedRelation: "catalog_cities"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "trip_destinations_trip_id_fkey"
            columns: ["trip_id"]
            isOneToOne: false
            referencedRelation: "trips"
            referencedColumns: ["id"]
          },
        ]
      }
      trip_hotels: {
        Row: {
          added_by_user: string | null
          address_en: string | null
          address_local: string | null
          check_in: string
          check_out: string
          city_id: string
          created_at: string
          deleted_at: string | null
          formatted_address: string | null
          hotel_name: string
          id: string
          lat: number | null
          legacy_added_by: string | null
          lng: number | null
          name_en: string | null
          name_local: string | null
          phone: string | null
          price_amount: number | null
          price_currency: string | null
          price_source: string | null
          trip_id: string
          updated_at: string
          updated_by_user: string | null
        }
        Insert: {
          added_by_user?: string | null
          address_en?: string | null
          address_local?: string | null
          check_in: string
          check_out: string
          city_id: string
          created_at?: string
          deleted_at?: string | null
          formatted_address?: string | null
          hotel_name: string
          id?: string
          lat?: number | null
          legacy_added_by?: string | null
          lng?: number | null
          name_en?: string | null
          name_local?: string | null
          phone?: string | null
          price_amount?: number | null
          price_currency?: string | null
          price_source?: string | null
          trip_id: string
          updated_at?: string
          updated_by_user?: string | null
        }
        Update: {
          added_by_user?: string | null
          address_en?: string | null
          address_local?: string | null
          check_in?: string
          check_out?: string
          city_id?: string
          created_at?: string
          deleted_at?: string | null
          formatted_address?: string | null
          hotel_name?: string
          id?: string
          lat?: number | null
          legacy_added_by?: string | null
          lng?: number | null
          name_en?: string | null
          name_local?: string | null
          phone?: string | null
          price_amount?: number | null
          price_currency?: string | null
          price_source?: string | null
          trip_id?: string
          updated_at?: string
          updated_by_user?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "trip_hotels_added_by_user_fkey"
            columns: ["added_by_user"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "trip_hotels_city_id_fkey"
            columns: ["city_id"]
            isOneToOne: false
            referencedRelation: "catalog_cities"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "trip_hotels_trip_id_fkey"
            columns: ["trip_id"]
            isOneToOne: false
            referencedRelation: "trips"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "trip_hotels_updated_by_user_fkey"
            columns: ["updated_by_user"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      trip_members: {
        Row: {
          created_at: string
          invited_by: string | null
          pinned_at: string | null
          role: string
          trip_id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          invited_by?: string | null
          pinned_at?: string | null
          role: string
          trip_id: string
          user_id: string
        }
        Update: {
          created_at?: string
          invited_by?: string | null
          pinned_at?: string | null
          role?: string
          trip_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "trip_members_invited_by_fkey"
            columns: ["invited_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "trip_members_trip_id_fkey"
            columns: ["trip_id"]
            isOneToOne: false
            referencedRelation: "trips"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "trip_members_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      trip_plans: {
        Row: {
          created_at: string
          id: string
          is_active: boolean
          name: string
          trip_id: string
          updated_at: string
          updated_by_user: string | null
        }
        Insert: {
          created_at?: string
          id?: string
          is_active?: boolean
          name: string
          trip_id: string
          updated_at?: string
          updated_by_user?: string | null
        }
        Update: {
          created_at?: string
          id?: string
          is_active?: boolean
          name?: string
          trip_id?: string
          updated_at?: string
          updated_by_user?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "trip_plans_trip_id_fkey"
            columns: ["trip_id"]
            isOneToOne: false
            referencedRelation: "trips"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "trip_plans_updated_by_user_fkey"
            columns: ["updated_by_user"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      trip_stops: {
        Row: {
          added_by_user: string | null
          catalog_place_id: string | null
          created_at: string
          custom_place_id: string | null
          day_offset: number
          deleted_at: string | null
          dwell_minutes: number | null
          event_kind: string | null
          fixed_end_time: string | null
          fixed_start_time: string | null
          flight_from_code: string | null
          flight_from_en: string | null
          flight_no: string | null
          flight_to_code: string | null
          flight_to_en: string | null
          icon: string | null
          id: string
          intercity_from: string | null
          intercity_mode: string | null
          intercity_to: string | null
          is_alert: boolean
          kind: string
          layover_baggage: string | null
          layover_immigration: string | null
          layover_leaves_airport: boolean | null
          layover_terminal_change: boolean | null
          legacy_added_by: string | null
          note: string | null
          photo_path: string | null
          place_ref: string | null
          plan_id: string
          rank: string
          schedule_bound: string | null
          time_is_flexible: boolean
          title: string | null
          title_en: string | null
          transfer_target_label: string | null
          transfer_target_time: string | null
          travel_mode: string | null
          trip_day_id: string
          trip_id: string
          updated_at: string
          updated_by_user: string | null
          visited_at: string | null
        }
        Insert: {
          added_by_user?: string | null
          catalog_place_id?: string | null
          created_at?: string
          custom_place_id?: string | null
          day_offset?: number
          deleted_at?: string | null
          dwell_minutes?: number | null
          event_kind?: string | null
          fixed_end_time?: string | null
          fixed_start_time?: string | null
          flight_from_code?: string | null
          flight_from_en?: string | null
          flight_no?: string | null
          flight_to_code?: string | null
          flight_to_en?: string | null
          icon?: string | null
          id?: string
          intercity_from?: string | null
          intercity_mode?: string | null
          intercity_to?: string | null
          is_alert?: boolean
          kind?: string
          layover_baggage?: string | null
          layover_immigration?: string | null
          layover_leaves_airport?: boolean | null
          layover_terminal_change?: boolean | null
          legacy_added_by?: string | null
          note?: string | null
          photo_path?: string | null
          place_ref?: string | null
          plan_id: string
          rank: string
          schedule_bound?: string | null
          time_is_flexible?: boolean
          title?: string | null
          title_en?: string | null
          transfer_target_label?: string | null
          transfer_target_time?: string | null
          travel_mode?: string | null
          trip_day_id: string
          trip_id: string
          updated_at?: string
          updated_by_user?: string | null
          visited_at?: string | null
        }
        Update: {
          added_by_user?: string | null
          catalog_place_id?: string | null
          created_at?: string
          custom_place_id?: string | null
          day_offset?: number
          deleted_at?: string | null
          dwell_minutes?: number | null
          event_kind?: string | null
          fixed_end_time?: string | null
          fixed_start_time?: string | null
          flight_from_code?: string | null
          flight_from_en?: string | null
          flight_no?: string | null
          flight_to_code?: string | null
          flight_to_en?: string | null
          icon?: string | null
          id?: string
          intercity_from?: string | null
          intercity_mode?: string | null
          intercity_to?: string | null
          is_alert?: boolean
          kind?: string
          layover_baggage?: string | null
          layover_immigration?: string | null
          layover_leaves_airport?: boolean | null
          layover_terminal_change?: boolean | null
          legacy_added_by?: string | null
          note?: string | null
          photo_path?: string | null
          place_ref?: string | null
          plan_id?: string
          rank?: string
          schedule_bound?: string | null
          time_is_flexible?: boolean
          title?: string | null
          title_en?: string | null
          transfer_target_label?: string | null
          transfer_target_time?: string | null
          travel_mode?: string | null
          trip_day_id?: string
          trip_id?: string
          updated_at?: string
          updated_by_user?: string | null
          visited_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "trip_stops_added_by_user_fkey"
            columns: ["added_by_user"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "trip_stops_catalog_place_id_fkey"
            columns: ["catalog_place_id"]
            isOneToOne: false
            referencedRelation: "catalog_places"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "trip_stops_custom_place_fk"
            columns: ["trip_id", "custom_place_id"]
            isOneToOne: false
            referencedRelation: "custom_places"
            referencedColumns: ["trip_id", "id"]
          },
          {
            foreignKeyName: "trip_stops_day_fk"
            columns: ["trip_id", "trip_day_id"]
            isOneToOne: false
            referencedRelation: "trip_days"
            referencedColumns: ["trip_id", "id"]
          },
          {
            foreignKeyName: "trip_stops_plan_fk"
            columns: ["trip_id", "plan_id"]
            isOneToOne: false
            referencedRelation: "trip_plans"
            referencedColumns: ["trip_id", "id"]
          },
          {
            foreignKeyName: "trip_stops_updated_by_user_fkey"
            columns: ["updated_by_user"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      trips: {
        Row: {
          base_timezone: string
          created_at: string
          created_by: string
          deleted_at: string | null
          end_date: string
          id: string
          published_template_at: string | null
          start_date: string
          status: string
          title: string
          updated_at: string
          updated_by_user: string | null
        }
        Insert: {
          base_timezone?: string
          created_at?: string
          created_by: string
          deleted_at?: string | null
          end_date: string
          id?: string
          published_template_at?: string | null
          start_date: string
          status?: string
          title: string
          updated_at?: string
          updated_by_user?: string | null
        }
        Update: {
          base_timezone?: string
          created_at?: string
          created_by?: string
          deleted_at?: string | null
          end_date?: string
          id?: string
          published_template_at?: string | null
          start_date?: string
          status?: string
          title?: string
          updated_at?: string
          updated_by_user?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "trips_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "trips_updated_by_user_fkey"
            columns: ["updated_by_user"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      acquire_fixture_lock: {
        Args: { p_holder: string; p_ttl_seconds?: number }
        Returns: boolean
      }
      applied_migrations: {
        Args: never
        Returns: {
          name: string
          version: string
        }[]
      }
      assert_cache_lockdown: { Args: never; Returns: undefined }
      assert_engine_dev: {
        Args: never
        Returns: {
          environment: string
          name: string
          ref: string
        }[]
      }
      authorship_columns: {
        Args: never
        Returns: {
          legacy_column: string
          table_name: string
          user_column: string
        }[]
      }
      client_writable_timestamps: {
        Args: { p_columns?: string[] }
        Returns: {
          column_name: string
          priv: string
          table_name: string
        }[]
      }
      copy_trip_template: {
        Args: { p_start_date: string; p_template_id: string; p_title?: string }
        Returns: {
          base_timezone: string
          created_at: string
          created_by: string
          deleted_at: string | null
          end_date: string
          id: string
          published_template_at: string | null
          start_date: string
          status: string
          title: string
          updated_at: string
          updated_by_user: string | null
        }
        SetofOptions: {
          from: "*"
          to: "trips"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      create_custom_place: {
        Args: {
          p_category: string
          p_city_slug: string
          p_description?: string
          p_google_place_id?: string
          p_lat: number
          p_legacy_added_by?: string
          p_lng: number
          p_maps_query: string
          p_name_en?: string
          p_name_ko?: string
          p_name_th: string
          p_trip_id: string
        }
        Returns: string
      }
      create_trip: {
        Args: {
          p_base_timezone?: string
          p_end_date: string
          p_start_date: string
          p_title: string
        }
        Returns: {
          base_timezone: string
          created_at: string
          created_by: string
          deleted_at: string | null
          end_date: string
          id: string
          published_template_at: string | null
          start_date: string
          status: string
          title: string
          updated_at: string
          updated_by_user: string | null
        }
        SetofOptions: {
          from: "*"
          to: "trips"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      duplicate_trip_plan: {
        Args: { p_name: string; p_source_plan_id: string; p_trip_id: string }
        Returns: string
      }
      create_trip_invite: {
        Args: {
          p_expires_days?: number
          p_max_uses?: number
          p_role: string
          p_trip_id: string
        }
        Returns: {
          expires_at: string
          invite_id: string
          token: string
        }[]
      }
      fixture_lock_holder: {
        Args: never
        Returns: {
          expires_at: string
          held_by: string
        }[]
      }
      list_deleted_trips: {
        Args: never
        Returns: {
          deleted_at: string
          end_date: string
          id: string
          start_date: string
          title: string
        }[]
      }
      list_public_cities: {
        Args: { p_country_id: string }
        Returns: {
          id: string
          name_en: string
          name_th: string
          slug: string
        }[]
      }
      list_public_destinations: {
        Args: never
        Returns: {
          city_count: number
          id: string
          name_en: string
          name_th: string
          sample_cities: string[]
        }[]
      }
      list_trip_invites: {
        Args: { p_trip_id: string }
        Returns: {
          active: boolean
          created_at: string
          expires_at: string
          id: string
          max_uses: number | null
          revoked_at: string | null
          role: string
          used_count: number
        }[]
      }
      list_trip_templates: {
        Args: never
        Returns: {
          cities: Json
          day_count: number
          id: string
          night_count: number
          title: string
        }[]
      }
      mode_limits: {
        Args: never
        Returns: {
          default_expiry_minutes: number
          maintenance_expiry_minutes: number
        }[]
      }
      peek_trip_invite: {
        Args: { p_token: string }
        Returns: {
          expired: boolean
          inviter_name: string
          role: string
          trip_title: string
        }[]
      }
      read_only_selftest: {
        Args: never
        Returns: {
          blocked: boolean
          scenario: string
        }[]
      }
      read_only_uncovered_tables: {
        Args: never
        Returns: {
          table_name: string
        }[]
      }
      redeem_trip_invite: { Args: { p_token: string }; Returns: string }
      release_fixture_lock: { Args: { p_holder: string }; Returns: boolean }
      restore_trip: { Args: { p_trip_id: string }; Returns: undefined }
      revoke_trip_invite: { Args: { p_invite_id: string }; Returns: undefined }
      role_probe_result: {
        Args: never
        Returns: {
          cur_user: string
          guc_seen: string
          path: string
          sess_user: string
        }[]
      }
      search_place_names: {
        Args: {
          p_city_id?: string
          p_intent: string
          p_limit?: number
          p_query: string
          p_trip_id: string
        }
        Returns: {
          city_id: string
          locale: string
          matched_name: string
          place_id: string
          score: number
          source: string
        }[]
      }
      set_active_plan: {
        Args: { p_plan_id: string; p_trip_id: string }
        Returns: undefined
      }
      set_system_mode: {
        Args: {
          p_allow_maintenance_write?: boolean
          p_expires_in_minutes?: number
          p_read_only: boolean
          p_reason?: string
        }
        Returns: {
          allow_maintenance_write: boolean
          expires_at: string
          read_only: boolean
          reason: string
        }[]
      }
      set_trip_pinned: {
        Args: { p_pinned: boolean; p_trip_id: string }
        Returns: undefined
      }
      soft_delete_booking: { Args: { p_id: string }; Returns: undefined }
      soft_delete_checklist_item: { Args: { p_id: string }; Returns: undefined }
      soft_delete_custom_place: { Args: { p_id: string }; Returns: undefined }
      soft_delete_place_note: { Args: { p_id: string }; Returns: undefined }
      soft_delete_trip: { Args: { p_trip_id: string }; Returns: Json }
      soft_delete_trip_hotel: { Args: { p_id: string }; Returns: undefined }
      soft_delete_trip_stop: { Args: { p_id: string }; Returns: undefined }
      system_mode: {
        Args: never
        Returns: {
          read_only: boolean
          reason: string
        }[]
      }
      table_exposure: {
        Args: { p_tables: string[] }
        Returns: {
          detail: string
          door: string
          grantee: string
          table_name: string
        }[]
      }
      unsafe_state_clear: { Args: never; Returns: undefined }
      unsafe_state_reason: { Args: never; Returns: string }
      unsafe_state_set: {
        Args: { p_note?: string; p_reason: string }
        Returns: undefined
      }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {},
  },
} as const
