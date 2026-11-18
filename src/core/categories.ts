import { normalizeText } from './matching.ts';

/**
 * Rayons communes à toutes les enseignes (« Lait », « Café »…), pour
 * parcourir et comparer tous les produits d'un même type, toutes marques et
 * enseignes confondues, au prix au litre / kilo / pièce.
 *
 * Attribution, dans l'ordre :
 * 1. la catégorie de l'enseigne (Aldi : `mainCategoryID` ; Delhaize : chemin
 *    de l'URL `/fr/shop/<rayon>/<sous-rayon>/<type>/…`), préfixe le plus long ;
 * 2. à défaut, des mots-clés en début de nom (`names`).
 * Puis le type (« Entier », « Demi-écrémé »…) : première règle qui correspond
 * au nom (texte normalisé : minuscules, sans accents).
 */

export interface ProductType {
  id: string;
  label: string;
  match: RegExp;
}

export interface Category {
  id: string;
  label: string;
  /** Valeurs `mainCategoryID` d'Aldi. */
  aldi?: string[];
  /** Préfixes du chemin Delhaize après /fr/shop/ (ex. « Cremerie-fromage-et-alternatives-vegetales/Lait »). */
  delhaize?: string[];
  /** Repli sur le nom normalisé (produits sans catégorie d'enseigne). */
  names?: RegExp;
  /** Types, du plus spécifique au plus général (ordre de détection). */
  types?: ProductType[];
  /** Ordre d'affichage des types, s'il diffère de l'ordre de détection. */
  typeOrder?: string[];
}

const CREMERIE = 'Cremerie-fromage-et-alternatives-vegetales';
const BOISSONS = 'Boissons-froides-et-chaudes';
const VIANDES = 'Viandes-poissons-et-produits-vegetariens';

