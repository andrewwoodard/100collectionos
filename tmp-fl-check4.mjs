const html = await (
  await fetch("https://the100collection.com/destinations/finger-lakes?t=" + Date.now(), {
    headers: { "user-agent": "Mozilla/5.0" },
  })
).text();

// Convert common escape style used in Next flight / JSON-in-string
function extractEscapedObjects(label) {
  const needle = '\\"_type\\":\\"showcaseProperty\\"';
  const needle2 = '"_type":"showcaseProperty"';
  const use = html.includes(needle) ? needle : needle2;
  const escaped = use.includes("\\");
  console.log(label, "using", escaped ? "escaped" : "raw", "needle");

  const items = [];
  let idx = 0;
  while ((idx = html.indexOf(use, idx)) !== -1 && items.length < 20) {
    // walk back to object start
    let start = idx;
    const open = escaped ? "\\{" : "{";
    // for escaped, objects start with {
    while (start > 0 && html[start] !== "{") start--;
    // crude: take until next showcase or 8k
    const next = html.indexOf(use, idx + use.length);
    let end = next > 0 ? next : Math.min(html.length, start + 12000);
    // trim to last } before next
    let slice = html.slice(start, end);
    const lastBrace = slice.lastIndexOf("}");
    if (lastBrace > 0) slice = slice.slice(0, lastBrace + 1);
    let text = slice;
    if (escaped) {
      text = text
        .replace(/\\"/g, '"')
        .replace(/\\\\/g, "\\");
    }
    try {
      const obj = JSON.parse(text);
      items.push({
        key: obj._key,
        name: obj.name,
        slug: obj.slug?.current,
        rooms: obj.roomcount,
        imageCount: Array.isArray(obj.images) ? obj.images.length : 0,
        imageUrls: Array.isArray(obj.imageUrls) ? obj.imageUrls.length : 0,
        hasGeo: !!obj.proplocation,
        firstImageRef: obj.images?.[0]?.galleryImage?.asset?._ref || null,
        firstImageUrl: obj.imageUrls?.[0] || null,
        keys: Object.keys(obj).sort(),
      });
    } catch (e) {
      const name = (text.match(/"name"\s*:\s*"([^"]+)"/) || [])[1];
      items.push({ parseError: e.message.slice(0, 80), name, preview: text.slice(0, 120) });
    }
    idx = idx + use.length;
  }
  return items;
}

const items = extractEscapedObjects("page");
console.log("count", items.length);
for (const i of items) console.log(JSON.stringify(i));
