// Shared spam scoring for public /apply submissions. Used by both
// submitPartnerApplication (live defense) and backfillSpamCleanup (bulk
// sweeps of existing records).
//
// Layered defense — no single check is bulletproof, so several weak signals
// stack into a composite score. Bots get a fake success; real applicants
// sail through.
//
// Signals:
//   A. Gmail dot-trick abuse (3+ dots in local part → +0.5; canonical
//      gmail repeats across recent apps → +0.4 base + +0.3 per prior)
//   B. Consonant-cluster name detection (ratio > 0.75 → +0.4; non-dictionary
//      + ratio > 0.65 → +0.5)
//   C. Gibberish LLC detector (gibberish word before "LLC" → +0.4)
//   D. Batch submission clustering (same canonical gmail 2+ times → +0.4)
//   + legacy: vowelless words, 4+ consonant runs, random-letters names,
//     email local-part gibberish, company contradictions, disposable domains
//
// Bands (applied by the caller):
//   score > 0.7  -> silent reject (live) or hard delete (cleanup if egregious)
//   0.4 - 0.7    -> record created with status 'spam_review' (quarantined)
//   cleanup mode: > 0.5 -> spam_review; <= 0.5 -> pending
//   < 0.4        -> normal submission
//
// TODO (Layer 9): If layered defenses don't hold, add Cloudflare Turnstile
// invisible captcha. Free, no user friction. Site key + secret key needed.

export const DISPOSABLE_EMAIL_DOMAINS = [
  'mailinator.com', 'tempmail.com', 'temp-mail.org', 'guerrillamail.com',
  '10minutemail.com', 'trashmail.com', 'throwawaymail.com', 'yopmail.com',
  'sharklasers.com', 'maildrop.cc', 'getnada.com', 'dispostable.com',
  'mailnesia.com', 'mytemp.email', 'fakeinbox.com', 'emailondeck.com',
  'mohmal.com', 'inboxbear.com', 'tempail.com', 'spam4.me', 'grr.la',
  '1secmail.com', 'mail.tm', 'tempmailaddress.com', 'discard.email',
  'spamgourmet.com', 'binkmail.com', 'mailcatch.com',
];

const CONSONANTS = 'bcdfghjklmnpqrstvwxyz';
const CONSONANT_RUN = new RegExp('[' + CONSONANTS + ']{4,}');

