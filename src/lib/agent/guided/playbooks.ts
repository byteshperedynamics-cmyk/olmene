/**
 * Guided fixes (engine v2): where each kind of change is made on each
 * platform, in the platform's own words. Olmene pairs these steps with the
 * exact values to paste, then re-checks the live site, so a renamed menu
 * item costs the customer a moment of searching, never a wrong result.
 *
 * Steps checked against each platform's help pages in October 2026. When a
 * platform can't do something (e.g. root files on hosted builders), the
 * playbook says so instead of inventing a workaround.
 */

export interface Playbook {
  id: string;
  label: string;
  /** Page title + meta description of the homepage. */
  seo: string[];
  /** Social preview (Open Graph) title, description and image. */
  social: string[];
  /** Custom code in <head> for every page, or null when the platform doesn't allow it. */
  headCode: string[] | null;
  /** Image alt text. */
  alt: string[];
  /** Site language (the <html lang> attribute). */
  lang: string[];
  /** A link in the main menu. */
  nav: string[];
  /** Headline and text on the homepage. */
  text: string[];
  /** Files at the domain root (llms.txt), or null when not possible. */
  rootFiles: string[] | null;
  /** robots.txt / sitemap.xml: what the platform does. */
  sitemap: string;
  /** Canonical link: what the platform does. */
  canonical: string;
  /** Mobile viewport: what the platform does. */
  viewport: string;
  /** Plan limits worth knowing (shown once). */
  notes?: string;
}

const PUBLISH = (what = "Publish") => `${what} so the change goes live.`;

const BASE: Omit<Playbook, "id" | "label"> = {
  seo: ["Open your site's SEO or page settings for the homepage.", "Paste the title and the description into their fields.", PUBLISH("Save and publish")],
  social: ["Open the homepage's social sharing (Open Graph) settings.", "Paste the title and description; upload a 1200×630 image.", PUBLISH("Save and publish")],
  headCode: ["Find the setting for custom code in the <head> of every page (often called Header code, Head HTML or Code injection).", "Paste the snippet and save.", PUBLISH()],
  alt: ["Select each image listed below in your editor.", "Paste its description into the Alt text field.", PUBLISH()],
  lang: ["Open your site settings and set the site language."],
  nav: ["Open your site's menu (navigation) settings.", "Add a menu item named as below that links to the page.", PUBLISH()],
  text: ["Open the homepage in your editor.", "Click the text and replace it with the new copy.", PUBLISH()],
  rootFiles: ["Upload the file to the top folder of your site so it opens at yourdomain.com/<file>."],
  sitemap: "Most platforms create robots.txt and sitemap.xml for you; check that the sitemap is switched on in your SEO settings.",
  canonical: "Most platforms add a canonical link automatically; check your SEO settings if it's missing.",
  viewport: "Your theme or template sets this; switch to a mobile-friendly (responsive) template if it's missing.",
};

const wp = (plugin: "yoast" | "rankmath" | "aioseo" | "none"): Pick<Playbook, "seo" | "social"> => {
  if (plugin === "yoast") {
    return {
      seo: ["In WordPress, go to Pages and edit your homepage.", "Scroll to the Yoast SEO box: paste the SEO title and the Meta description.", "Click Update. (Homepage shows your latest posts? Use Yoast SEO → Settings → Content types → Homepage instead.)"],
      social: ["Edit the homepage → Yoast SEO box → Social tab.", "Paste the social title and description; choose a 1200×630 image.", "Click Update."],
    };
  }
  if (plugin === "rankmath") {
    return {
      seo: ["In WordPress, edit your homepage.", "Click the Rank Math icon (top right) → Edit Snippet.", "Paste the Title and the Description, then Update."],
      social: ["Edit the homepage → Rank Math → Edit Snippet → Social tab.", "Paste the title and description; choose a 1200×630 image.", "Click Update."],
    };
  }
  if (plugin === "aioseo") {
    return {
      seo: ["In WordPress, edit your homepage.", "Scroll to the AIOSEO Settings box → General: paste the Post Title and the Meta Description.", "Click Update."],
      social: ["Edit the homepage → AIOSEO Settings → Social tab.", "Paste the title and description; choose a 1200×630 image.", "Click Update."],
    };
  }
  return {
    seo: ["WordPress needs an SEO plugin to set a meta description: go to Plugins → Add New, install and activate Yoast SEO (free).", "Edit your homepage → Yoast SEO box: paste the SEO title and Meta description.", "Click Update."],
    social: ["With Yoast SEO installed: edit the homepage → Yoast SEO box → Social tab.", "Paste the title and description; choose a 1200×630 image.", "Click Update."],
  };
};

