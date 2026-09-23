// Curated fallbacks used when the live showcase data is unavailable.

const MEDIA = "https://media.base44.com/images/public/69aee092656fb9813439389b";
const FILES = "https://base44.app/api/apps/69aee092656fb9813439389b/files/mp/public/69aee092656fb9813439389b";

export const FALLBACK_HERO_IMAGES = [
  `${MEDIA}/db5556f1a_TKCA.jpg`,
  `${MEDIA}/0add94df2_AkersEllis.jpg`,
  `${FILES}/a84779d04_photo.jpg`,
  `${MEDIA}/cb6394351_Abode.jpg`,
  `${FILES}/70aa0ea4c_1-web-or-mls-Full-20.JPG`,
];

export const FALLBACK_IMAGES = {
  managerCard: `${MEDIA}/0add94df2_AkersEllis.jpg`,
  homeownerHero: `${FILES}/70aa0ea4c_1-web-or-mls-Full-20.JPG`,
  closingImage: `${MEDIA}/2cf350246_ScenicStays.jpg`,
  partnerCard: `${MEDIA}/dd40d3b5b_generated_image.png`,
  recentlyWelcomed: `${MEDIA}/2cf350246_ScenicStays.jpg`,
};

export const FALLBACK_PARTNER_STRIP = [
  "CoralTree Residence Collection",
  "Akers Ellis Real Estate & Rentals",
  "Sea Mountain Vacations",
  "Southern Comfort Cabin Rentals",
  "Stay Charlottesville",
  "Suches Vacation Rentals",
  "Clemson Vacation Rentals",
].map((name) => ({ name, market: null }));