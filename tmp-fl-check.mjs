const html = await (
  await fetch("https://the100collection.com/destinations/finger-lakes", {
    headers: { "user-agent": "Mozilla/5.0" },
  })
).text();

console.log("len", html.length);
console.log("Down on the Bluff?", html.includes("Down on the Bluff"));
console.log("base44-1793997437487?", html.includes("base44-1793997437487"));
console.log("down-on-the-bluff?", html.includes("down-on-the-bluff"));
console.log("showcaseProperty?", html.includes("showcaseProperty"));

const i = html.indexOf("Down on the Bluff");
console.log("idx", i);
if (i >= 0) console.log(html.slice(i - 250, i + 400));

const keys = [...html.matchAll(/base44-(\d+)/g)].map((m) => m[0]);
console.log("base44 keys", [...new Set(keys)]);

const urls = [
  ...new Set(
    [...html.matchAll(/\/destinations\/finger-lakes\/[a-z0-9-]+/gi)].map((m) => m[0])
  ),
];
console.log("urls", urls);

// Sanity CDN image from page
const sanityIds = [...html.matchAll(/cdn\.sanity\.io\/images\/([a-z0-9]+)\//g)].map((m) => m[1]);
console.log("sanity project ids", [...new Set(sanityIds)]);