export function wordpressPlaybook(plugin: "yoast" | "rankmath" | "aioseo" | "none"): Playbook {
  return {
    id: "wordpress",
    label: "WordPress",
    ...wp(plugin),
    headCode: ["Go to Plugins → Add New, install and activate WPCode (free).", "Code Snippets → Header & Footer → paste the snippet into Header.", "Click Save Changes."],
    alt: ["Go to Media → Library and click each image listed below.", "Paste the description into Alternative Text (it saves by itself).", "Images already placed in a page: edit the page, select the image → Block settings → Alternative text → Update."],
    lang: ["Go to Settings → General → Site Language, pick the language and click Save Changes."],
    nav: ["Go to Appearance → Menus (block themes: Appearance → Editor → Navigation).", "Add the page to the main menu with the label below.", "Click Save Menu."],
    text: ["Go to Pages and edit your homepage (or Appearance → Editor if your theme builds the homepage).", "Click the headline or text and type the new copy.", "Click Update."],
    rootFiles: plugin === "yoast"
      ? ["Yoast SEO can create llms.txt for you: Yoast SEO → Settings → Site features → turn on llms.txt.", "Or upload the file to your site's top folder with your host's file manager."]
      : ["Check your SEO plugin for an llms.txt option (Yoast SEO has one).", "Or upload the file to your site's top folder with your host's file manager or SFTP."],
    sitemap: "WordPress serves /wp-sitemap.xml itself; SEO plugins replace it with /sitemap_index.xml and add it to robots.txt.",
    canonical: "SEO plugins (Yoast, Rank Math, AIOSEO) add canonical links automatically once active.",
    viewport: "Your theme sets this; any theme from the last few years does. Switch themes if it's missing.",
  };
}

