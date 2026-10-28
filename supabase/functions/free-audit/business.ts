/**
 * What kind of business the site is, and the checks that matter for that
 * kind (engine v2). A restaurant needs a menu, hours and a reservation link;
 * a shop needs product data and returns info; a local service needs a phone
 * link, an address and LocalBusiness data. None of this is scored: the 21
 * checks and their copy stay stable. Pure helpers, no network.
 *
 * Also: the data a search result and a link card are built from
 * (`previewData`), so the UI can draw "how Google and Slack show you" before
 * and after a fix.
 */
import * as cheerio from "npm:cheerio@1.0.0";
import type { ExtraCheck } from "./extras.ts";

export type CategoryId =
  | "ecommerce"
  | "restaurant"
  | "local"
  | "saas"
  | "app"
  | "agency"
  | "content"
  | "nonprofit"
  | "course"
  | "other";

export interface Category {
  id: CategoryId;
  label: string;
  confidence: "high" | "medium" | "low";
  /** Short human-readable reasons ("App Store link", "Restaurant structured data"). */
  signals: string[];
}

export const CATEGORY_LABELS: Record<CategoryId, string> = {
  ecommerce: "Online store",
  restaurant: "Restaurant or café",
  local: "Local business",
  saas: "Software / SaaS",
  app: "Mobile app",
  agency: "Agency or freelancer",
  content: "Blog, media or newsletter",
  nonprofit: "Nonprofit",
  course: "Courses and education",
  other: "Other",
};

/** schema.org types that are local businesses (the common subtypes of LocalBusiness). */
const LOCAL_TYPES = /^(LocalBusiness|ProfessionalService|HomeAndConstructionBusiness|Plumber|Electrician|HVACBusiness|RoofingContractor|GeneralContractor|Locksmith|MovingCompany|HousePainter|Dentist|Physician|MedicalClinic|MedicalBusiness|Optician|Pharmacy|VeterinaryCare|LegalService|Attorney|Notary|AccountingService|FinancialService|InsuranceAgency|RealEstateAgent|BeautySalon|HairSalon|NailSalon|DaySpa|HealthClub|ExerciseGym|SportsActivityLocation|AutoRepair|AutoDealer|AutomotiveBusiness|ChildCare|DryCleaningOrLaundry|EmergencyService|EmploymentAgency|EntertainmentBusiness|Hotel|LodgingBusiness|BedAndBreakfast|Hostel|TravelAgency|Store|ClothingStore|Florist|Bakery|SelfStorage|TouristInformationCenter|AnimalShelter|Library|RadioStation)$/;
const FOOD_TYPES = /^(Restaurant|FoodEstablishment|CafeOrCoffeeShop|BarOrPub|Bakery|FastFoodRestaurant|IceCreamShop|Winery|Brewery|Distillery)$/;
const PRODUCT_TYPES = /^(Product|ProductGroup|OnlineStore)$/;
const OFFER_TYPES = /^(Offer|AggregateOffer)$/;
const SOFTWARE_TYPES = /^(SoftwareApplication|WebApplication|MobileApplication)$/;

/**
 * The structured-data type that shows a shop, if any. Offers count only when
 * they aren't a software plan (SoftwareApplication.offers is a price, not a
 * shop). ItemList never counts: sites use it for navigation and article lists.
 */
function storeType(types: string[]): string | undefined {
  return types.find((t) => PRODUCT_TYPES.test(t)) ?? (types.some((t) => SOFTWARE_TYPES.test(t)) ? undefined : types.find((t) => OFFER_TYPES.test(t)));
}

export interface BusinessInput {
  html: string;
  pageUrl: string;
  jsonLdTypes: string[];
  isStore: boolean;
  hasPricingPage: boolean;
  ctaButtons: string[];
  trustSignals: string[];
  /** Text of other pages already read (the full report crawls a few); the free scan reads only the homepage. */
  otherPages?: { url: string; text: string }[];
}

interface Facts {
  low: string;
  text: string;
  hrefs: string[];
  telLinks: number;
  appStoreId: string | null;
  playStore: boolean;
  feedLink: boolean;
  emailInput: boolean;
  mapLink: boolean;
  smartBanner: boolean;
  types: string[];
}

