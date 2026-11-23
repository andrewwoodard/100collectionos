-- Unified Neon tables for destination / VRM / property content.
-- Covers Sanity CMS fields + Supabase / portal operational fields.
-- Nested portable text, references, and image arrays stay jsonb.

CREATE SCHEMA IF NOT EXISTS cms;

-- ── destinations ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS cms.destinations (
  id                          text PRIMARY KEY,
  -- identity / directory (Base44 + public Supabase destinations)
  base44_destination_id       text,
  supabase_destination_id     text,
  name                        text,
  slug                        text,
  title                       text,
  is_exclusive                boolean DEFAULT false,
  geocode_query               text,
  latitude                    double precision,
  longitude                   double precision,
  -- Sanity SEO + copy
  seo_title                   text,
  seo_description             text,
  short_description           text,
  area_descriptor             text,
  area                        text,
  region                      text,
  states                      text,
  season_info                 text,
  months                      jsonb,
  temporary_vrm_url           text,
  video_url                   text,
  destination_not_on          boolean,
  location_lat                double precision,
  location_lng                double precision,
  body_json                   jsonb,
  body_text                   text,
  -- Sanity images (resolved URLs + raw refs)
  main_image_url              text,
  main_image_alt              text,
  map_image_url               text,
  footer_image_url            text,
  main_image_json             jsonb,
  map_image_json              jsonb,
  footer_image_json           jsonb,
  slider_images_json          jsonb,
  -- Sanity taxonomy (resolved titles + raw refs)
  category_titles             jsonb,
  destination_type_titles     jsonb,
  experience_titles           jsonb,
  categories_json             jsonb,
  destination_types_json      jsonb,
  experiences_json            jsonb,
  -- Sanity system
  sanity_id                   text,
  sanity_rev                  text,
  sanity_created_at           timestamptz,
  sanity_updated_at           timestamptz,
  -- sync meta
  created_at                  timestamptz DEFAULT now(),
  updated_at                  timestamptz DEFAULT now(),
  synced_at                   timestamptz DEFAULT now(),
  source                      text
);

CREATE INDEX IF NOT EXISTS idx_cms_destinations_slug ON cms.destinations (slug);
CREATE INDEX IF NOT EXISTS idx_cms_destinations_name ON cms.destinations (name);
CREATE INDEX IF NOT EXISTS idx_cms_destinations_base44 ON cms.destinations (base44_destination_id);
CREATE INDEX IF NOT EXISTS idx_cms_destinations_sanity ON cms.destinations (sanity_id);