const PLAYBOOKS: Record<string, Omit<Playbook, "id">> = {
  shopify: {
    label: "Shopify",
    seo: ["In Shopify admin, go to Online Store → Preferences.", "Paste the Homepage title and the Homepage meta description.", "Click Save."],
    social: ["Online Store → Preferences → Social sharing image → Edit → upload a 1200×630 image.", "Shopify uses your homepage title and description for the text.", "Click Save."],
    headCode: ["Online Store → Themes → ⋯ (next to your live theme) → Duplicate, to keep a backup.", "On the live theme: ⋯ → Edit code → layout/theme.liquid.", "Paste the snippet just before </head> and click Save."],
    alt: ["Products: open the product → click the image → Add alt text → Save.", "Other images: Content → Files → click the image → Alt text → Save."],
    lang: ["Settings → Languages: your default language is what the theme writes into the page."],
    nav: ["Online Store → Navigation → Main menu → Add menu item.", "Use the label below and link it to the page.", "Click Save menu."],
    text: ["Online Store → Themes → Customize.", "Click the homepage section with the headline and edit the text.", "Click Save."],
    rootFiles: null,
    sitemap: "Shopify creates robots.txt and sitemap.xml automatically; robots.txt can be changed through the robots.txt.liquid template.",
    canonical: "Shopify themes add canonical links automatically.",
    viewport: "Shopify themes set this; check theme.liquid if it's missing.",
    notes: "Shopify doesn't allow custom files at your domain root, so llms.txt needs an app from the Shopify App Store.",
  },
  webflow: {
    label: "Webflow",
    seo: ["In the Designer, open the Pages panel and click ⚙ next to Home.", "Under SEO settings, paste the Title tag and the Meta description.", "Click Save, then Publish."],
    social: ["Same page settings → Open Graph settings.", "Paste the Open Graph title and description; upload a 1200×630 image.", "Click Save, then Publish."],
    headCode: ["Site settings → Custom code → Head code.", "Paste the snippet and click Save changes.", "Publish the site."],
    alt: ["Open the Assets panel, hover each image listed below → ⚙ → Alt text.", "Or select the image on the canvas → Settings panel (D) → Alt text.", "Publish."],
    lang: ["Site settings → General → Language code (sites using Localization: Localization → primary locale).", "Publish."],
    nav: ["Select the Navbar → add a Nav Link with the label below and link it to the page.", "Publish."],
    text: ["Double-click the headline or text on the canvas and type the new copy.", "Publish."],
    rootFiles: null,
    sitemap: "Site settings → SEO → Auto-generate sitemap: turn it on. Webflow serves robots.txt from the same tab.",
    canonical: "Site settings → SEO → Global canonical tag URL: enter your domain (https://yourdomain.com).",
    viewport: "Webflow sets this on every page.",
    notes: "Custom code needs a paid Webflow site plan. Webflow doesn't host custom files at your domain root (llms.txt).",
  },
  wix: {
    label: "Wix",
    seo: ["In the Wix Editor, open Pages & Menu, click ⋯ next to Home → SEO basics.", "Paste the Title tag and the Meta description.", "Publish."],
    social: ["Same page settings → Social share → upload a 1200×630 image and paste the title and description.", "Publish."],
    headCode: ["Dashboard → Settings → Custom Code → + Add Custom Code.", "Paste the snippet, choose All pages and Head, then Apply.", "For structured data only: page settings → SEO basics → Advanced SEO → Structured data markup."],
    alt: ["Click each image in the Editor → Settings → 'What's in the image?'.", "Paste the description.", "Publish."],
    lang: ["Dashboard → Settings → Language & region → site language."],
    nav: ["Editor → Pages & Menu → add the page to the site menu with the label below.", "Publish."],
    text: ["Double-click the headline or text in the Editor and type the new copy.", "Publish."],
    rootFiles: null,
    sitemap: "Wix creates sitemap.xml automatically; edit robots.txt in Dashboard → Marketing & SEO → SEO → Robots.txt editor.",
    canonical: "Wix adds canonical links automatically.",
    viewport: "Wix sets this; check the mobile editor if pages look wrong on phones.",
    notes: "Custom Code needs a Premium plan and a connected domain. Wix doesn't host custom files at your domain root (llms.txt).",
  },
  squarespace: {
    label: "Squarespace",
    seo: ["Go to Pages, hover your homepage and click ⚙ → SEO tab.", "Paste the SEO title and the SEO description.", "Click Save. (Site-wide defaults live in Marketing → SEO.)"],
    social: ["Pages → ⚙ next to the homepage → Social Image → upload a 1200×630 image.", "Click Save."],
    headCode: ["Settings → Advanced (Developer tools on newer accounts) → Code Injection → Header.", "Paste the snippet and click Save."],
    alt: ["Edit the page, click the image block → ✏ → Content → Image alt text.", "Paste the description and click Save."],
    lang: ["Settings → Language & region → Language."],
    nav: ["Pages → drag the page into Main Navigation, or add a link with the label below."],
    text: ["Edit the page, click the headline or text and type the new copy.", "Click Save."],
    rootFiles: null,
    sitemap: "Squarespace creates robots.txt and sitemap.xml automatically.",
    canonical: "Squarespace adds canonical links automatically.",
    viewport: "Squarespace sets this on every page.",
    notes: "Code Injection needs a Core plan or higher. Squarespace doesn't host custom files at your domain root (llms.txt).",
  },
  framer: {
    label: "Framer",
    seo: ["Open Site Settings → General: paste the Title and the Description (one page only: Pages panel → ⋯ → Settings).", "Click Publish."],
    social: ["Site Settings → General → Social Preview: upload a 1200×630 image.", "Click Publish."],
    headCode: ["Site Settings → General → Custom Code → End of <head> tag.", "Paste the snippet and click Publish."],
    alt: ["Select each image on the canvas → right panel → Image → Alt Text.", "Publish."],
    lang: ["Site Settings → General → Language (or Localization for several languages).", "Publish."],
    nav: ["Select your navigation component and add a link with the label below.", "Publish."],
    text: ["Double-click the headline or text on the canvas and type the new copy.", "Publish."],
    rootFiles: null,
    sitemap: "Framer creates sitemap.xml and robots.txt automatically.",
    canonical: "Framer adds canonical links automatically once a custom domain is set.",
    viewport: "Framer sets this on every page.",
    notes: "Custom code needs a paid Framer site plan. Framer doesn't host custom files at your domain root (llms.txt).",
  },
  ghost: {
    label: "Ghost",
    seo: ["Ghost Admin → Settings → General → Meta data: paste the Meta title and Meta description.", "Click Save."],
    social: ["Settings → General → Facebook card and X card: paste the title and description, upload a 1200×630 image.", "Click Save."],
    headCode: ["Settings → Code injection → Site header.", "Paste the snippet and click Save."],
    alt: ["Edit the post or page, click each image → the alt text button → paste the description → Update."],
    lang: ["Settings → General → Publication language."],
    nav: ["Settings → Navigation → add an item with the label below and the page URL → Save."],
    text: ["Edit the homepage content (or your theme's home template) and type the new copy."],
    rootFiles: null,
    sitemap: "Ghost creates sitemap.xml and robots.txt automatically.",
    canonical: "Ghost adds canonical links automatically.",
    viewport: "Ghost themes set this.",
    notes: "Ghost doesn't host custom files at your domain root (llms.txt) unless you self-host it.",
  },
  hubspot: {
    label: "HubSpot",
    seo: ["Content → Website pages → edit your homepage → Settings.", "Paste the Page title and Meta description.", "Click Update."],
    social: ["Page Settings → Featured image (used for social previews), plus the title and description above.", "Click Update."],
    headCode: ["Settings → Content → Pages → Templates → Site header HTML.", "Paste the snippet and click Save."],
    alt: ["In the page editor, click each image module → Alt text → paste the description → Update."],
    lang: ["Page Settings → Language."],
    nav: ["Settings → Content → Navigation Menus → add the item with the label below → Save."],
    text: ["Click the headline or text in the page editor and type the new copy → Update."],
    rootFiles: null,
    sitemap: "HubSpot creates sitemap.xml; robots.txt is in Settings → Content → Pages → SEO & Crawlers.",
    canonical: "HubSpot adds canonical links automatically.",
    viewport: "HubSpot templates set this.",
  },
  duda: {
    label: "Duda",
    seo: ["Site settings → SEO → Site SEO for defaults; Page settings → SEO for the homepage.", "Paste the title and the description, then Republish."],
    social: ["Page settings → SEO → Social sharing image and text.", "Republish."],
    headCode: ["Site settings → Head HTML.", "Paste the snippet, save and Republish."],
    alt: ["Click each image → Settings → Alt text → paste the description.", "Republish."],
    lang: ["Site settings → Languages."],
    nav: ["Pages → show the page in navigation, label as below.", "Republish."],
    text: ["Click the text in the editor and type the new copy.", "Republish."],
    rootFiles: null,
    sitemap: "Duda creates sitemap.xml and robots.txt automatically.",
    canonical: "Duda adds canonical links automatically.",
    viewport: "Duda sets this.",
  },
  godaddy: {
    label: "GoDaddy Website Builder",
    seo: ["Edit Website → Settings → Search engine optimization (SEO).", "Paste the title and description for your homepage, then Publish."],
    social: ["Edit Website → Settings → Social media sharing (title, description, image).", "Publish."],
    headCode: null,
    alt: ["Click each image → Image settings → Alt text → paste the description.", "Publish."],
    lang: ["Settings → Site language."],
    nav: ["Edit Website → Pages → show the page in navigation with the label below.", "Publish."],
    text: ["Click the headline or text and type the new copy.", "Publish."],
    rootFiles: null,
    sitemap: "GoDaddy creates sitemap.xml automatically.",
    canonical: "GoDaddy adds canonical links automatically.",
    viewport: "GoDaddy sets this.",
    notes: "GoDaddy Website Builder doesn't allow custom code in <head>; structured data and extra tags can't be added there.",
  },
  squareonline: {
    label: "Square Online",
    seo: ["Square Online → Website → Pages → the homepage → Page settings → SEO.", "Paste the title and description, then Publish."],
    social: ["Page settings → Social sharing: upload a 1200×630 image.", "Publish."],
    headCode: ["Website → Settings → SEO / Tracking tools → Header code (where available on your plan).", "Paste the snippet and Publish."],
    alt: ["Click each image → Edit → Alt text.", "Publish."],
    lang: ["Website → Settings → Site language."],
    nav: ["Website → Navigation → add a link with the label below.", "Publish."],
    text: ["Click the text in the editor and type the new copy.", "Publish."],
    rootFiles: null,
    sitemap: "Square Online creates sitemap.xml automatically.",
    canonical: "Square Online adds canonical links automatically.",
    viewport: "Square Online sets this.",
  },
  bigcommerce: {
    label: "BigCommerce",
    seo: ["In BigCommerce admin, go to Settings → Website (search engine optimization section).", "Paste the Home page title and meta description, then Save."],
    social: ["Your theme uses the store logo and homepage text; set a social image in Storefront → Themes → Customize where the theme offers it."],
    headCode: ["Storefront → Script Manager → Create a script.", "Location: Head, pages: All pages, type: Script; paste the snippet → Save."],
    alt: ["Products → edit the product → Images & Videos → each image → Description (alt text) → Save."],
    lang: ["Settings → Store profile → language / Storefront → Localization."],
    nav: ["Storefront → Web Pages → show the page in navigation with the label below."],
    text: ["Storefront → Themes → Customize (Page Builder) → click the text and type the new copy → Publish."],
    rootFiles: null,
    sitemap: "BigCommerce creates sitemap.xml and robots.txt automatically.",
    canonical: "BigCommerce adds canonical links automatically.",
    viewport: "BigCommerce themes set this.",
  },
  jimdo: {
    label: "Jimdo",
    seo: ["Jimdo menu → Settings → SEO (Homepage title and description).", "Save."],
    social: ["Settings → SEO / Social sharing: upload an image.", "Save."],
    headCode: ["Settings → Edit head (Jimdo Creator) or Settings → Code injection.", "Paste the snippet and save."],
    alt: ["Click each image → Edit → Alt text → Save."],
    lang: ["Settings → Language."],
    nav: ["Navigation → Edit → add the page with the label below."],
    text: ["Click the text and type the new copy."],
    rootFiles: null,
    sitemap: "Jimdo creates sitemap.xml automatically.",
    canonical: "Jimdo adds canonical links automatically.",
    viewport: "Jimdo sets this.",
  },
  carrd: {
    label: "Carrd",
    seo: ["Open your site → ⚙ Site settings → Meta: paste the Title and Description.", "Publish."],
    social: ["Site settings → Meta → Share image: upload a 1200×630 image.", "Publish."],
    headCode: ["Add an Embed element → Type: Code, Style: Hidden, Location: Head.", "Paste the snippet and Publish (Pro plan)."],
    alt: ["Click each image element → Alt text.", "Publish."],
    lang: ["Site settings → Language (Pro) or leave as is."],
    nav: ["Add a Links or Buttons element with the label below.", "Publish."],
    text: ["Click the text element and type the new copy.", "Publish."],
    rootFiles: null,
    sitemap: "Carrd sites are single pages; a sitemap isn't needed.",
    canonical: "Carrd adds a canonical link for your domain.",
    viewport: "Carrd sets this.",
  },
  tilda: {
    label: "Tilda",
    seo: ["Page settings → SEO: paste the title and description.", "Publish the page."],
    social: ["Page settings → Facebook card: upload a 1200×630 image and paste the text.", "Publish."],
    headCode: ["Site settings → More → HTML code for the HEAD section.", "Paste the snippet, save and republish all pages."],
    alt: ["Click each image block → Content → Alt text (SEO: alt).", "Publish."],
    lang: ["Site settings → More → Website language."],
    nav: ["Edit your menu block → add an item with the label below.", "Publish."],
    text: ["Click the text in the block and type the new copy.", "Publish."],
    rootFiles: null,
    sitemap: "Tilda creates sitemap.xml and robots.txt automatically.",
    canonical: "Tilda adds canonical links automatically.",
    viewport: "Tilda sets this.",
  },
  drupal: {
    label: "Drupal",
    seo: ["Install and enable the Metatag module.", "Configuration → Search and metadata → Metatag → Front page: paste the title and description → Save."],
    social: ["With Metatag's Open Graph submodule: Front page defaults → Open Graph: paste the title, description and image URL → Save."],
    headCode: ["Use the Metatag or Schema.org Metatag module for structured data, or add the snippet to your theme's html.html.twig before </head>."],
    alt: ["Content → edit the page → each image field → Alternative text → Save."],
    lang: ["Configuration → Regional and language → Languages → default language."],
    nav: ["Structure → Menus → Main navigation → Add link with the label below."],
    text: ["Content → edit the homepage node → change the text → Save."],
    rootFiles: ["Upload llms.txt to your Drupal web root (the folder with index.php)."],
    sitemap: "Use the Simple XML Sitemap module; Drupal ships a robots.txt in the web root.",
    canonical: "Drupal adds canonical links for nodes; Metatag lets you set them for the front page.",
    viewport: "Your theme sets this.",
  },
  joomla: {
    label: "Joomla",
    seo: ["Menus → Main Menu → your Home item → Page Display: Browser Page Title; Metadata tab: Meta Description → Save.", "Site-wide fallback: System → Global Configuration → Site Meta Description."],
    social: ["Use an extension (for example an Open Graph plugin) or add the tags through the template's index.php head."],
    headCode: ["System → Site Templates → your template → index.php: paste the snippet before </head> → Save."],
    alt: ["Edit the article → click each image → Image Description (Alt Text) → Save."],
    lang: ["System → Languages → set the default site language."],
    nav: ["Menus → Main Menu → New → menu item with the label below → Save."],
    text: ["Content → Articles → edit the homepage article → change the text → Save."],
    rootFiles: ["Upload llms.txt to your Joomla root folder (next to configuration.php)."],
    sitemap: "Use a sitemap extension; Joomla ships a robots.txt in the root folder.",
    canonical: "Joomla's SEF settings add canonical links for most pages.",
    viewport: "Your template sets this.",
  },
  magento: {
    label: "Adobe Commerce (Magento)",
    seo: ["Content → Pages → Home Page → Search Engine Optimization: Meta Title and Meta Description → Save."],
    social: ["Most themes take social text from the meta fields; add og: tags through Content → Design → Configuration → HTML Head."],
    headCode: ["Content → Design → Configuration → your store view → HTML Head → Scripts and Style Sheets.", "Paste the snippet → Save Configuration."],
    alt: ["Catalog → Products → each product → Images and Videos → image → Alt Text → Save."],
    lang: ["Stores → Configuration → General → Locale Options → Locale."],
    nav: ["Content → Elements → Widgets or your theme's menu settings → add the link."],
    text: ["Content → Pages → Home Page → Content → change the text → Save."],
    rootFiles: ["Upload llms.txt to the pub/ folder (your web root)."],
    sitemap: "Marketing → SEO & Search → Site Map; robots.txt in Content → Design → Configuration → Search Engine Robots.",
    canonical: "Stores → Configuration → Catalog → Search Engine Optimization → canonical link meta tags: Yes.",
    viewport: "Your theme sets this.",
  },
  prestashop: {
    label: "PrestaShop",
    seo: ["Shop Parameters → Traffic & SEO → SEO & URLs → the 'index' page → Page title and Meta description → Save."],
    social: ["Use a module for Open Graph tags, or your theme's head template."],
    headCode: ["Edit your theme's templates/_partials/head.tpl and paste the snippet before the closing tag, or use a custom-code module."],
    alt: ["Catalog → Products → each product → Images → caption (alt text) → Save."],
    lang: ["International → Localization → default language."],
    nav: ["Design → Link list or Main menu module → add the link."],
    text: ["Design → Theme & Logo / Pages → edit the homepage content."],
    rootFiles: ["Upload llms.txt to your PrestaShop root folder."],
    sitemap: "Use the Google sitemap module; Traffic & SEO generates robots.txt.",
    canonical: "PrestaShop adds canonical links for product and category pages.",
    viewport: "Your theme sets this.",
  },
  bubble: {
    label: "Bubble",
    seo: ["Settings → SEO / metatags: paste the page title and description (per page: the page's Property editor → Page title / Description)."],
    social: ["Settings → SEO / metatags → Social image (og:image)."],
    headCode: ["Settings → SEO / metatags → Script/meta tags in header.", "Paste the snippet and deploy to Live."],
    alt: ["Select each image element → Property editor → Alt text (or 'Image description')."],
    lang: ["Settings → General → app language."],
    nav: ["Add a Link or Button element with the label below."],
    text: ["Edit the text element and type the new copy; deploy to Live."],
    rootFiles: null,
    sitemap: "Settings → SEO / metatags → expose a sitemap file; robots.txt is edited there too.",
    canonical: "Bubble adds canonical links for your domain.",
    viewport: "Bubble sets this for responsive pages.",
  },
};

