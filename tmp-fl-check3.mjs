const html = await (
  await fetch("https://the100collection.com/destinations/finger-lakes?nocache=" + Date.now(), {
    headers: { "user-agent": "Mozilla/5.0", "cache-control": "no-cache" },
  })
).text();
console.log("Down on the Bluff?", html.includes("Down on the Bluff"));
console.log("base44-1793997437487?", html.includes("base44-1793997437487"));
console.log("Among the Oaks?", html.includes("Among the Oaks"));

// Find script/data sources mentioning propertiesbase44 or supabase
const hits = [...html.matchAll(/propertiesbase44|mjrzhxcggwpfklssofic|supabase\.co|showcaseProperty|imageUrls/gi)].map(
  (m) => m[0]
);
console.log("unique hits", [...new Set(hits)]);

// Count showcaseProperty occurrences via escaped and unescaped
console.log(
  "showcaseProperty count",
  (html.match(/showcaseProperty/g) || []).length
);
console.log(
  "escaped showcaseProperty count",
  (html.match(/showcaseProperty/g) || []).length
);