-- ── vrms ────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS cms.vrms (
  id                          text PRIMARY KEY,
  -- identity / directory (Supabase vrms + portal)
  source_id                   bigint,
  name                        text,
  slug                        text,
  title                       text,
  partner_name                text,
  email                       text,
  phone                       text,
  vrm_email                   text,
  vrm_phone                   text,
  vrm_url                     text,
  website                     text,
  source                      text,
  first_destination_slug      text,
  destination_slugs           jsonb,
  unit_count                  integer,
  onboarded                   boolean,
  is_onboarded                boolean,
  show_properties             boolean,
  -- Sanity / branding
  doyen_name                  text,
  doyen_title                 text,
  doyen_short_description     text,
  doyen_text                  text,
  doyen_or_doyenne            text,
  doyen_image_url             text,
  logo_image_url              text,
  main_image_url              text,
  attribute_one               text,
  attribute_two               text,
  bedrooms                    text,
  price                       text,
  prop_class                  text,
  video_url                   text,
  mux_playback_id             text,
  vrm_not_on                  boolean,
  published_at                timestamptz,
  -- portable text / nested
  body_json                   jsonb,
  body_text                   text,
  doyentext_json              jsonb,
  favorites_json              jsonb,
  showcase_json               jsonb,
  services_offered_json       jsonb,
  services_available_json     jsonb,
  services_offered_picks_json jsonb,
  awards_json                 jsonb,
  gallery_json                jsonb,
  slider_images_json          jsonb,
  categories_json             jsonb,
  destinations_json           jsonb,
  video_json                  jsonb,
  doyen_image_json            jsonb,
  logo_image_json             jsonb,
  main_image_json             jsonb,
  -- header / trademark checks (Supabase operational)
  last_header_ok              boolean,
  last_header_has_link        boolean,
  last_header_status          integer,
  last_header_error           text,
  last_header_final_url       text,
  last_header_checked_at      timestamptz,
  last_trademark_ok           boolean,
  last_trademark_status        integer,
  last_trademark_error         text,
  last_trademark_final_url     text,
  last_trademark_checked_at    timestamptz,
  -- Sanity system
  sanity_id                   text,
  sanity_vrm_id               text,
  sanity_rev                  text,
  sanity_created_at           timestamptz,
  sanity_updated_at           timestamptz,
  -- sync meta
  created_at                  timestamptz DEFAULT now(),
  updated_at                  timestamptz DEFAULT now(),
  synced_at                   timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_cms_vrms_slug ON cms.vrms (slug);
CREATE INDEX IF NOT EXISTS idx_cms_vrms_partner ON cms.vrms (partner_name);
CREATE INDEX IF NOT EXISTS idx_cms_vrms_sanity ON cms.vrms (sanity_id);

-- ── properties ──────────────────────────────────────────────────────────────
-- Union of Base44 Property entity + Supabase properties / propertiesbase44.
-- Sanity has no standalone property type; showcase rows live under VRMs.
CREATE TABLE IF NOT EXISTS cms.properties (
  id                          text PRIMARY KEY,
  row_id                      bigint,
  source_id                   text,
  base44_property_id          text,
  supabase_property_id        text,
  sanity_showcase_key         text,
  -- identity
  name                        text,
  property_name               text,
  slug                        text,
  url                         text,
  listing_url                 text,
  vrm_url                     text,
  hundred_collection_url      text,
  partner_id                  text,
  partner_name                text,
  destination                 text,
  market                      text,
  -- location
  address                     text,
  location_full               text,
  location_city               text,
  location_state              text,
  location_country            text,
  latitude                    double precision,
  longitude                   double precision,
  -- specs
  bedrooms                    text,
  bathrooms                   text,
  half_bathrooms              text,
  occupancy                   text,
  sleeps                      text,
  house_type                  text,
  property_type               text,
  pet_friendly                text,
  pet_policy_url              text,
  -- status / ops
  status                      text,
  active                      boolean,
  portal_visible              boolean,
  onboarding_status           text,
  photography_status          text,
  launch_date                 date,
  removal_date                date,
  termination_date            date,
  last_scan                   timestamptz,
  -- content
  headline                    text,
  excerpt                     text,
  short_summary               text,
  text                        text,
  description                 text,
  unique_feature              text,
  unique_features             text,
  why_onehundred              text,
  why_100_collection          text,
  best_fit_guest              text,
  designed_by                 text,
  designer_name               text,
  design_style_notes          text,
  property_source             text,
  property_html               text,
  ai_search                   text,
  ai_fit_score                text,
  photo_count                 text,
  property_image              text,
  video_url                   text,
  internal_notes              text,
  -- Sanity showcase (when linked from a VRM showcase item)
  showcase_name               text,
  showcase_roomcount          text,
  showcase_occupancy          text,
  showcase_property_link      text,
  showcase_propvideo          text,
  showcase_images_json        jsonb,
  -- arrays / nested
  images                      jsonb,
  vrm_images                  jsonb,
  photo_urls                  jsonb,
  photo_alt_texts             jsonb,
  amenities                   jsonb,
  filtered_amenities          jsonb,
  categories                  jsonb,
  prop_categories             jsonb,
  tags                        jsonb,
  reviews                     jsonb,
  propdescription             jsonb,
  -- page-check
  last_page_check_at          timestamptz,
  last_page_check_ok          text,
  last_page_check_status      text,
  last_page_check_error       text,
  last_page_check_final_url   text,
  -- offboarding
  archived_at                 timestamptz,
  archived_by_user_id         text,
  offboarding_status          text,
  offboarding_reason          text,
  offboarding_initiated_at    timestamptz,
  offboarding_initiated_by    text,
  offboarding_approved_at     timestamptz,
  offboarding_approved_by     text,
  -- sync meta
  created_at                  timestamptz DEFAULT now(),
  updated_at                  timestamptz DEFAULT now(),
  synced_at                   timestamptz DEFAULT now(),
  source                      text
);

CREATE INDEX IF NOT EXISTS idx_cms_properties_partner ON cms.properties (partner_id);
CREATE INDEX IF NOT EXISTS idx_cms_properties_name ON cms.properties (name);
CREATE INDEX IF NOT EXISTS idx_cms_properties_url ON cms.properties (url);
CREATE INDEX IF NOT EXISTS idx_cms_properties_vrm_url ON cms.properties (vrm_url);
CREATE INDEX IF NOT EXISTS idx_cms_properties_destination ON cms.properties (destination);
CREATE INDEX IF NOT EXISTS idx_cms_properties_base44 ON cms.properties (base44_property_id);
CREATE INDEX IF NOT EXISTS idx_cms_properties_supabase ON cms.properties (supabase_property_id);

COMMENT ON SCHEMA cms IS 'Unified columnar content tables merging Sanity CMS + Supabase/portal fields for destinations, VRMs, and properties.';
COMMENT ON TABLE cms.destinations IS 'Destination page + directory fields from Sanity destination docs and Base44/Supabase destinations.';
COMMENT ON TABLE cms.vrms IS 'VRM / partner destination-page fields from Sanity vrm docs and Supabase vrms.';
COMMENT ON TABLE cms.properties IS 'Property fields from Base44 Property + Supabase properties/propertiesbase44 (+ optional Sanity showcase).';