function factsOf(input: BusinessInput): Facts {
  const $ = cheerio.load(input.html.slice(0, 2_000_000));
  const hrefs: string[] = [];
  $("a[href]").each((_, el) => {
    const h = ($(el).attr("href") ?? "").trim();
    if (h) hrefs.push(h);
  });
  const feedLink = $('link[rel="alternate"][type="application/rss+xml"], link[rel="alternate"][type="application/atom+xml"], link[rel="alternate"][type="application/feed+json"]').length > 0;
  const emailInput = $('input[type="email"], input[name*="email" i]').length > 0;
  const mapLink = hrefs.some((h) => /google\.[a-z.]+\/maps|maps\.google\.|goo\.gl\/maps|maps\.app\.goo\.gl|maps\.apple\.com|waze\.com\/ul|bing\.com\/maps/.test(h)) ||
    $('iframe[src*="google.com/maps"], iframe[src*="maps.google"], iframe[src*="openstreetmap"]').length > 0;
  const smartBanner = $('meta[name="apple-itunes-app"]').length > 0;
  const appStore = hrefs.map((h) => h.match(/apps\.apple\.com\/[^"'\s]*?\/id(\d{6,12})/)?.[1]).find(Boolean) ?? null;
  const playStore = hrefs.some((h) => /play\.google\.com\/store\/apps\/details/.test(h));
  $("script, style, noscript, svg, template").remove();
  const text = $("body").text().replace(/\s+/g, " ").trim().slice(0, 300_000);
  return {
    low: text.toLowerCase(),
    text,
    hrefs,
    telLinks: hrefs.filter((h) => /^tel:/i.test(h)).length,
    appStoreId: appStore,
    playStore,
    feedLink,
    emailInput,
    mapLink,
    smartBanner,
    types: input.jsonLdTypes,
  };
}

const has = (low: string, re: RegExp) => re.test(low);
const linkMatches = (f: Facts, re: RegExp) => f.hrefs.some((h) => re.test(h.toLowerCase()));

// Words in the languages Olmene serves; matched on visible text.
const MENU = /\b(?:our menu|menu|carte|speisekarte|menú|carta|menù|cardápio|menukaart|meny|ruokalista|menü)\b/;
const RESERVE = /\b(?:book a table|reserve|reservation|reservations|reservieren|tisch reservieren|réserver|réservation|reservar|reserva|prenota|prenotazione|reserveren|boka bord)\b|opentable|resy\.com|thefork|sevenrooms|quandoo|tock\.com/;
const HOURS = /\b(?:opening hours|open hours|hours of operation|business hours|öffnungszeiten|horaires|horario|orari|horário|openingstijden|öppettider|aukioloajat|godziny otwarcia)\b|\b(?:mon|monday|tue|tuesday|wed|thu|fri|sat|sun|mo|di|mi|do|fr|sa|so|lun|mar|mer|jeu|ven|sam|dim)\b[^.]{0,30}\b\d{1,2}[:.h]\d{2}/;
const ADDRESS = /\b\d{1,5}\s+[\p{L}.'-]+(?:\s+[\p{L}.'-]+){0,3}\s+(?:street|st\.|road|rd\.|avenue|ave\.|boulevard|blvd|lane|ln\.|drive|dr\.|way|place|square|straße|strasse|str\.|weg|allee|platz|rue|avenue|calle|avenida|via|piazza|rua|laan|straat|gatan|vägen|katu|ulica)\b|\b(?:straße|strasse|rue|calle|via|rua|ulica)\s+[\p{L}.'-]+\s+\d{1,5}\b/u;
const BOOKING = /\b(?:book now|book an appointment|book online|schedule|appointment|get a quote|free quote|request a quote|free estimate|call us|call now|termin|rendez-vous|cita|preventivo|orçamento|offerte)\b/;
const TRIAL = /\b(?:free trial|start free|try (?:it )?free|try for free|get started free|sign up free|book a demo|get a demo|request a demo|schedule a demo|kostenlos testen|essai gratuit|prueba gratis|prova gratuita|teste grátis|gratis proberen)\b/;
const SAAS_WORDS = /\b(?:dashboard|integrations?|api|workflow|automat\w+|platform|per seat|per user|teams?|workspace|onboarding|sso|soc ?2|uptime)\b/g;
const SHIPPING = /\b(?:shipping|delivery|returns?|refunds?|versand|rückgabe|livraison|retours?|envío|devoluciones|spedizione|resi|frete|devoluções|verzending|retourneren|frakt|toimitus)\b/;
const PAYMENT = /\b(?:visa|mastercard|american express|amex|paypal|apple pay|google pay|klarna|afterpay|shop pay|stripe|ideal|bancontact|sofort|twint)\b/;
const REVIEWS = /\b(?:reviews?|rated|stars?|trustpilot|rezensionen|bewertungen|avis|reseñas|recensioni|avaliações|beoordelingen)\b/;
const WORK = /\b(?:our work|case stud(?:y|ies)|portfolio|selected work|projects|clients|referenzen|réalisations|proyectos|lavori|projetos)\b/;
const AGENCY_WORDS = /\b(?:agency|studio|freelance|freelancer|consultancy|consulting|we design|we build|we help brands|branding|web design|design studio|marketing agency|agentur|agence|agencia|agenzia|agência|bureau)\b/;
const DONATE = /\b(?:donate|donation|give now|support our work|become a member|spenden|faire un don|donar|dona ora|doar|doneer|ge en gåva|lahjoita|wesprzyj)\b/;
const NONPROFIT = /\b(?:nonprofit|non-profit|charity|registered charity|501\(c\)\(3\)|foundation|ngo|gemeinnützig|association loi 1901|ong|onlus|stichting|välgörenhet)\b/;
const COURSE = /\b(?:enroll|enrol|course|courses|curriculum|syllabus|lessons?|students|cohort|bootcamp|certificate|masterclass|kurs|cours|curso|corso|cursus)\b/g;
const BLOG = /\b(?:blog|articles|newsletter|subscribe|latest posts|read more|editor|issue #?\d+|podcast|episodes?)\b/g;

function count(low: string, re: RegExp): number {
  return (low.match(re) ?? []).length;
}

/**
 * Best guess at the kind of business, with the reasons. Order matters: the
 * most specific evidence (structured data, app stores, menus) wins over word
 * counts. Low confidence when only words point the way.
 */
export function detectCategory(input: BusinessInput, facts: Facts = factsOf(input)): Category {
  const types = facts.types;
  const make = (id: CategoryId, confidence: Category["confidence"], signals: string[]): Category => ({ id, label: CATEGORY_LABELS[id], confidence, signals: signals.slice(0, 4) });
  const low = facts.low;

  const food = types.find((t) => FOOD_TYPES.test(t));
  const menu = has(low, MENU) || linkMatches(facts, /\/(?:menu|carte|speisekarte|menu-\w+)/);
  const reserve = has(low, RESERVE) || linkMatches(facts, /opentable|resy\.com|thefork|sevenrooms|quandoo|tock\.com/);
  if (food) return make("restaurant", "high", [`${food} structured data`, ...(menu ? ["menu"] : []), ...(reserve ? ["reservations"] : [])]);
  if (menu && reserve) return make("restaurant", "medium", ["menu", "reservations"]);

  const storeSchema = storeType(types);
  if (input.isStore || storeSchema) {
    const why = [storeSchema ? "product structured data" : "store platform or product prices"];
    if (has(low, /add to (?:cart|bag)/)) why.push("add-to-cart");
    return make("ecommerce", input.isStore ? "high" : "medium", why);
  }

  if (facts.appStoreId || facts.playStore) {
    const why = [facts.appStoreId ? "App Store link" : "Google Play link"];
    if (facts.appStoreId && facts.playStore) why.push("Google Play link");
    return make("app", "high", why);
  }

  const local = types.find((t) => LOCAL_TYPES.test(t));
  const address = has(facts.text, ADDRESS) || types.includes("PostalAddress");
  const hours = has(low, HOURS);
  if (local) return make("local", "high", [`${local} structured data`, ...(facts.telLinks ? ["phone link"] : []), ...(address ? ["street address"] : [])]);
  const localScore = (facts.telLinks ? 1 : 0) + (address ? 1 : 0) + (hours ? 1 : 0) + (facts.mapLink ? 1 : 0) + (has(low, BOOKING) ? 1 : 0);
  if (localScore >= 3) {
    return make("local", "medium", [facts.telLinks ? "phone link" : "", address ? "street address" : "", hours ? "opening hours" : "", facts.mapLink ? "map link" : ""].filter(Boolean));
  }

  if (types.some((t) => /^(NGO|NonprofitType|Nonprofit501c3)$/.test(t)) || (has(low, DONATE) && has(low, NONPROFIT))) {
    return make("nonprofit", has(low, NONPROFIT) && has(low, DONATE) ? "high" : "medium", ["donate call to action", "nonprofit wording"]);
  }

  const courseHits = count(low, COURSE);
  if (types.some((t) => /^(Course|EducationalOrganization|CourseInstance)$/.test(t)) || courseHits >= 8) {
    return make("course", types.includes("Course") ? "high" : "medium", [types.includes("Course") ? "Course structured data" : "course wording"]);
  }

  const saasHits = count(low, SAAS_WORDS);
  const trial = has(low, TRIAL) || input.ctaButtons.some((c) => TRIAL.test(c.toLowerCase()));
  if (types.includes("SoftwareApplication") || types.includes("WebApplication") || (input.hasPricingPage && (trial || saasHits >= 5))) {
    return make("saas", types.includes("SoftwareApplication") || trial ? "high" : "medium", [
      ...(types.includes("SoftwareApplication") ? ["SoftwareApplication structured data"] : []),
      ...(input.hasPricingPage ? ["pricing"] : []),
      ...(trial ? ["free trial or demo"] : []),
    ]);
  }

  if (has(low, AGENCY_WORDS) && (has(low, WORK) || linkMatches(facts, /\/(?:work|portfolio|case-stud|projects)/))) {
    return make("agency", "medium", ["agency or studio wording", "work or case studies"]);
  }

  const blogHits = count(low, BLOG);
  if (facts.feedLink || types.some((t) => /^(Blog|BlogPosting|Article|NewsArticle|NewsMediaOrganization|PodcastSeries)$/.test(t)) || blogHits >= 6) {
    return make("content", facts.feedLink || types.some((t) => /Article|Blog/.test(t)) ? "high" : "medium", [facts.feedLink ? "RSS feed" : "articles or newsletter"]);
  }

  if (trial || saasHits >= 6) return make("saas", "low", ["software wording"]);
  if (localScore >= 2) return make("local", "low", ["phone, address or hours"]);
  return make("other", "low", []);
}

// ─── Checks per kind of business (unscored, group "Business") ────────────

function pathOf(url: string): string {
  try {
    return new URL(url).pathname || "/";
  } catch {
    return url;
  }
}

function c(id: string, check: string, ok: boolean | "warn", passDetail: string, failDetail: string, failStatus: "warn" | "fail" = "warn"): ExtraCheck {
  const status = ok === true ? "pass" : ok === "warn" ? "warn" : failStatus;
  return { id: `biz-${id}`, group: "Business", check, status, detail: ok === true ? passDetail : failDetail };
}

export function businessChecks(category: Category, input: BusinessInput, facts: Facts = factsOf(input)): ExtraCheck[] {
  const low = facts.low;
  const types = facts.types;
  const out: ExtraCheck[] = [];
  const localSchema = types.some((t) => LOCAL_TYPES.test(t) || FOOD_TYPES.test(t));
  const address = has(facts.text, ADDRESS) || types.includes("PostalAddress");
  switch (category.id) {
    case "restaurant":
      out.push(
        c("menu", "Menu is one tap away", has(low, MENU) || linkMatches(facts, /\/(?:menu|carte|speisekarte)/), "A menu link or menu text is on the homepage", "No menu on the homepage: it's what most restaurant visitors look for first"),
        c("reservations", "Reservations or ordering", has(low, RESERVE) || linkMatches(facts, /opentable|resy|thefork|sevenrooms|quandoo|tock|ubereats|deliveroo|doordash|wolt|lieferando/), "Visitors can reserve or order from the homepage", "No reservation or ordering link on the homepage"),
        c("hours", "Opening hours", has(low, HOURS) || types.includes("OpeningHoursSpecification"), "Opening hours are on the page", "No opening hours on the homepage: people check them before they come"),
        c("phone", "Tap-to-call phone link", facts.telLinks > 0, "A tel: link lets phone visitors call in one tap", "No tel: phone link: phone visitors have to copy the number"),
        c("schema", "Restaurant structured data", types.some((t) => FOOD_TYPES.test(t)), "Restaurant structured data helps Google and map apps show your hours, menu and cuisine", "No Restaurant structured data: Google and AI assistants have to guess your hours, menu and cuisine"),
      );
      break;
    case "local":
      out.push(
        c("phone", "Tap-to-call phone link", facts.telLinks > 0, "A tel: link lets phone visitors call in one tap", "No tel: phone link: most local visitors are on phones and want to call"),
        c("address", "Address on the page", address, "Your address is on the homepage", "No street address found on the homepage: people and search engines use it to place you"),
        c("hours", "Opening hours", has(low, HOURS) || types.includes("OpeningHoursSpecification"), "Opening hours are on the page", "No opening hours found on the homepage"),
        c("map", "Map or directions", facts.mapLink, "A map or directions link is on the page", "No map or directions link"),
        c("booking", "Book, quote or call to action", has(low, BOOKING) || facts.telLinks > 0, "Visitors can book, ask for a quote or call", "No way to book, ask for a quote or call from the homepage"),
        c("schema", "LocalBusiness structured data", localSchema, "LocalBusiness structured data tells Google your name, address, phone and hours", "No LocalBusiness structured data: it's how Google and AI assistants confirm your address, phone and hours"),
      );
      break;
    case "ecommerce":
      out.push(
        c("product-schema", "Product structured data", storeType(types) !== undefined, "Product data is marked up (prices and availability can show in search)", "No Product or Offer structured data on the homepage: make sure product pages have it so prices and stock show in Google"),
        c("shipping", "Shipping and returns are easy to find", has(low, SHIPPING) || linkMatches(facts, /shipping|delivery|returns|refund|versand|livraison|envio|spedizione/), "Shipping or returns information is linked", "No shipping or returns information on the homepage: it's a top reason shoppers leave"),
        c("payment", "Payment options shown", has(low, PAYMENT), "Accepted payment methods are visible", "No payment methods shown (Visa, PayPal, Apple Pay…): showing them reassures first-time buyers"),
        c("reviews", "Customer reviews visible", types.includes("AggregateRating") || types.includes("Review") || has(low, REVIEWS), "Reviews or ratings are visible", "No reviews or ratings visible on the homepage"),
      );
      break;
    case "saas": {
      const trial = has(low, TRIAL) || input.ctaButtons.some((b) => TRIAL.test(b.toLowerCase()));
      // Offered elsewhere (often the pricing page) but not on the homepage: say so, rather than "no trial".
      const elsewhere = trial ? undefined : input.otherPages?.find((p) => TRIAL.test(p.text.toLowerCase()));
      out.push(
        elsewhere
          ? c("trial", "Free trial or demo offer", "warn", "", `A free trial or demo is offered on ${pathOf(elsewhere.url)}, but not on the homepage: put it next to the main call to action`)
          : c("trial", "Free trial or demo offer", trial, "A free trial or demo call to action is on the homepage", "No free trial or demo offer: most software buyers want to try before they pay"),
        c("proof", "Social proof", input.trustSignals.length >= 2, `Proof found: ${input.trustSignals.slice(0, 3).join(", ")}`, input.trustSignals.length ? `Only ${input.trustSignals[0]}: add customer logos, quotes or numbers near the signup` : "No customer logos, quotes or numbers"),
        c("security", "Security and privacy page", linkMatches(facts, /security|trust|privacy|gdpr|dpa|compliance/), "A security, trust or privacy page is linked", "No security or privacy link: business buyers look for one before signing up"),
        c("schema", "SoftwareApplication structured data", types.includes("SoftwareApplication") || types.includes("WebApplication"), "Software structured data is present", "No SoftwareApplication structured data (optional): helps search engines and AI assistants describe your product and price"),
      );
      break;
    }
    case "app":
      out.push(
        c("stores", "Both app stores linked", !!facts.appStoreId && facts.playStore, "App Store and Google Play are both linked", facts.appStoreId ? "Only the App Store is linked" : "Only Google Play is linked"),
        ...(facts.appStoreId ? [c("smart-banner", "iPhone smart app banner", facts.smartBanner, "Safari shows an 'Open in App Store' banner", "No apple-itunes-app meta tag: Safari can show an install banner on iPhone with one line of HTML")] : []),
        c("schema", "MobileApplication structured data", types.includes("MobileApplication") || types.includes("SoftwareApplication"), "App structured data is present", "No MobileApplication structured data (optional): lets search show your rating and price"),
      );
      break;
    case "agency":
      out.push(
        c("work", "Work or case studies", has(low, WORK) || linkMatches(facts, /\/(?:work|portfolio|case-stud|projects)/), "Work or case studies are linked", "No work or case studies: proof of past results is what sells a service"),
        c("contact", "Clear way to start a project", has(low, BOOKING) || facts.emailInput || linkMatches(facts, /contact|calendly|cal\.com|start-a-project|hire/), "Visitors can book a call or get in touch", "No booking link or contact form on the homepage"),
        c("proof", "Client logos or testimonials", input.trustSignals.length >= 1, `Proof found: ${input.trustSignals.slice(0, 3).join(", ")}`, "No client logos or testimonials"),
      );
      break;
    case "content":
      out.push(
        c("feed", "RSS feed is discoverable", facts.feedLink, "Feed readers and aggregators can find your RSS feed", "No <link rel=\"alternate\"> RSS feed in the head: readers and AI tools can't follow your posts"),
        c("subscribe", "Newsletter signup", facts.emailInput, "Visitors can subscribe by email", "No email signup on the homepage: your readers have no way to come back"),
        c("schema", "Article structured data", types.some((t) => /Article|BlogPosting|Blog/.test(t)), "Articles are marked up", "No Article or BlogPosting structured data on the homepage: make sure posts have it (author, date)"),
      );
      break;
    case "nonprofit":
      out.push(
        c("donate", "Donate call to action", has(low, DONATE), "A donate button is on the homepage", "No donate call to action on the homepage", "fail"),
        c("transparency", "Registration and transparency", /\b(?:registered charity|charity number|501\(c\)\(3\)|ein\b|annual report|financials|transparency|impact report)\b/.test(low), "Charity registration or reports are mentioned", "No charity number, annual report or impact page: donors look for proof their money is used well"),
        c("schema", "Organization structured data", types.some((t) => /^(NGO|Organization|NonprofitType)$/.test(t)), "Organization structured data is present", "No Organization or NGO structured data"),
      );
      break;
    case "course":
      out.push(
        c("enroll", "Enroll call to action", /\b(?:enroll|enrol|join the course|start learning|buy the course|get access|sign up)\b/.test(low), "Visitors can enroll from the homepage", "No clear enroll button on the homepage"),
        c("curriculum", "What you'll learn", /\b(?:curriculum|syllabus|what you'?ll learn|modules?|lessons?)\b/.test(low), "The course content is described", "No curriculum or lesson list: buyers want to see what they'll learn"),
        c("schema", "Course structured data", types.includes("Course"), "Course structured data is present", "No Course structured data: lets Google show your course in course results"),
      );
      break;
    default:
      break;
  }
  return out;
}

/** Category + its checks in one pass (one HTML parse). */
export function analyzeBusiness(input: BusinessInput): { category: Category; checks: ExtraCheck[]; appStoreId: string | null; phoneLinks: number } {
  const facts = factsOf(input);
  const category = detectCategory(input, facts);
  return { category, checks: businessChecks(category, input, facts), appStoreId: facts.appStoreId, phoneLinks: facts.telLinks };
}

// ─── Search result and link card data ────────────────────────────────────

export interface PreviewData {
  /** What Google shows: page title, description, the breadcrumb-style URL and the site icon. */
  serp: { title: string | null; description: string | null; displayUrl: string; favicon: string | null; siteName: string | null };
  /** What Slack, LinkedIn, X, iMessage show for a shared link. */
  social: { title: string | null; description: string | null; image: string | null; siteName: string | null; card: string | null; host: string };
}

function abs(href: string | undefined | null, base: string): string | null {
  if (!href) return null;
  try {
    const u = new URL(href.trim(), base);
    return u.protocol === "https:" || u.protocol === "http:" ? u.toString() : null;
  } catch {
    return null;
  }
}

export function previewData(html: string, pageUrl: string, faviconIcoOk = false): PreviewData {
  const $ = cheerio.load(html.slice(0, 600_000));
  const meta = (sel: string) => $(sel).attr("content")?.replace(/\s+/g, " ").trim() || null;
  const url = new URL(pageUrl);
  const title = $("title").first().text().replace(/\s+/g, " ").trim() || null;
  const description = meta('meta[name="description"]');
  const siteName = meta('meta[property="og:site_name"]') ?? meta('meta[name="application-name"]');
  const icon = $('link[rel~="icon"]').first().attr("href") ?? $('link[rel="apple-touch-icon"]').first().attr("href");
  const path = url.pathname.replace(/\/$/, "").split("/").filter(Boolean);
  return {
    serp: {
      title,
      description,
      displayUrl: [url.hostname.replace(/^www\./, ""), ...path].join(" › "),
      favicon: abs(icon, pageUrl) ?? (faviconIcoOk ? `${url.origin}/favicon.ico` : null),
      siteName,
    },
    social: {
      title: meta('meta[property="og:title"]') ?? meta('meta[name="twitter:title"]') ?? title,
      description: meta('meta[property="og:description"]') ?? meta('meta[name="twitter:description"]') ?? description,
      image: abs(meta('meta[property="og:image"]') ?? meta('meta[property="og:image:url"]') ?? meta('meta[name="twitter:image"]'), pageUrl),
      siteName,
      card: meta('meta[name="twitter:card"]'),
      host: url.hostname.replace(/^www\./, ""),
    },
  };
}