function toWords(s) {
  return String(s || '')
    .toLowerCase()
    .replace(/[^a-z\s'-]/g, ' ')
    .split(/[\s'-]+/)
    .filter((w) => w.length >= 2);
}

function isVowellessWord(w) {
  return w.length >= 4 && !/[aeiouy]/.test(w);
}
function hasConsonantRun(w) {
  return CONSONANT_RUN.test(w);
}
// Consonant-to-total-letter ratio. 'y' counts as a consonant (standard
// linguistic treatment for consonant-density analysis).
function consonantRatio(w) {
  const chars = w.toLowerCase().replace(/[^a-z]/g, '');
  if (chars.length === 0) return 0;
  let c = 0;
  for (const ch of chars) if (CONSONANTS.includes(ch)) c++;
  return c / chars.length;
}

export function isGibberishText(text) {
  return toWords(text).some((w) => isVowellessWord(w) || hasConsonantRun(w) || (w.length >= 4 && consonantRatio(w) > 0.75));
}

// Gmail treats dots in the local part as meaningless and gmail.com ==
// googlemail.com. "cha.si85.0.17" and "chasi85017" are the same inbox.
// Canonical form strips dots + plus-addressing for grouping.
export function canonicalGmail(email) {
  const lower = String(email || '').toLowerCase().trim();
  const atIdx = lower.indexOf('@');
  if (atIdx < 0) return null;
  const local = lower.substring(0, atIdx);
  const domain = lower.substring(atIdx + 1);
  if (domain !== 'gmail.com' && domain !== 'googlemail.com') return null;
  const plusIdx = local.indexOf('+');
  const base = plusIdx >= 0 ? local.substring(0, plusIdx) : local;
  return base.replace(/\./g, '') + '@gmail.com';
}

function isGmailDotTrick(email) {
  if (!canonicalGmail(email)) return false;
  const local = String(email || '').toLowerCase().split('@')[0];
  const plusIdx = local.indexOf('+');
  const base = plusIdx >= 0 ? local.substring(0, plusIdx) : local;
  return (base.match(/\./g) || []).length >= 3;
}

// Name/word lists — deliberately not exhaustive. A name missing from these
// lists is only one 0.5 signal, never a reject on its own, and a false
// positive just lands in reviewable quarantine. Includes international
// names across continents to avoid false-positiving real diverse applicants.
const COMMON_FIRST_NAMES = new Set([
  // English
  'james','john','robert','michael','david','william','richard','joseph','thomas','charles',
  'christopher','daniel','matthew','anthony','mark','donald','steven','paul','andrew','joshua',
  'kenneth','kevin','brian','george','timothy','ronald','jason','edward','jeffrey','ryan','jacob',
  'gary','nicholas','eric','jonathan','stephen','larry','justin','scott','brandon','benjamin',
  'samuel','gregory','alexander','patrick','frank','raymond','jack','dennis','jerry','tyler',
  'aaron','jose','adam','nathan','henry','zachary','douglas','peter','kyle','noah','ethan',
  'jeremy','walter','christian','keith','roger','terry','austin','sean','gerald','carl','harold',
  'dylan','arthur','lawrence','jordan','jesse','bryan','billy','bruce','gabriel','joe','logan',
  'alan','albert','willie','wayne','elias','leon','mario','luis','carlos','juan','manuel',
  'diego','javier','miguel','antonio','pedro','raul','bryce','grant','brett','brent','troy',
  'clint','trent','rex','fred','glenn','reid','reed','chad','vance','ron','don','dan','rob',
  'jeb','mac','zac','kip','dirk','colton','hunter','mason','carter',' cooper','wyatt','cash',
  // Female
  'mary','patricia','jennifer','linda','elizabeth','barbara','susan','jessica','sarah','karen',
  'nancy','lisa','betty','margaret','sandra','ashley','emily','donna','michelle','carol','amanda',
  'melissa','deborah','stephanie','rebecca','laura','sharon','cynthia','kathleen','amy','angela',
  'shirley','anna','brenda','pamela','nicole','katherine','samantha','christine','rachel','carolyn',
  'janet','maria','heather','diane','julie','joyce','victoria','olivia','emma','ava','sophia',
  'isabella','charlotte','amelia','mia','harper','evelyn','abigail','ella','avery','scarlett',
  'grace','chloe','camila','aria','penelope','layla','nora','riley','zoey','lily','hannah','lucy',
  'stella','nina','rosemary','colleen','maureen','eileen','caroline','virginia','dawn',
  // International
  'ahmed','ali','omar','hassan','ibrahim','fatima','aisha','noor','yara','leila','nadia','rashid',
  'tariq','anika','zara','chidi','xu','wei','ming','jun','jin','ren','mei','ling','hua','chen',
  'yuki','hiro','kenji','akira','takashi','naveen','priya','raj','amit','deepak','sanjay','vikram',
  'arjun','kapil','sara','lina','maya','sofia','natalia','elena','tatiana','ivana','mila','katya',
  'ana','lukas','stefan','nikola','mila','ivan','dora','tina','milena',
]);

const COMMON_LAST_NAMES = new Set([
  'smith','johnson','williams','brown','jones','garcia','miller','davis','rodriguez','martinez',
  'hernandez','lopez','gonzalez','wilson','anderson','thomas','taylor','moore','jackson','martin',
  'lee','perez','thompson','white','harris','sanchez','clark','ramirez','lewis','robinson','walker',
  'young','allen','king','wright','scott','torres','nguyen','hill','flores','green','adams','nelson',
  'baker','hall','rivera','campbell','mitchell','carter','roberts','gomez','phillips','evans','turner',
  'diaz','parker','cruz','edwards','collins','reyes','stewart','morris','morales','murphy','cook',
  'rogers','gutierrez','ortiz','morgan','cooper','peterson','bailey','reed','kelly','howard','ramos',
  'kim','cox','ward','richardson','watson','brooks','chavez','wood','bennett','gray','mendoza','ruiz',
  'hughes','price','alvarez','castillo','sanders','patel','myers','long','ross','foster','jimenez',
  'powell','fisher','ellis','simmons','fish','fox','hunt','mcbride','obrien','oconnor','oneill',
  'mclean','macdonald','bryant','richards','cole','king','ford','marsh','finley','brooks','dean',
  // International
  'kumar','singh','shah','khan','choi','watanabe','tanaka','yamamoto','nakamura','zhao','wang',
  'liu','chen','yang','huang','lin','wu','zhou','das','roy','menon','nair','reddy','joshi','mehta',
  'agarwal','bose','chowdhury','islam','rahman','hassan','salem','aziz','khalil','mikhail','ivanov',
  'petrov','novak','kowalski','muller','schmidt','wagner','becker','hoffmann',
]);

// Common English words + travel/hospitality terms + US place names that also
// appear in real names/company names, to prevent the non-dictionary check
// from false-positiving legitimate applicants.
const COMMON_NAME_WORDS = new Set([
  'rose','stone','rivers','woods','field','summers','winters','page','sage','lane','brook','dale',
  'grant','dean','hope','faith','joy','grace','may','summer','autumn','west','wells','banks','parker',
  'stay','stays','vacations','vacation','rentals','rental','resort','resorts','estates','estate',
  'villas','villa','homes','home','house','houses','lodging','hotel','hotels','retreat','retreats',
  'coast','coastal','beach','island','isle','mountain','valley','creek','bay','harbor','harbour',
  'cove','pointe','shores','sands','dunes','peak','properties','property','management','group',
  'partners','collection','hospitality','manor','cottage','cottages','cabins','cabin','condo',
  'suites','inn','lodge','chalet','penthouse','breeze','palms','oak','pine','cedar','maple','willow',
  'magnolia','azalea','camellia','hammock','driftwood','sunrise','sunset','moonlight','seaside',
  'lakeside','bayside','hillside','gulf','shore','haven','hideaway','escape','getaway','travel',
  'journey','voyage','explorer','anchor','luxury','luxurious','premier','elite','signature','grand',
  'royal','crown','heritage','legacy','compass','meridian','beacon','lighthouse','marina','pier',
  'dock','wharf','quay','terrace','veranda','porch','garden','meadow','prairie','glade','grove',
  // US destinations
  'charlottesville','asheville','nashville','nags','head','destin','orlando','miami','austin',
  'dallas','phoenix','denver','seattle','boston','chicago','atlanta','savannah','charleston',
  'williamsburg','sedona','carolina','florida','california','texas','georgia','virginia','tennessee',
  'hawaii','maui','oahu','poipu','kauai','tahoe','vail','aspen','breckenridge','keys','key',
  'largo','marathon','panama','city','beach','fort','walton','santa','rosa','cruz','monica',
  'barbara','diego','angeles','francisco','portland','boulder','boise','tucson','flagstaff',
  'smoky','mountains','outer','banks','gulf','shores','orange','gulfport','biloxi','galveston',
  'corpus','christi','south','padre','island','captiva','sanibel','marco','naples','bonita',
  'fort','myers','clearwater','st','petersburg','tampa','sarasota','venice','englewood','barefoot',
  'myrtle','wilmington','wrightsville','carolina','beach','surf','city','topsail','emerald',
  'isle','indian','beach','atlantic','beach','kill','devil','hills','kitty','hawk','duck',
  'corolla','currituck','hatteras','ocracoke','beaufort','morehead','wilmington','holden',
  'ocean','isle','north','topsail','surf','city','sea','lake',' tahoe','bear','big',
]);

function resemblesRealNameWord(w) {
  return COMMON_FIRST_NAMES.has(w) || COMMON_LAST_NAMES.has(w) || COMMON_NAME_WORDS.has(w);
}

export function isDisposableEmail(email) {
  const domain = String(email || '').toLowerCase().split('@')[1]?.trim();
  return domain ? DISPOSABLE_EMAIL_DOMAINS.includes(domain) : false;
}

// Composite spam score for a single application payload. Pure — no DB
// access. Returns { score, reasons }.
export function computeSpamScore(payload) {
  const reasons = [];
  let score = 0;
  const applicantType = payload.applicant_type;
  const nameWords = toWords(payload.full_name);
  const companyWords = toWords(payload.company_name);
  const fieldChecks = [['full_name', nameWords], ['company_name', companyWords]];

  for (const [label, words] of fieldChecks) {
    // Legacy: vowelless words and 4+ consonant runs
    if (words.some((w) => isVowellessWord(w))) { score += 0.4; reasons.push(`${label}: vowelless word`); }
    if (words.some((w) => hasConsonantRun(w))) { score += 0.4; reasons.push(`${label}: 4+ consecutive consonants`); }
    // Signal B: consonant ratio > 0.75 and length >= 4
    if (words.some((w) => w.length >= 4 && consonantRatio(w) > 0.75)) {
      score += 0.4; reasons.push(`${label}: high consonant-ratio word`);
    }
    // Signal B additional: non-dictionary word with ratio > 0.65
    if (words.some((w) => w.length >= 4 && !resemblesRealNameWord(w) && consonantRatio(w) > 0.65)) {
      score += 0.5; reasons.push(`${label}: non-dictionary high-consonant word`);
    }
  }

  // Random-letters name: neither first nor last resembles a real name/word
  if (nameWords.length > 0) {
    const first = nameWords[0];
    const last = nameWords[nameWords.length - 1];
    if (!resemblesRealNameWord(first) && !resemblesRealNameWord(last)) {
      score += 0.5; reasons.push('full_name: no name-like or dictionary-like part');
    }
  }

  // Email local-part gibberish
  const emailLocal = String(payload.email || '').split('@')[0] || '';
  if (toWords(emailLocal).some((w) => isVowellessWord(w) || hasConsonantRun(w))) {
    score += 0.3; reasons.push('email: gibberish local part');
  }

  // Signal A part 1: Gmail dot-trick (3+ dots in local part)
  if (isGmailDotTrick(payload.email)) {
    score += 0.5; reasons.push('email: gmail dot-trick (3+ dots)');
  }

  // Company contradictions
  const company = String(payload.company_name || '').toLowerCase().trim();
  if (company === 'individual homeowner' && applicantType === 'property_manager') {
    score += 0.3; reasons.push('company_name: "individual homeowner" from a property manager');
  }

  // Signal C: Gibberish LLC detector — gibberish word immediately before "LLC"
  if (company.endsWith('llc') || company.endsWith('llc.')) {
    const before = company.replace(/llc\.?$/, '').trim();
    const beforeWords = toWords(before);
    if (beforeWords.length > 0) {
      const lastWord = beforeWords[beforeWords.length - 1];
      if (lastWord.length >= 4 && !resemblesRealNameWord(lastWord) &&
          (consonantRatio(lastWord) > 0.6 || isVowellessWord(lastWord) || hasConsonantRun(lastWord))) {
        score += 0.4; reasons.push('company_name: gibberish word before LLC');
      }
    }
  }

  // Real prose in the message is a positive signal
  const message = String(payload.message || '').trim();
  if (message.length >= 40 && message.split(/\s+/).length >= 6 && !isGibberishText(message)) {
    score -= 0.3; reasons.push('message: real prose (positive signal)');
  }

  if (score < 0) score = 0;
  return { score, reasons };
}

// Context-aware scoring: adds canonical gmail repeat signals that require
// DB lookups the caller performs.
// ctx = { canonicalGmailPriorCount: number }
export function computeSpamScoreWithContext(payload, ctx = {}) {
  const { score: baseScore, reasons } = computeSpamScore(payload);
  let score = baseScore;

  const priorCount = ctx.canonicalGmailPriorCount || 0;
  if (priorCount >= 1) {
    // Signal D: 2+ same canonical gmail → +0.4
    // Signal A part 2: +0.3 per prior (cumulative)
    const bump = 0.4 + 0.3 * priorCount;
    score += bump;
    reasons.push(`canonical gmail repeat: ${priorCount} prior (+${bump.toFixed(1)})`);
  }

  if (score < 0) score = 0;
  return { score, reasons };
}

// User/email-only spam scoring. Used by bulkPurgeSpamBase44Users (cleanup of
// native Base44 App Users that bypassed the /apply form defenses) and by
// handleColdSignup (intercept before a PortalAccessRequest is created).
// Only email + full_name are available for native users, so this relies on
// the highest-confidence signals: Gmail dot-trick abuse, disposable domains,
// and vowelless/consonant-cluster local parts. Conservative by design — a
// false positive on a real user is worse than letting a borderline bot
// through (bots still hit the preserve rules in the purge function).
//
// Bands (applied by the caller):
//   score > 0.7  -> high-confidence spam (purge candidate / silent reject)
//   0.4 - 0.7   -> spam_review (quarantine, no admin notification)
//   < 0.4       -> normal
export function computeUserSpamScore({ email, full_name } = {}) {
  const reasons = [];
  let score = 0;
  const e = String(email || '').toLowerCase().trim();
  const local = e.split('@')[0] || '';

  // Signal A: Gmail dot-trick — 3+ dots in local part. Real humans almost
  // never insert 3+ dots; bots scatter them to defeat Gmail dedup.
  if (canonicalGmail(e)) {
    const baseLocal = local.split('+')[0];
    const dots = (baseLocal.match(/\./g) || []).length;
    if (dots >= 5) { score += 0.85; reasons.push(`gmail dot-trick (${dots} dots)`); }
    else if (dots >= 3) { score += 0.75; reasons.push(`gmail dot-trick (${dots} dots)`); }
  }

  // Disposable / throwaway email domain
  if (isDisposableEmail(e)) { score += 0.8; reasons.push('disposable email domain'); }

  // Email local-part gibberish (vowelless words or long consonant runs)
  const localWords = toWords(local);
  if (localWords.some((w) => isVowellessWord(w))) { score += 0.5; reasons.push('email local-part vowelless'); }
  if (localWords.some((w) => hasConsonantRun(w))) { score += 0.4; reasons.push('email local-part consonant run'); }

  if (score > 1) score = 1;
  return { score, reasons };
}