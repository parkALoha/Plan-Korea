// ⚠️ ไฟล์นี้ถูกสร้างอัตโนมัติ — ห้ามแก้มือ
// สร้างจาก **สคีมาสดของฐาน** ผ่าน OpenAPI ของ PostgREST · `npm run gen:types`
// ดูข้อจำกัด (ไม่มี enum · ไม่มีความสัมพันธ์ · เห็นเฉพาะ schema ที่ expose) ที่ scripts/gen-db-types.mjs

export type Json = string | number | boolean | null | { [k: string]: Json | undefined } | Json[];

export type Database = {
  public: {
    Tables: {
      bookings: {
        Row: {
          added_by_user: string | null;
          book_by_days_before: number | null;
          category: string;
          confirmation_number: string | null;
          created_at: string;
          date: string | null;
          deleted_at: string | null;
          file_name: string | null;
          file_path: string | null;
          id: string;
          legacy_added_by: string | null;
          link: string | null;
          note: string | null;
          status: string;
          time: string | null;
          title: string;
          trip_day_id: string | null;
          trip_id: string;
          updated_at: string;
          updated_by_user: string | null;
        };
        Insert: {
          added_by_user?: string | null;
          book_by_days_before?: number | null;
          category: string;
          confirmation_number?: string | null;
          created_at?: string;
          date?: string | null;
          deleted_at?: string | null;
          file_name?: string | null;
          file_path?: string | null;
          id?: string;
          legacy_added_by?: string | null;
          link?: string | null;
          note?: string | null;
          status?: string;
          time?: string | null;
          title: string;
          trip_day_id?: string | null;
          trip_id: string;
          updated_at?: string;
          updated_by_user?: string | null;
        };
        Update: {
          added_by_user?: string | null;
          book_by_days_before?: number | null;
          category?: string;
          confirmation_number?: string | null;
          created_at?: string;
          date?: string | null;
          deleted_at?: string | null;
          file_name?: string | null;
          file_path?: string | null;
          id?: string;
          legacy_added_by?: string | null;
          link?: string | null;
          note?: string | null;
          status?: string;
          time?: string | null;
          title?: string;
          trip_day_id?: string | null;
          trip_id?: string;
          updated_at?: string;
          updated_by_user?: string | null;
        };
        Relationships: [];
      };
      catalog_cities: {
        Row: {
          country_id: string;
          created_at: string;
          id: string;
          lat: number;
          legacy_slug: string | null;
          lng: number;
          name_en: string;
          name_local: string | null;
          name_th: string;
          timezone: string;
          updated_at: string;
        };
        Insert: {
          country_id: string;
          created_at?: string;
          id?: string;
          lat: number;
          legacy_slug?: string | null;
          lng: number;
          name_en: string;
          name_local?: string | null;
          name_th: string;
          timezone: string;
          updated_at?: string;
        };
        Update: {
          country_id?: string;
          created_at?: string;
          id?: string;
          lat?: number;
          legacy_slug?: string | null;
          lng?: number;
          name_en?: string;
          name_local?: string | null;
          name_th?: string;
          timezone?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      catalog_countries: {
        Row: {
          created_at: string;
          id: string;
          name_en: string;
          name_th: string;
          nav_providers: string[];
          supported: boolean;
          updated_at: string;
        };
        Insert: {
          created_at?: string;
          id: string;
          name_en: string;
          name_th: string;
          nav_providers: string[];
          supported?: boolean;
          updated_at?: string;
        };
        Update: {
          created_at?: string;
          id?: string;
          name_en?: string;
          name_th?: string;
          nav_providers?: string[];
          supported?: boolean;
          updated_at?: string;
        };
        Relationships: [];
      };
      catalog_country_contacts: {
        Row: {
          country_id: string;
          created_at: string;
          detail: string | null;
          icon: string | null;
          id: string;
          label: string;
          local_number: string | null;
          priority: number;
          tel: string | null;
          updated_at: string;
          url: string | null;
        };
        Insert: {
          country_id: string;
          created_at?: string;
          detail?: string | null;
          icon?: string | null;
          id?: string;
          label: string;
          local_number?: string | null;
          priority?: number;
          tel?: string | null;
          updated_at?: string;
          url?: string | null;
        };
        Update: {
          country_id?: string;
          created_at?: string;
          detail?: string | null;
          icon?: string | null;
          id?: string;
          label?: string;
          local_number?: string | null;
          priority?: number;
          tel?: string | null;
          updated_at?: string;
          url?: string | null;
        };
        Relationships: [];
      };
      catalog_place_access: {
        Row: {
          created_at: string;
          from_label: string;
          icon: string | null;
          id: string;
          label: string;
          legacy_slug: string | null;
          minutes: number;
          note: string | null;
          place_id: string;
          priority: number;
          updated_at: string;
        };
        Insert: {
          created_at?: string;
          from_label: string;
          icon?: string | null;
          id?: string;
          label: string;
          legacy_slug?: string | null;
          minutes: number;
          note?: string | null;
          place_id: string;
          priority?: number;
          updated_at?: string;
        };
        Update: {
          created_at?: string;
          from_label?: string;
          icon?: string | null;
          id?: string;
          label?: string;
          legacy_slug?: string | null;
          minutes?: number;
          note?: string | null;
          place_id?: string;
          priority?: number;
          updated_at?: string;
        };
        Relationships: [];
      };
      catalog_place_descriptions: {
        Row: {
          created_at: string;
          description: string;
          locale: string;
          place_id: string;
          source: string;
          updated_at: string;
        };
        Insert: {
          created_at?: string;
          description: string;
          locale: string;
          place_id: string;
          source?: string;
          updated_at?: string;
        };
        Update: {
          created_at?: string;
          description?: string;
          locale?: string;
          place_id?: string;
          source?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      catalog_place_names: {
        Row: {
          city_id: string;
          created_at: string;
          locale: string;
          name: string;
          place_id: string;
          priority: number;
          source: string;
          updated_at: string;
        };
        Insert: {
          city_id: string;
          created_at?: string;
          locale: string;
          name: string;
          place_id: string;
          priority?: number;
          source?: string;
          updated_at?: string;
        };
        Update: {
          city_id?: string;
          created_at?: string;
          locale?: string;
          name?: string;
          place_id?: string;
          priority?: number;
          source?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      catalog_places: {
        Row: {
          address_local: string | null;
          category: string;
          city_id: string;
          created_at: string;
          google_place_id: string | null;
          id: string;
          lat: number;
          legacy_slug: string | null;
          lng: number;
          maps_query: string | null;
          picker_hidden: boolean;
          source: string;
          transfer_kind: string | null;
          updated_at: string;
          weather_sensitivity: string | null;
          youtube_query: string | null;
        };
        Insert: {
          address_local?: string | null;
          category: string;
          city_id: string;
          created_at?: string;
          google_place_id?: string | null;
          id?: string;
          lat: number;
          legacy_slug?: string | null;
          lng: number;
          maps_query?: string | null;
          picker_hidden?: boolean;
          source?: string;
          transfer_kind?: string | null;
          updated_at?: string;
          weather_sensitivity?: string | null;
          youtube_query?: string | null;
        };
        Update: {
          address_local?: string | null;
          category?: string;
          city_id?: string;
          created_at?: string;
          google_place_id?: string | null;
          id?: string;
          lat?: number;
          legacy_slug?: string | null;
          lng?: number;
          maps_query?: string | null;
          picker_hidden?: boolean;
          source?: string;
          transfer_kind?: string | null;
          updated_at?: string;
          weather_sensitivity?: string | null;
          youtube_query?: string | null;
        };
        Relationships: [];
      };
      checklist_items: {
        Row: {
          added_by_user: string | null;
          category: string | null;
          checked_by_user: string | null;
          created_at: string;
          deleted_at: string | null;
          id: string;
          is_checked: boolean;
          legacy_added_by: string | null;
          legacy_checked_by: string | null;
          text: string;
          trip_id: string;
          updated_at: string;
          updated_by_user: string | null;
        };
        Insert: {
          added_by_user?: string | null;
          category?: string | null;
          checked_by_user?: string | null;
          created_at?: string;
          deleted_at?: string | null;
          id?: string;
          is_checked?: boolean;
          legacy_added_by?: string | null;
          legacy_checked_by?: string | null;
          text: string;
          trip_id: string;
          updated_at?: string;
          updated_by_user?: string | null;
        };
        Update: {
          added_by_user?: string | null;
          category?: string | null;
          checked_by_user?: string | null;
          created_at?: string;
          deleted_at?: string | null;
          id?: string;
          is_checked?: boolean;
          legacy_added_by?: string | null;
          legacy_checked_by?: string | null;
          text?: string;
          trip_id?: string;
          updated_at?: string;
          updated_by_user?: string | null;
        };
        Relationships: [];
      };
      custom_place_descriptions: {
        Row: {
          created_at: string;
          description: string;
          locale: string;
          place_id: string;
          source: string;
          trip_id: string;
          updated_at: string;
        };
        Insert: {
          created_at?: string;
          description: string;
          locale: string;
          place_id: string;
          source?: string;
          trip_id: string;
          updated_at?: string;
        };
        Update: {
          created_at?: string;
          description?: string;
          locale?: string;
          place_id?: string;
          source?: string;
          trip_id?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      custom_place_names: {
        Row: {
          created_at: string;
          locale: string;
          name: string;
          place_id: string;
          priority: number;
          source: string;
          trip_id: string;
          updated_at: string;
        };
        Insert: {
          created_at?: string;
          locale: string;
          name: string;
          place_id: string;
          priority?: number;
          source?: string;
          trip_id: string;
          updated_at?: string;
        };
        Update: {
          created_at?: string;
          locale?: string;
          name?: string;
          place_id?: string;
          priority?: number;
          source?: string;
          trip_id?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      custom_places: {
        Row: {
          added_by_user: string | null;
          category: string;
          city_id: string;
          created_at: string;
          deleted_at: string | null;
          google_place_id: string | null;
          id: string;
          lat: number;
          legacy_added_by: string | null;
          lng: number;
          maps_query: string | null;
          trip_id: string;
          updated_at: string;
          updated_by_user: string | null;
        };
        Insert: {
          added_by_user?: string | null;
          category: string;
          city_id: string;
          created_at?: string;
          deleted_at?: string | null;
          google_place_id?: string | null;
          id?: string;
          lat: number;
          legacy_added_by?: string | null;
          lng: number;
          maps_query?: string | null;
          trip_id: string;
          updated_at?: string;
          updated_by_user?: string | null;
        };
        Update: {
          added_by_user?: string | null;
          category?: string;
          city_id?: string;
          created_at?: string;
          deleted_at?: string | null;
          google_place_id?: string | null;
          id?: string;
          lat?: number;
          legacy_added_by?: string | null;
          lng?: number;
          maps_query?: string | null;
          trip_id?: string;
          updated_at?: string;
          updated_by_user?: string | null;
        };
        Relationships: [];
      };
      hidden_places: {
        Row: {
          catalog_place_id: string;
          hidden_at: string;
          hidden_by_user: string | null;
          legacy_hidden_by: string | null;
          trip_id: string;
        };
        Insert: {
          catalog_place_id: string;
          hidden_at?: string;
          hidden_by_user?: string | null;
          legacy_hidden_by?: string | null;
          trip_id: string;
        };
        Update: {
          catalog_place_id?: string;
          hidden_at?: string;
          hidden_by_user?: string | null;
          legacy_hidden_by?: string | null;
          trip_id?: string;
        };
        Relationships: [];
      };
      place_details_cache: {
        Row: {
          fetched_at: string;
          google_place_id: string | null;
          maps_query: string;
          opening_hours: Json | null;
          primary_type: string | null;
          rating: number | null;
          reviews: Json | null;
          user_rating_count: number | null;
        };
        Insert: {
          fetched_at?: string;
          google_place_id?: string | null;
          maps_query: string;
          opening_hours?: Json | null;
          primary_type?: string | null;
          rating?: number | null;
          reviews?: Json | null;
          user_rating_count?: number | null;
        };
        Update: {
          fetched_at?: string;
          google_place_id?: string | null;
          maps_query?: string;
          opening_hours?: Json | null;
          primary_type?: string | null;
          rating?: number | null;
          reviews?: Json | null;
          user_rating_count?: number | null;
        };
        Relationships: [];
      };
      place_details_local_cache: {
        Row: {
          address_local: string | null;
          fetched_at: string;
          locale: string;
          maps_query: string;
          name_local: string | null;
        };
        Insert: {
          address_local?: string | null;
          fetched_at?: string;
          locale: string;
          maps_query: string;
          name_local?: string | null;
        };
        Update: {
          address_local?: string | null;
          fetched_at?: string;
          locale?: string;
          maps_query?: string;
          name_local?: string | null;
        };
        Relationships: [];
      };
      place_notes: {
        Row: {
          added_by_user: string | null;
          catalog_place_id: string | null;
          created_at: string;
          custom_place_id: string | null;
          deleted_at: string | null;
          id: string;
          legacy_added_by: string | null;
          note: string | null;
          photo_path: string | null;
          plan_id: string;
          trip_id: string;
          updated_at: string;
          updated_by_user: string | null;
        };
        Insert: {
          added_by_user?: string | null;
          catalog_place_id?: string | null;
          created_at?: string;
          custom_place_id?: string | null;
          deleted_at?: string | null;
          id?: string;
          legacy_added_by?: string | null;
          note?: string | null;
          photo_path?: string | null;
          plan_id: string;
          trip_id: string;
          updated_at?: string;
          updated_by_user?: string | null;
        };
        Update: {
          added_by_user?: string | null;
          catalog_place_id?: string | null;
          created_at?: string;
          custom_place_id?: string | null;
          deleted_at?: string | null;
          id?: string;
          legacy_added_by?: string | null;
          note?: string | null;
          photo_path?: string | null;
          plan_id?: string;
          trip_id?: string;
          updated_at?: string;
          updated_by_user?: string | null;
        };
        Relationships: [];
      };
      place_photo_cache: {
        Row: {
          fetched_at: string;
          maps_query: string;
          photo_names: string[];
        };
        Insert: {
          fetched_at?: string;
          maps_query: string;
          photo_names: string[];
        };
        Update: {
          fetched_at?: string;
          maps_query?: string;
          photo_names?: string[];
        };
        Relationships: [];
      };
      profiles: {
        Row: {
          created_at: string;
          display_name: string;
          home_country: string | null;
          id: string;
          locale: string;
          updated_at: string;
          updated_by_user: string | null;
        };
        Insert: {
          created_at?: string;
          display_name: string;
          home_country?: string | null;
          id: string;
          locale?: string;
          updated_at?: string;
          updated_by_user?: string | null;
        };
        Update: {
          created_at?: string;
          display_name?: string;
          home_country?: string | null;
          id?: string;
          locale?: string;
          updated_at?: string;
          updated_by_user?: string | null;
        };
        Relationships: [];
      };
      travel_time_cache: {
        Row: {
          distance_meters: number | null;
          duration_minutes: number;
          fetched_at: string;
          from_place_id: string;
          to_place_id: string;
          travel_mode: string;
        };
        Insert: {
          distance_meters?: number | null;
          duration_minutes: number;
          fetched_at?: string;
          from_place_id: string;
          to_place_id: string;
          travel_mode: string;
        };
        Update: {
          distance_meters?: number | null;
          duration_minutes?: number;
          fetched_at?: string;
          from_place_id?: string;
          to_place_id?: string;
          travel_mode?: string;
        };
        Relationships: [];
      };
      trip_day_plan_settings: {
        Row: {
          created_at: string;
          is_locked: boolean;
          note: string | null;
          plan_id: string;
          return_travel_mode: string | null;
          start_time: string;
          trip_day_id: string;
          trip_id: string;
          updated_at: string;
          updated_by_user: string | null;
        };
        Insert: {
          created_at?: string;
          is_locked?: boolean;
          note?: string | null;
          plan_id: string;
          return_travel_mode?: string | null;
          start_time?: string;
          trip_day_id: string;
          trip_id: string;
          updated_at?: string;
          updated_by_user?: string | null;
        };
        Update: {
          created_at?: string;
          is_locked?: boolean;
          note?: string | null;
          plan_id?: string;
          return_travel_mode?: string | null;
          start_time?: string;
          trip_day_id?: string;
          trip_id?: string;
          updated_at?: string;
          updated_by_user?: string | null;
        };
        Relationships: [];
      };
      trip_days: {
        Row: {
          city_id: string | null;
          created_at: string;
          date: string;
          id: string;
          overnight_city_id: string | null;
          overnight_kind: string | null;
          timezone: string | null;
          trip_id: string;
          updated_at: string;
          updated_by_user: string | null;
        };
        Insert: {
          city_id?: string | null;
          created_at?: string;
          date: string;
          id?: string;
          overnight_city_id?: string | null;
          overnight_kind?: string | null;
          timezone?: string | null;
          trip_id: string;
          updated_at?: string;
          updated_by_user?: string | null;
        };
        Update: {
          city_id?: string | null;
          created_at?: string;
          date?: string;
          id?: string;
          overnight_city_id?: string | null;
          overnight_kind?: string | null;
          timezone?: string | null;
          trip_id?: string;
          updated_at?: string;
          updated_by_user?: string | null;
        };
        Relationships: [];
      };
      trip_destinations: {
        Row: {
          city_id: string;
          rank: number;
          trip_id: string;
        };
        Insert: {
          city_id: string;
          rank: number;
          trip_id: string;
        };
        Update: {
          city_id?: string;
          rank?: number;
          trip_id?: string;
        };
        Relationships: [];
      };
      trip_hotels: {
        Row: {
          added_by_user: string | null;
          address_en: string | null;
          address_local: string | null;
          check_in: string;
          check_out: string;
          city_id: string;
          created_at: string;
          deleted_at: string | null;
          formatted_address: string | null;
          hotel_name: string;
          id: string;
          lat: number | null;
          legacy_added_by: string | null;
          lng: number | null;
          name_en: string | null;
          name_local: string | null;
          phone: string | null;
          trip_id: string;
          updated_at: string;
          updated_by_user: string | null;
        };
        Insert: {
          added_by_user?: string | null;
          address_en?: string | null;
          address_local?: string | null;
          check_in: string;
          check_out: string;
          city_id: string;
          created_at?: string;
          deleted_at?: string | null;
          formatted_address?: string | null;
          hotel_name: string;
          id?: string;
          lat?: number | null;
          legacy_added_by?: string | null;
          lng?: number | null;
          name_en?: string | null;
          name_local?: string | null;
          phone?: string | null;
          trip_id: string;
          updated_at?: string;
          updated_by_user?: string | null;
        };
        Update: {
          added_by_user?: string | null;
          address_en?: string | null;
          address_local?: string | null;
          check_in?: string;
          check_out?: string;
          city_id?: string;
          created_at?: string;
          deleted_at?: string | null;
          formatted_address?: string | null;
          hotel_name?: string;
          id?: string;
          lat?: number | null;
          legacy_added_by?: string | null;
          lng?: number | null;
          name_en?: string | null;
          name_local?: string | null;
          phone?: string | null;
          trip_id?: string;
          updated_at?: string;
          updated_by_user?: string | null;
        };
        Relationships: [];
      };
      trip_members: {
        Row: {
          created_at: string;
          invited_by: string | null;
          role: string;
          trip_id: string;
          user_id: string;
        };
        Insert: {
          created_at?: string;
          invited_by?: string | null;
          role: string;
          trip_id: string;
          user_id: string;
        };
        Update: {
          created_at?: string;
          invited_by?: string | null;
          role?: string;
          trip_id?: string;
          user_id?: string;
        };
        Relationships: [];
      };
      trip_plans: {
        Row: {
          created_at: string;
          id: string;
          is_active: boolean;
          name: string;
          trip_id: string;
          updated_at: string;
          updated_by_user: string | null;
        };
        Insert: {
          created_at?: string;
          id?: string;
          is_active?: boolean;
          name: string;
          trip_id: string;
          updated_at?: string;
          updated_by_user?: string | null;
        };
        Update: {
          created_at?: string;
          id?: string;
          is_active?: boolean;
          name?: string;
          trip_id?: string;
          updated_at?: string;
          updated_by_user?: string | null;
        };
        Relationships: [];
      };
      trip_stops: {
        Row: {
          added_by_user: string | null;
          catalog_place_id: string | null;
          created_at: string;
          custom_place_id: string | null;
          day_offset: number;
          deleted_at: string | null;
          dwell_minutes: number | null;
          event_kind: string | null;
          fixed_end_time: string | null;
          fixed_start_time: string | null;
          flight_from_code: string | null;
          flight_from_en: string | null;
          flight_no: string | null;
          flight_to_code: string | null;
          flight_to_en: string | null;
          icon: string | null;
          id: string;
          intercity_from: string | null;
          intercity_mode: string | null;
          intercity_to: string | null;
          is_alert: boolean;
          kind: string;
          layover_baggage: string | null;
          layover_immigration: string | null;
          layover_leaves_airport: boolean | null;
          layover_terminal_change: boolean | null;
          legacy_added_by: string | null;
          note: string | null;
          photo_path: string | null;
          place_ref: string | null;
          plan_id: string;
          rank: string;
          schedule_bound: string | null;
          time_is_flexible: boolean;
          title: string | null;
          title_en: string | null;
          transfer_target_label: string | null;
          transfer_target_time: string | null;
          travel_mode: string | null;
          trip_day_id: string;
          trip_id: string;
          updated_at: string;
          updated_by_user: string | null;
          visited_at: string | null;
        };
        Insert: {
          added_by_user?: string | null;
          catalog_place_id?: string | null;
          created_at?: string;
          custom_place_id?: string | null;
          day_offset?: number;
          deleted_at?: string | null;
          dwell_minutes?: number | null;
          event_kind?: string | null;
          fixed_end_time?: string | null;
          fixed_start_time?: string | null;
          flight_from_code?: string | null;
          flight_from_en?: string | null;
          flight_no?: string | null;
          flight_to_code?: string | null;
          flight_to_en?: string | null;
          icon?: string | null;
          id?: string;
          intercity_from?: string | null;
          intercity_mode?: string | null;
          intercity_to?: string | null;
          is_alert?: boolean;
          kind?: string;
          layover_baggage?: string | null;
          layover_immigration?: string | null;
          layover_leaves_airport?: boolean | null;
          layover_terminal_change?: boolean | null;
          legacy_added_by?: string | null;
          note?: string | null;
          photo_path?: string | null;
          place_ref?: string | null;
          plan_id: string;
          rank: string;
          schedule_bound?: string | null;
          time_is_flexible?: boolean;
          title?: string | null;
          title_en?: string | null;
          transfer_target_label?: string | null;
          transfer_target_time?: string | null;
          travel_mode?: string | null;
          trip_day_id: string;
          trip_id: string;
          updated_at?: string;
          updated_by_user?: string | null;
          visited_at?: string | null;
        };
        Update: {
          added_by_user?: string | null;
          catalog_place_id?: string | null;
          created_at?: string;
          custom_place_id?: string | null;
          day_offset?: number;
          deleted_at?: string | null;
          dwell_minutes?: number | null;
          event_kind?: string | null;
          fixed_end_time?: string | null;
          fixed_start_time?: string | null;
          flight_from_code?: string | null;
          flight_from_en?: string | null;
          flight_no?: string | null;
          flight_to_code?: string | null;
          flight_to_en?: string | null;
          icon?: string | null;
          id?: string;
          intercity_from?: string | null;
          intercity_mode?: string | null;
          intercity_to?: string | null;
          is_alert?: boolean;
          kind?: string;
          layover_baggage?: string | null;
          layover_immigration?: string | null;
          layover_leaves_airport?: boolean | null;
          layover_terminal_change?: boolean | null;
          legacy_added_by?: string | null;
          note?: string | null;
          photo_path?: string | null;
          place_ref?: string | null;
          plan_id?: string;
          rank?: string;
          schedule_bound?: string | null;
          time_is_flexible?: boolean;
          title?: string | null;
          title_en?: string | null;
          transfer_target_label?: string | null;
          transfer_target_time?: string | null;
          travel_mode?: string | null;
          trip_day_id?: string;
          trip_id?: string;
          updated_at?: string;
          updated_by_user?: string | null;
          visited_at?: string | null;
        };
        Relationships: [];
      };
      trips: {
        Row: {
          base_timezone: string;
          created_at: string;
          created_by: string;
          end_date: string;
          id: string;
          start_date: string;
          status: string;
          title: string;
          updated_at: string;
          updated_by_user: string | null;
        };
        Insert: {
          base_timezone?: string;
          created_at?: string;
          created_by: string;
          end_date: string;
          id?: string;
          start_date: string;
          status?: string;
          title: string;
          updated_at?: string;
          updated_by_user?: string | null;
        };
        Update: {
          base_timezone?: string;
          created_at?: string;
          created_by?: string;
          end_date?: string;
          id?: string;
          start_date?: string;
          status?: string;
          title?: string;
          updated_at?: string;
          updated_by_user?: string | null;
        };
        Relationships: [];
      };
    };
    Views: Record<string, never>;
    Functions: {
      acquire_fixture_lock: {
        Args: {
          p_holder: string | null;
          p_ttl_seconds?: number | null;
        };
        Returns: Json;
      };
      applied_migrations: {
        Args: Record<string, never>;
        Returns: Json;
      };
      assert_engine_dev: {
        Args: Record<string, never>;
        Returns: Json;
      };
      authorship_columns: {
        Args: Record<string, never>;
        Returns: Json;
      };
      client_writable_timestamps: {
        Args: {
          p_columns: string[] | null;
        };
        Returns: Json;
      };
      create_custom_place: {
        Args: {
          p_category: string | null;
          p_city_slug: string | null;
          p_description?: string | null;
          p_google_place_id?: string | null;
          p_lat: number | null;
          p_legacy_added_by?: string | null;
          p_lng: number | null;
          p_maps_query: string | null;
          p_name_en?: string | null;
          p_name_ko?: string | null;
          p_name_th: string | null;
          p_trip_id: string | null;
        };
        Returns: Json;
      };
      create_trip: {
        Args: {
          p_base_timezone?: string | null;
          p_end_date: string | null;
          p_start_date: string | null;
          p_title: string | null;
        };
        Returns: Json;
      };
      duplicate_trip_plan: {
        Args: {
          p_name: string | null;
          p_source_plan_id: string | null;
          p_trip_id: string | null;
        };
        Returns: Json;
      };
      fixture_lock_holder: {
        Args: Record<string, never>;
        Returns: Json;
      };
      mode_limits: {
        Args: Record<string, never>;
        Returns: Json;
      };
      read_only_selftest: {
        Args: Record<string, never>;
        Returns: Json;
      };
      read_only_uncovered_tables: {
        Args: Record<string, never>;
        Returns: Json;
      };
      release_fixture_lock: {
        Args: {
          p_holder: string | null;
        };
        Returns: Json;
      };
      rls_auto_enable: {
        Args: Record<string, never>;
        Returns: Json;
      };
      role_probe_result: {
        Args: Record<string, never>;
        Returns: Json;
      };
      search_place_names: {
        Args: {
          p_city_id?: string | null;
          p_intent: string | null;
          p_limit?: number | null;
          p_query: string | null;
          p_trip_id: string | null;
        };
        Returns: Json;
      };
      set_active_plan: {
        Args: {
          p_plan_id: string | null;
          p_trip_id: string | null;
        };
        Returns: Json;
      };
      set_system_mode: {
        Args: {
          p_allow_maintenance_write?: boolean | null;
          p_expires_in_minutes?: number | null;
          p_read_only: boolean | null;
          p_reason?: string | null;
        };
        Returns: Json;
      };
      soft_delete_booking: {
        Args: {
          p_id: string | null;
        };
        Returns: Json;
      };
      soft_delete_checklist_item: {
        Args: {
          p_id: string | null;
        };
        Returns: Json;
      };
      soft_delete_custom_place: {
        Args: {
          p_id: string | null;
        };
        Returns: Json;
      };
      soft_delete_place_note: {
        Args: {
          p_id: string | null;
        };
        Returns: Json;
      };
      soft_delete_trip_hotel: {
        Args: {
          p_id: string | null;
        };
        Returns: Json;
      };
      soft_delete_trip_stop: {
        Args: {
          p_id: string | null;
        };
        Returns: Json;
      };
      system_mode: {
        Args: Record<string, never>;
        Returns: Json;
      };
      table_exposure: {
        Args: {
          p_tables: string[] | null;
        };
        Returns: Json;
      };
      unsafe_state_clear: {
        Args: Record<string, never>;
        Returns: Json;
      };
      unsafe_state_reason: {
        Args: Record<string, never>;
        Returns: Json;
      };
      unsafe_state_set: {
        Args: {
          p_note?: string | null;
          p_reason: string | null;
        };
        Returns: Json;
      };
    };
    Enums: Record<string, never>;
    CompositeTypes: Record<string, never>;
  };
};