/** Code sites not connected to GitHub, and static site generators. */
const TEMPLATES: Omit<Playbook, "id" | "label"> = {
  seo: ["Open the file that holds your homepage's <head> (index.html, a layout, or a head partial such as layouts/partials/head.html or _includes/head.html).", "Set the <title> and <meta name=\"description\"> to the values below.", "Deploy."],
  social: ["In the same <head>, paste the social tags below.", "Deploy."],
  headCode: ["Paste the snippet into the shared <head> template (layout or head partial), just before </head>.", "Deploy."],
  alt: ["Add alt=\"…\" to each <img> listed below, in your templates or content files.", "Deploy."],
  lang: ["Set the lang attribute on <html> in your base layout (Hugo: languageCode in hugo.toml; Jekyll: lang in _config.yml if your theme reads it)."],
  nav: ["Add a link with the label below to your navigation template or menu config.", "Deploy."],
  text: ["Change the headline and text in your homepage template or content file.", "Deploy."],
  rootFiles: ["Put the file in the folder your site serves as the root (public/, static/ or the repository root).", "Deploy."],
  sitemap: "Most generators can create sitemap.xml (Hugo builds one by default; Jekyll: jekyll-sitemap; Eleventy: a sitemap template).",
  canonical: "Add <link rel=\"canonical\" href=\"…\"> per page in your base layout using the page's URL variable.",
  viewport: "Add <meta name=\"viewport\" content=\"width=device-width, initial-scale=1\"> to your base layout.",
};

