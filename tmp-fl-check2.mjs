const html = await (
  await fetch("https://the100collection.com/destinations/finger-lakes", {
    headers: { "user-agent": "Mozilla/5.0" },
  })
).text();

// Unescape the RSC/JSON embedded string enough to parse showcase objects
// Data appears as JSON inside a JS string with \" escapes
function extractShowcases(raw) {
  const out = [];
  let idx = 0;
  while ((idx = raw.indexOf('"_type":"showcaseProperty"', idx)) !== -1) {
    // walk backward to object start
    let start = idx;
    while (start > 0 && raw[start] !== "{") start--;
    // walk forward with brace count, respecting strings
    let depth = 0;
    let inStr = false;
    let esc = false;
    let end = start;
    for (; end < raw.length; end++) {
      const ch = raw[end];
      if (inStr) {
        if (esc) esc = false;
        else if (ch === "\\") esc = true;
        else if (ch === '"') inStr = false;
        continue;
      }
      if (ch === '"') inStr = true;
      else if (ch === "{") depth++;
      else if (ch === "}") {
        depth--;
        if (depth === 0) {
          end++;
          break;
        }
      }
    }
    const slice = raw.slice(start, end);
    try {
      // The page uses \" inside a larger string; if already raw JSON quotes, parse directly
      const obj = JSON.parse(slice);
      out.push(obj);
    } catch {
      try {
        const unescaped = slice.replace(/\\"/g, '"').replace(/\\\\/g, "\\");
        out.push(JSON.parse(unescaped));
      } catch (e) {
        out.push({ parseError: e.message, preview: slice.slice(0, 180) });
      }
    }
    idx = end;
  }
  return out;
}

const showcases = extractShowcases(html);
console.log("count", showcases.length);
for (const s of showcases) {
  if (s.parseError) {
    console.log("ERR", s);
    continue;
  }
  console.log(
    JSON.stringify({
      key: s._key,
      name: s.name,
      slug: s.slug?.current,
      roomcount: s.roomcount,
      bathrooms: s.bathrooms,
      occupancy: s.occupancy,
      excerptText: (s.excerptText || "").slice(0, 50),
      propertyLink: s.propertyLink,
      hasImage: !!s.image,
      imageUrls: Array.isArray(s.imageUrls) ? s.imageUrls.length : 0,
      hasGeo: !!s.proplocation,
      geo: s.proplocation || null,
      keys: Object.keys(s).sort(),
    })
  );
}