export const CATEGORIES: Category[] = [
  {
    id: 'lait',
    label: 'Lait et boissons végétales',
    aldi: ['melk'],
    delhaize: [`${CREMERIE}/Lait`, `${CREMERIE}/Boissons-vegetales`],
    names: /^lait\b(?!.*\bcoco\b)|\blait (entier|demi|ecreme|battu)/,
    types: [
      { id: 'croissance', label: 'Lait infantile', match: /croissance|de suite|optipro|nan\b/ },
      { id: 'cafe', label: 'Concentré et pour café', match: /concentr|condense|pour (le )?cafe|godet|instantan|creme de cafe/ },
      { id: 'vegetal', label: 'Boissons végétales', match: /soja|soya|avoine|amande|noisette|\bcoco\b|\briz\b|vegetal|\bm lk\b|no milk|barista/ },
      { id: 'aromatise', label: 'Chocolaté et aromatisé', match: /chocol|choco\b|fraise|vanille|banane|fruits|aromat|milkshake|machiato|proteine|skyr a boire/ },
      { id: 'battu', label: 'Lait battu, ayran', match: /battu|ayran/ },
      { id: 'sans-lactose', label: 'Sans lactose', match: /sans lactose|lactose free/ },
      { id: 'demi', label: 'Demi-écrémé', match: /demi.?ecreme|1[.,]5\s*%?\s*m\.?\s*g/ },
      { id: 'ecreme', label: 'Écrémé', match: /ecreme/ },
      { id: 'entier', label: 'Entier', match: /entier|\b3[.,]5\b/ },
    ],
    typeOrder: ['entier', 'demi', 'ecreme', 'sans-lactose', 'vegetal', 'aromatise', 'battu', 'cafe', 'croissance'],
  },
  {
    id: 'oeufs',
    label: 'Œufs',
    aldi: ['eieren'],
    delhaize: [`${CREMERIE}/Oeufs`],
    names: /^(oe|œ)ufs?\b/,
    types: [
      { id: 'bio', label: 'Bio', match: /\bbio\b/ },
      { id: 'plein-air', label: 'Plein air', match: /plein air|libre|free range/ },
      { id: 'sol', label: 'Poules au sol', match: /\bsol\b/ },
    ],
  },
  {
    id: 'beurre',
    label: 'Beurre, margarine et crème',
    aldi: ['boter-margarine-room'],
    delhaize: [`${CREMERIE}/Beurres-et-margarines`, `${CREMERIE}/Cremes-et-alternatives`],
    names: /^beurre\b(?!.*cacahu)/,
    types: [
      { id: 'creme', label: 'Crème', match: /creme|room/ },
      { id: 'margarine', label: 'Margarine et à tartiner', match: /margarine|minarine|vegetal|tartiner|cuisson|cuire|frire|becel|solo|vitelma|alpro/ },
      { id: 'beurre', label: 'Beurre', match: /beurre/ },
    ],
    typeOrder: ['beurre', 'margarine', 'creme'],
  },
  {
    id: 'yaourts',
    label: 'Yaourts et desserts lactés',
    aldi: ['yoghurt', 'desserts'],
    delhaize: [`${CREMERIE}/Yaourts-et-alternatives-vegetales`, `${CREMERIE}/Desserts`],
    names: /^(yaourt|yoghourt|skyr|fromage blanc|mousse|riz au lait)\b/,
    types: [
      { id: 'desserts', label: 'Desserts', match: /dessert|mousse|pudding|riz au lait|flan|tiramisu|panna|liegeois|creme (au|a la|dessert|vanille|chocolat|caramel)/ },
      { id: 'grec', label: 'Grec, skyr, fromage blanc', match: /grec|skyr|fromage blanc|platte kaas|quark/ },
      { id: 'boire', label: 'À boire', match: /a boire|actimel|drink/ },
      { id: 'vegetal', label: 'Végétal', match: /soja|soya|avoine|coco|vegetal|alpro/ },
      { id: 'nature', label: 'Nature', match: /nature/ },
      { id: 'fruits', label: 'Aux fruits et aromatisés', match: /./ },
    ],
    typeOrder: ['nature', 'fruits', 'grec', 'boire', 'vegetal', 'desserts'],
  },
  {
    id: 'fromage',
    label: 'Fromages',
    aldi: ['kaas'],
    delhaize: [`${CREMERIE}/Fromages`],
    names: /^(fromage|emmental|gouda|mozzarella|grana|parmigiano|parmesan|brie|camembert|cheddar|feta|mascarpone|ricotta|pecorino|gorgonzola|comte|raclette|copeaux de parmigiano|batonnets de gouda)\b/,
    types: [
      { id: 'rape', label: 'Râpé', match: /rape/ },
      { id: 'tranches', label: 'En tranches', match: /tranche/ },
      { id: 'tartiner', label: 'À tartiner et frais', match: /tartiner|frais|mascarpone|ricotta|cottage/ },
      { id: 'mozzarella', label: 'Mozzarella, feta…', match: /mozzarella|feta|burrata|halloumi/ },
    ],
  },
  {
    id: 'pain',
    label: 'Pain, viennoiseries, biscottes',
    aldi: ['brood', 'broodjes-sandwiches-afbakbrood', 'koffiekoeken-gebak', 'beschuiten-toast-crackers'],
    delhaize: ['Boulangerie-et-patisserie', 'Epicerie-sucree/Galettes-de-riz-biscottes-et-pains-grilles'],
    names: /^(pain|baguette|croissant|pistolet|cramique|sandwich)\b/,
  },
  {
    id: 'petit-dej',
    label: 'Céréales, confitures, pâtes à tartiner',
    aldi: ['ontbijtgranen', 'broodbeleg'],
    delhaize: ['Epicerie-sucree/Petit-dejeuner'],
    names: /^(cereales|muesli|confiture|pate a tartiner|miel|choco)\b/,
  },
  {
    id: 'cafe',
    label: 'Café et thé',
    aldi: ['koffie', 'thee-cacao'],
    delhaize: [`${BOISSONS}/Cafe`, `${BOISSONS}/Thes`],
    names: /^(cafe|caffe|the|infusion)\b/,
    types: [
      { id: 'capsules', label: 'Capsules et dosettes', match: /capsule|dosette|\bpads?\b|compatible|nespresso|senseo|dolce gusto|tassimo/ },
      { id: 'soluble', label: 'Soluble', match: /soluble|instant|3 en 1|cappuccino|latte/ },
      { id: 'grains', label: 'En grains', match: /grain/ },
      { id: 'the', label: 'Thé, infusions, cacao', match: /\bthe\b|infusion|tisane|rooibos|camomille|cacao|nesquik|breakfast|earl grey|chocolat/ },
      { id: 'moulu', label: 'Moulu', match: /moulu|cafe|espresso|dessert|arabica|deca|moka|filters?|classic/ },
    ],
    typeOrder: ['moulu', 'grains', 'capsules', 'soluble', 'the'],
  },
  {
    id: 'pates-riz',
    label: 'Pâtes, riz et féculents',
    aldi: ['pasta-noedels', 'rijst-couscous'],
    delhaize: ['Epicerie-salee/Pates-riz-et-autres-feculents'],
    names: /^(spaghetti|spaghettis|penne|fusilli|pates|macaroni|tagliatelle|farfalle|lasagne|riz|couscous|quinoa|nouilles)\b/,
    types: [
      { id: 'riz', label: 'Riz', match: /\briz\b|basmati|risotto|arborio/ },
      { id: 'semoule', label: 'Couscous, quinoa, semoule', match: /couscous|quinoa|semoule|boulgour|lentille/ },
      { id: 'nouilles', label: 'Nouilles', match: /nouille|noodle|ramen|udon/ },
      { id: 'pates', label: 'Pâtes', match: /./ },
    ],
    typeOrder: ['pates', 'riz', 'semoule', 'nouilles'],
  },
  {
    id: 'farine-sucre',
    label: 'Farine, sucre et pâtisserie',
    aldi: ['zelf-bakken'],
    delhaize: ['Epicerie-sucree/Preparations-desserts'],
    names: /^(farine|sucre|levure|cassonade)\b/,
    types: [
      { id: 'farine', label: 'Farine', match: /farine/ },
      { id: 'sucre', label: 'Sucre', match: /sucre|cassonade|edulcorant|stevia/ },
    ],
  },
  {
    id: 'huiles-sauces',
    label: 'Huiles, vinaigres et sauces',
    aldi: ['olie-vetten', 'sauzen-vinaigrettes-azijn'],
    delhaize: ['Epicerie-salee/Huiles-et-vinaigres', 'Epicerie-salee/Sauces', 'Epicerie-salee/Condiments'],
    names: /^(huile|vinaigre|mayonnaise|ketchup|moutarde|sauce)\b/,
    types: [
      { id: 'olive', label: "Huile d'olive", match: /huile.*olive|olive.*huile/ },
      { id: 'huile', label: 'Autres huiles', match: /huile/ },
      { id: 'vinaigre', label: 'Vinaigre et vinaigrette', match: /vinaigr/ },
      { id: 'mayo', label: 'Mayonnaise, ketchup, moutarde', match: /mayo|ketchup|moutarde|andalouse|samourai|cocktail|tartare|americaine/ },
    ],
  },
  {
    id: 'epicerie',
    label: 'Épices, soupes, cuisine du monde',
    aldi: ['kruiden-smaakversterkers', 'soepen'],
    delhaize: ['Epicerie-salee/Epices', 'Epicerie-salee/Aides-culinaires', 'Epicerie-salee/Soupes', 'Epicerie-salee/Cuisine-du-monde'],
    names: /^(soupe|bouillon|sel|poivre)\b/,
  },
  { id: 'conserves', label: 'Conserves', aldi: ['conserven'], delhaize: ['Conserves'] },
  {
    id: 'biscuits',
    label: 'Biscuits et gâteaux',
    aldi: ['koeken'],
    delhaize: ['Epicerie-sucree/Biscuits'],
    names: /^(biscuits?|gaufres?|speculoos|cookies?|madeleines?|gateau)\b/,
  },
  {
    id: 'chocolat',
    label: 'Chocolat et confiserie',
    aldi: ['chocolade', 'snoep-kauwgom-muntjes'],
    delhaize: ['Epicerie-sucree/Chocolats', 'Epicerie-sucree/Confiserie', 'Epicerie-sucree/Barre'],
    names: /^(chocolat|pralines?|bonbons?)\b/,
  },
  {
    id: 'aperitif',
    label: 'Chips, noix et apéritif',
    aldi: ['chips-aperitiefsnacks', 'tapas-dips', 'noten-gedroogd-fruit', 'aperitiefhapjes-eoy'],
    delhaize: ['Epicerie-salee/Chips-et-snacks-aperitif', 'Epicerie-salee/Noix-et-fruits-secs', 'Apero-et-entrees'],
    names: /^(chips|cacahu|noix|amandes|pistaches)\b/,
  },
  {
    id: 'viande',
    label: 'Viande et volaille',
    aldi: ['varkensvlees', 'rundsvlees', 'gevogelte', 'wild'],
    delhaize: [`${VIANDES}/Viande-fraiche`, `${VIANDES}/Volaille`, `${VIANDES}/Lapin`, `${VIANDES}/Preparations`],
    names: /\b(poulet|porc|boeuf|steak|escalope|hache|hachis|chipolatas?|saucisses?|brochettes?|chateaubriand|sanglier|agneau|faon|pierrade|foie gras|aiguillettes|lamelles de poulet|vol au vent)\b/,
  },
  {
    id: 'charcuterie',
    label: 'Charcuterie',
    aldi: ['charcuterie'],
    delhaize: [`${VIANDES}/Charcuterie`, `${VIANDES}/Salades-a-tartiner`],
    names: /^(jambon|salami|filet americain|pate|saucisson|lardons|boudin)\b/,
  },
  {
    id: 'poisson',
    label: 'Poisson et fruits de mer',
    aldi: ['vis', 'zeevruchten'],
    delhaize: [`${VIANDES}/Poissonnerie`, 'Conserves/Poissons-en-conserve', 'Surgeles/Viandes-et-poissons'],
    names: /^(saumon|thon|cabillaud|crevettes|scampis|moules|filet de poisson)\b/,
  },
  {
    id: 'vegetarien',
    label: 'Végétarien et vegan',
    aldi: ['vegan'],
    delhaize: [`${VIANDES}/Vegetarien`, 'Regime-specifique/Vegan', 'Surgeles/Vegetarien'],
    names: /\b(vegetarien|vegan)\b/,
  },
  {
    id: 'plats',
    label: 'Plats préparés',
    aldi: ['kant-en-klare-maaltijden', 'salades-pastasalades'],
    delhaize: ['Vite-et-vraiment-bon', 'Conserves/Plats-prepares-en-conserve'],
  },
  {
    id: 'fruits-legumes',
    label: 'Fruits et légumes',
    aldi: ['groenten', 'fruit', 'aardappelen'],
    delhaize: ['Fruits-et-legumes-frais/Legumes', 'Fruits-et-legumes-frais/Fruits', 'Fruits-et-legumes-frais/Boites-repas'],
    names: /^(pommes de terre|bananes?|pommes|oranges?|tomates?|carottes?|oignons?|poireaux|salade|concombres?)\b/,
  },
  {
    id: 'surgeles',
    label: 'Surgelés et glaces',
    aldi: ['diepvries-pizza-maaltijden-snacks', 'diepvries-groenten-fruit', 'frietjes-aardappelproducten', 'ijs'],
    delhaize: ['Surgeles'],
    names: /^(glace|frites|pizza)\b/,
  },
  {
    id: 'eau',
    label: 'Eaux',
    aldi: ['water'],
    delhaize: [`${BOISSONS}/Eaux`],
    names: /^eau\b/,
    types: [
      { id: 'aromatisee', label: 'Aromatisée', match: /citron|fruit|peche|menthe|aromat|saveur|gout/ },
      { id: 'petillante', label: 'Pétillante', match: /petillante|gazeuse|sparkling|bruisend|perrier|san pellegrino/ },
      { id: 'plate', label: 'Plate', match: /./ },
    ],
    typeOrder: ['plate', 'petillante', 'aromatisee'],
  },
  {
    id: 'jus',
    label: 'Jus et smoothies',
    aldi: ['sappen-smoothies'],
    delhaize: [`${BOISSONS}/Jus-de-fruits`, 'Fruits-et-legumes-frais/Jus-frais-et-smoothies'],
    names: /^(jus|smoothie|nectar)\b/,
    types: [
      { id: 'orange', label: "Jus d'orange", match: /orange/ },
      { id: 'pomme', label: 'Jus de pomme', match: /pomme/ },
      { id: 'smoothie', label: 'Smoothies', match: /smoothie/ },
    ],
  },
  {
    id: 'sodas',
    label: 'Sodas, thés glacés, sirops',
    aldi: ['frisdrank', 'energy-drinks-sportdrank'],
    delhaize: [`${BOISSONS}/Sodas`, `${BOISSONS}/Sirops`, `${CREMERIE}/Cafe-glace-and-autres`],
    names: /^(iced? tea|ice tea|fuze tea|coca cola|cola|pepsi|fanta|sprite|schweppes|ginger ale|tonic|limonade|soda|sirop)\b/,
    types: [
      { id: 'cola', label: 'Cola', match: /cola/ },
      { id: 'the-glace', label: 'Thé glacé', match: /ice.?tea|iced tea|the glace/ },
      { id: 'sirop', label: 'Sirops', match: /sirop/ },
      { id: 'energy', label: 'Énergisantes et sport', match: /energy|sport|isoton/ },
    ],
  },
  {
    id: 'alcool',
    label: 'Bières, vins et alcools',
    aldi: ['bier', 'rode-wijn', 'witte-wijn', 'rose-wijn', 'bubbels', 'sterke-dranken'],
    names: /^(biere|vin|champagne|cava|prosecco)\b/,
    types: [
      { id: 'biere', label: 'Bières', match: /biere|pils|blonde|brune|triple|tripel|ipa|lager|bier/ },
      { id: 'bulles', label: 'Bulles', match: /champagne|cava|prosecco|cremant|mousseux/ },
      { id: 'vin', label: 'Vins', match: /vin|bordeaux|merlot|cabernet|chardonnay|sauvignon|rose|rouge|blanc|aoc|aop|igp/ },
    ],
  },
  { id: 'bebe', label: 'Bébé', aldi: ['baby'] },
  {
    id: 'animaux',
    label: 'Animaux',
    aldi: ['kat', 'hond'],
    names: /\b(chats?|chiens?|oiseaux|ramasse crottes|litiere)\b/,
  },
  {
    id: 'entretien',
    label: 'Entretien et papier',
    aldi: [
      'schoonmaakmiddelen-schoonmaakartikelen',
      'wasmiddelen-wasverzachters',
      'afwassen-vaatwasmiddelen',
      'folie-huishoudzakken',
      'zakdoekjes-toiletpapier-keukenpapier',
      'batterijen-aanmaakblokjes',
    ],
    names: /^(mouchoirs|papier toilette|essuie tout|lessive|sacs? poubelle|liquide vaisselle)\b/,
  },
  {
    id: 'hygiene',
    label: 'Hygiène et beauté',
    aldi: ['lichaamsverzorging', 'haarproducten', 'tandverzorging', 'intieme-hygiene', 'gezichtsverzorging', 'verzorging-winter'],
    names: /^(shampooing|gel douche|dentifrice|deodorant|savon)\b/,
  },
];