const TEMPLATE_IDS = new Set(["hugo", "jekyll", "eleventy", "gatsby", "static", "nextjs-app", "nextjs-pages", "astro", "nuxt", "sveltekit", "angular", "vue", "vite-react", "unknown"]);

/** The playbook for a platform id from the free scan (falls back to generic steps). */
export function playbookFor(platformId: string | null | undefined, opts: { wordpressPlugin?: "yoast" | "rankmath" | "aioseo" | "none" } = {}): Playbook {
  const id = (platformId ?? "").toLowerCase();
  if (id === "wordpress") return wordpressPlaybook(opts.wordpressPlugin ?? "none");
  const known = PLAYBOOKS[id];
  if (known) return { id, ...known };
  if (TEMPLATE_IDS.has(id)) return { id, label: id === "unknown" ? "Your site" : id, ...TEMPLATES };
  return { id: id || "other", label: "Your platform", ...BASE };
}

/** Which WordPress SEO plugin the live HTML shows (Yoast / Rank Math / AIOSEO markers). */
export function detectWordpressSeoPlugin(html: string): "yoast" | "rankmath" | "aioseo" | "none" {
  const low = html.slice(0, 400_000).toLowerCase();
  if (/yoast seo|yoast-schema-graph/.test(low)) return "yoast";
  if (/rank math|rank-math-schema/.test(low)) return "rankmath";
  if (/all in one seo|aioseo/.test(low)) return "aioseo";
  return "none";
}

export const PLAYBOOKS_CHECKED = "2026-10";
export const GUIDED_PLATFORM_IDS = ["wordpress", ...Object.keys(PLAYBOOKS)];