const BY_ID = new Map(CATEGORIES.map((c) => [c.id, c]));
const ALDI = new Map<string, string>();
const DELHAIZE: Array<[string, string]> = [];
for (const c of CATEGORIES) {
  for (const a of c.aldi ?? []) ALDI.set(a, c.id);
  for (const d of c.delhaize ?? []) DELHAIZE.push([d, c.id]);
}
DELHAIZE.sort((a, b) => b[0].length - a[0].length); // le préfixe le plus long l'emporte

export function categoryById(id: string): Category | undefined {
  return BY_ID.get(id);
}

/** Chemin de rayon Delhaize : « Rayon/Sous-rayon/Type » (sans le nom ni le code produit). */
export function delhaizePath(url: string): string | undefined {
  const m = /\/fr\/shop\/(.+)\/p\/[A-Z0-9]+/.exec(url);
  if (!m) return undefined;
  const parts = m[1]!.split('/');
  return parts.slice(0, -1).join('/'); // dernier segment = nom du produit
}

export interface Categorized {
  category?: string;
  type?: string;
}

export interface CategorizeInput {
  chainId: string;
  name: string;
  sourceUrl: string;
  /** Catégorie fournie par l'enseigne (Aldi : mainCategoryID). */
  category?: string;
}

function fromSource(o: CategorizeInput): string | undefined {
  if (o.chainId === 'aldi' && o.category) return ALDI.get(o.category);
  if (o.chainId === 'delhaize') {
    const path = delhaizePath(o.sourceUrl);
    if (!path) return undefined;
    for (const [prefix, id] of DELHAIZE) if (path.startsWith(prefix)) return id;
  }
  return undefined;
}

/** Nom normalisé (« Œufs » → « oeufs »). */
function norm(name: string): string {
  return normalizeText(name.replace(/œ/gi, 'oe').replace(/æ/gi, 'ae'));
}

// Repli par le nom : non alimentaire d'abord (« Aliment pour chats au poulet » → Animaux).
const NON_FOOD = new Set(['animaux', 'bebe', 'entretien', 'hygiene']);
const FALLBACK = [...CATEGORIES.filter((c) => NON_FOOD.has(c.id)), ...CATEGORIES.filter((c) => !NON_FOOD.has(c.id))];

export function categorize(o: CategorizeInput): Categorized {
  const name = norm(o.name);
  let id = fromSource(o);
  if (!id) id = FALLBACK.find((c) => c.names?.test(name))?.id;
  if (!id) return {};
  const type = BY_ID.get(id)!.types?.find((t) => t.match.test(name))?.id;
  return type ? { category: id, type } : { category: id };
}

export function isBio(name: string): boolean {
  return /\bbio\b/.test(norm(name));
}
