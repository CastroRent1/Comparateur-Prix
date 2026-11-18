import { DISCLAIMER, freshnessWarning, isPromoActive, observationLabel } from '../core/freshness.ts';
import { formatEuro, formatUnitPrice, unitPrice } from '../core/units.ts';
import type { StoreBasket } from '../core/basket.ts';
import { Catalog, loadCatalog } from './catalog.ts';
import { compare, type Comparison, type ListItem, type Place } from './plan.ts';
import { browse, categoryFacets, type BrowseFilter, type BrowseRow } from './browse.ts';

/**
 * Appli Panier Malin : recherche → liste → magasins les moins chers.
 * Tout reste sur l'appareil (localStorage) : aucune donnée envoyée.
 */

// ---------------------------------------------------------------- état local

const STORE_KEY = 'panier-malin:v1';

interface Saved {
  items: ListItem[];
  place: Place | null;
  radiusKm: number;
}

function loadSaved(): Saved {
  try {
    const raw = localStorage.getItem(STORE_KEY);
    if (raw) {
      const s = JSON.parse(raw) as Partial<Saved>;
      return { items: Array.isArray(s.items) ? s.items : [], place: s.place ?? null, radiusKm: s.radiusKm ?? 5 };
    }
  } catch {
    // stockage indisponible (navigation privée…) : l'appli fonctionne sans
  }
  return { items: [], place: null, radiusKm: 5 };
}

function save(): void {
  try {
    localStorage.setItem(STORE_KEY, JSON.stringify(state));
  } catch {
    // idem
  }
}

const state: Saved = loadSaved();
let cat: Catalog;

// ------------------------------------------------------------------- outils

const $ = <T extends HTMLElement>(sel: string) => document.querySelector(sel) as T;

function esc(s: string | number | undefined | null): string {
  return String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
}

const km = (d: number | undefined) =>
  d === undefined ? '' : d < 1 ? `${Math.round(d * 1000)} m` : `${d.toLocaleString('fr-BE', { maximumFractionDigits: 1 })} km`;

/** « 6 x 1l » → « 6 × 1 l » ; « 500g » → « 500 g ». */
function prettySize(text: string): string {
  return text
    .replace(/\s*x\s*/gi, ' × ')
    .replace(/(\d)\s*(kg|g|gr|l|cl|ml|dl)\b/gi, (_m, d: string, u: string) => `${d} ${u.toLowerCase()}`)
    .replace(/(\d)\.(\d)/g, '$1,$2')
    .trim();
}

function sizeLabel(i: number): string {
  const p = cat.products[i]!;
  if (p.st) return prettySize(p.st);
  if (!p.s) return '';
  const [raw, u] = p.s;
  // 5,993 l (6 × 1 l relevés au prix unitaire) → 6 l
  const a = Math.abs(raw - Math.round(raw)) / raw < 0.01 && raw >= 1 ? Math.round(raw) : raw;
  if (u === 'piece') return `${a} pièce${a > 1 ? 's' : ''}`;
  if (a < 1) return u === 'kg' ? `${Math.round(a * 1000)} g` : `${Math.round(a * 100)} cl`;
  return `${a.toLocaleString('fr-BE')} ${u === 'kg' ? 'kg' : 'l'}`;
}

function priceHtml(i: number, now: Date): string {
  const o = cat.toOffer(i);
  const promo = o.promo && isPromoActive(o.promo, now) && !o.promo.requiresCard ? o.promo : undefined;
  const shown = promo ? promo.price : o.price;
  if (shown === undefined) return '<span class="muted">prix inconnu</span>';
  const up = o.size ? unitPrice(shown, o.size) : undefined;
  return `<span class="price">${formatEuro(shown)}</span>${
    promo && o.price ? ` <s class="muted">${formatEuro(o.price)}</s> <span class="badge promo">${esc(promo.label ?? 'Promo')}</span>` : ''
  }${up !== undefined && o.size ? `<span class="unit muted">${formatUnitPrice(up, o.size.unit)}</span>` : ''}`;
}

/** « Prix relevé sur aldi.be le 18/11 à 9 h · voir » (règle de fraîcheur du projet). */
function observedHtml(i: number): string {
  const o = cat.toOffer(i);
  return `<span class="muted small obs">${esc(observationLabel(o, cat.chainOf(i)))} · <a href="${esc(o.sourceUrl)}" target="_blank" rel="noopener">voir</a></span>`;
}

const chainBadge = (chainId: string) => {
  const c = cat.chains.find((x) => x.id === chainId);
  return `<span class="chain chain-${esc(chainId)}">${esc(c?.name ?? chainId)}</span>`;
};

// ---------------------------------------------------------------- recherche

function renderSearch(): void {
  const q = $<HTMLInputElement>('#q').value;
  const box = $('#results');
  if (q.trim().length < 2) {
    box.innerHTML = '';
    return;
  }
  const hits = cat.search(q, 30);
  const now = new Date();
  box.innerHTML = hits.length
    ? hits
        .map((i) => {
          const p = cat.products[i]!;
          const inList = state.items.some((it) => it.key === cat.keyOf(i));
          return `<li class="hit">
            <div class="hit-main">
              ${chainBadge(cat.chainOf(i).id)}
              <span class="name">${esc(p.n)}</span>
              <span class="muted small">${esc([p.b, sizeLabel(i)].filter(Boolean).join(' · '))}</span>
              <span class="prices">${priceHtml(i, now)}</span>
              ${observedHtml(i)}
            </div>
            <button class="add" data-add="${esc(cat.keyOf(i))}" ${inList ? 'disabled' : ''} aria-label="Ajouter ${esc(p.n)} à la liste">${inList ? 'Ajouté' : '+ Ajouter'}</button>
          </li>`;
        })
        .join('')
    : `<li class="empty">Aucun produit trouvé pour « ${esc(q)} ».</li>`;
}

// ------------------------------------------------------------------- rayons

let rayon: (BrowseFilter & { limit: number }) | null = null;
const PAGE = 40;
const PER_UNIT: Record<string, string> = { kg: 'le kilo', l: 'le litre', piece: 'la pièce' };
const SORTED_BY: Record<string, string> = { kg: 'au kilo', l: 'au litre', piece: 'à la pièce' };

function renderRayons(): void {
  $('#rayons').innerHTML = categoryFacets(cat)
    .map(
      (f) =>
        `<button class="chip ${rayon?.category === f.id ? 'on' : ''}" data-rayon="${esc(f.id)}" aria-pressed="${rayon?.category === f.id}">${esc(f.label)}</button>`,
    )
    .join('');
}

function browseRow(r: BrowseRow): string {
  const i = r.index;
  const p = cat.products[i]!;
  const key = cat.keyOf(i);
  const inList = state.items.some((it) => it.key === key);
  const regular = p.p;
  return `<li class="hit row-rayon ${r.freshness === 'stale' ? 'stale' : ''}">
    <div class="hit-main">
      ${chainBadge(cat.chainOf(i).id)}
      <span class="name">${esc(p.n)}</span>
      <span class="small"><strong class="fmt">${esc(sizeLabel(i) || 'format inconnu')}</strong>${p.b ? ` <span class="muted">· ${esc(p.b)}</span>` : ''}</span>
      <span class="prices"><span class="price">${formatEuro(r.price)}</span>${
        r.isPromo && regular ? ` <s class="muted">${formatEuro(regular)}</s> <span class="badge promo">${esc(p.pr?.l ?? 'Promo')}</span>` : ''
      }</span>
      ${observedHtml(i)}${r.freshness === 'stale' ? ' <span class="warn-text small">⚠ relevé il y a plus de 48 h</span>' : ''}
    </div>
    <div class="per-unit">${
      r.unitPrice !== undefined && r.unit ? `<strong>${formatEuro(r.unitPrice)}</strong><span class="muted small">${PER_UNIT[r.unit]}</span>` : ''
    }</div>
    <button class="add" data-add="${esc(key)}" ${inList ? 'disabled' : ''} aria-label="Ajouter ${esc(p.n)} à la liste">${
      inList ? '✓<span class="add-label"> Ajouté</span>' : '+<span class="add-label"> Ajouter</span>'
    }</button>
  </li>`;
}

function renderBrowse(): void {
  const box = $('#browse');
  if (!rayon || $<HTMLInputElement>('#q').value.trim().length >= 2) {
    box.innerHTML = '';
    return;
  }
  const r = browse(cat, rayon, new Date());
  const chip = (attr: string, value: string, label: string, on: boolean) =>
    `<button class="chip small ${on ? 'on' : ''}" ${attr}="${esc(value)}" aria-pressed="${on}">${label}</button>`;
  const types = r.types.length
    ? `<div class="facets" role="group" aria-label="Type">${chip('data-type', '', 'Tous', !rayon.type)}${r.types
        .map((t) => chip('data-type', t.id, `${esc(t.label)} <span class="count">${t.count}</span>`, rayon!.type === t.id))
        .join('')}</div>`
    : '';
  const chains = `<div class="facets" role="group" aria-label="Enseigne">${chip('data-chain-filter', '', 'Toutes enseignes', !rayon.chain)}${r.chains
    .map((c) => chip('data-chain-filter', c.id, `${esc(c.label)} <span class="count">${c.count}</span>`, rayon!.chain === c.id))
    .join('')}${r.bioCount || rayon.bio ? chip('data-bio', rayon.bio ? '0' : '1', `Bio <span class="count">${r.bioCount}</span>`, !!rayon.bio) : ''}</div>`;
  const rows = r.rows.slice(0, rayon.limit).map(browseRow).join('');
  const more = r.rows.length > rayon.limit ? `<p><button class="link" data-more>Afficher ${Math.min(PAGE, r.rows.length - rayon.limit)} produits de plus (sur ${r.rows.length})</button></p>` : '';
  box.innerHTML = `<div class="browse-head">
      <div><strong>${esc(r.label)}</strong>
      <span class="muted small">${r.rows.length} produit${r.rows.length > 1 ? 's' : ''}${r.mainUnit ? ` · du moins cher au plus cher ${SORTED_BY[r.mainUnit]}` : ''}</span></div>
      <button class="link small" data-rayon="" aria-label="Fermer le rayon">Fermer</button>
    </div>
    ${types}${chains}
    ${r.rows.length ? `<ul class="hits browse-list">${rows}</ul>${more}` : '<p class="empty">Aucun produit avec ces filtres.</p>'}
    <p class="muted small">Prix d'aujourd'hui, promotions en cours comprises. Le format est celui de l'emballage vendu ; le prix au litre ou au kilo permet de comparer les formats différents.</p>`;
}

function setRayon(next: (BrowseFilter & { limit: number }) | null): void {
  rayon = next;
  renderRayons();
  renderBrowse();
}

function addItem(key: string): void {
  if (!state.items.some((i) => i.key === key)) state.items.push({ key, qty: 1 });
  save();
  renderSearch();
  renderBrowse();
  renderAll();
}

// -------------------------------------------------------------------- liste

function renderList(cmp: Comparison): void {
  const box = $('#list');
  $('#list-count').textContent = state.items.length ? `(${state.items.length})` : '';
  if (state.items.length === 0) {
    box.innerHTML = '<p class="empty">Votre liste est vide. Cherchez un produit ci-dessus et ajoutez-le.</p>';
    return;
  }
  const now = new Date();
  const lines = cmp.lines
    .map((l) => {
      const p = cat.products[l.baseIndex]!;
      const baseChain = cat.chainOf(l.baseIndex).id;
      const eq = [...l.options.entries()]
        .map(([chainId, opts]) => {
          const chosen = l.chosen.get(chainId);
          const options = opts
            .map((o) => `<option value="${esc(cat.keyOf(o.index))}" ${o.index === chosen ? 'selected' : ''}>${esc(cat.products[o.index]!.n)} — ${esc(sizeLabel(o.index))}</option>`)
            .join('');
          return `<label class="eq">${chainBadge(chainId)}
            <select data-pick="${esc(l.item.key)}" data-chain="${esc(chainId)}" aria-label="Équivalent chez ${esc(chainId)}">
              ${options}<option value="" ${chosen === undefined ? 'selected' : ''}>Aucun équivalent</option>
            </select></label>`;
        })
        .join('');
      const missingChains = cat.chains
        .filter((c) => c.coverage === 'full' && c.id !== baseChain && !l.options.has(c.id))
        .map((c) => `<span class="eq-missing">${chainBadge(c.id)} <span class="muted small">pas d'équivalent trouvé</span></span>`)
        .join('');
      return `<li class="line">
        <div class="line-head">
          <div>
            ${chainBadge(baseChain)} <strong>${esc(p.n)}</strong>
            <span class="muted small">${esc(sizeLabel(l.baseIndex))}</span>
            <div class="prices">${priceHtml(l.baseIndex, now)}</div>
          </div>
          <div class="qty" role="group" aria-label="Quantité">
            <button data-qty="${esc(l.item.key)}" data-delta="-1" aria-label="Moins">−</button>
            <span>${l.item.qty}</span>
            <button data-qty="${esc(l.item.key)}" data-delta="1" aria-label="Plus">+</button>
            <button class="remove" data-remove="${esc(l.item.key)}" aria-label="Retirer">✕</button>
          </div>
        </div>
        ${eq || missingChains ? `<div class="eqs"><span class="muted small">Comparé avec :</span> ${eq} ${missingChains}</div>` : ''}
      </li>`;
    })
    .join('');
  const unknown = cmp.unknown.length
    ? `<p class="warn">${cmp.unknown.length} produit(s) de votre liste ne sont plus disponibles et ont été ignorés. <button class="link" data-clean>Les retirer</button></p>`
    : '';
  box.innerHTML = `<ul class="lines">${lines}</ul>${unknown}
    <p><button class="link" data-clear>Vider la liste</button></p>`;
}

// ---------------------------------------------------------------- résultats

/**
 * Panier incomplet : comparer son total à un panier complet serait trompeur.
 * On donne le prix des MÊMES produits dans le magasin complet le moins cher.
 */
function sameItemsComparison(s: StoreBasket, best: StoreBasket | undefined): string {
  if (s.complete || !best || best === s || s.priced.length === 0) return '';
  const ids = new Set(s.priced.map((p) => p.lineId));
  const other = best.priced.filter((p) => ids.has(p.lineId)).reduce((sum, p) => sum + Math.round(p.lineTotal * 100), 0) / 100;
  const n = s.priced.length;
  const bestName = cmp_mode === 'nearby' ? best.store.name : best.chain.name;
  const verdict = s.total < other ? `soit ${formatEuro(other - s.total)} de moins ici` : s.total > other ? `soit ${formatEuro(s.total - other)} de plus ici` : 'même prix';
  return `<p class="same">Pour ces ${n} mêmes produit${n > 1 ? 's' : ''}, ${esc(bestName)} : <strong>${formatEuro(other)}</strong> (${verdict}).</p>`;
}

let cmp_mode: Comparison['mode'] = 'chains';

function storeCard(s: StoreBasket, rank: number, cmp: Comparison, cheapest: number | undefined, best: StoreBasket | undefined): string {
  const diff = cheapest !== undefined && s.complete && rank > 0 ? s.total - cheapest : 0;
  const title = cmp.mode === 'nearby' ? esc(s.store.name) : '<span class="muted small">Prix en ligne</span>';
  const status = s.complete
    ? `<span class="badge ok">Panier complet</span>`
    : `<span class="badge partial">${s.missing.length} produit${s.missing.length > 1 ? 's' : ''} manquant${s.missing.length > 1 ? 's' : ''}</span>`;
  const details = s.priced
    .map((p) => {
      const warn = freshnessWarning(p.freshness);
      const idx = cat.indexOf(`${p.offer.chainId}:${p.offer.productKey}`);
      return `<li class="${p.freshness === 'stale' ? 'stale' : ''}">
        <div class="row"><span>${p.quantity} × ${esc(p.offer.name)} <span class="muted small">${idx !== undefined ? esc(sizeLabel(idx)) : ''}</span>
          ${p.isPromo ? `<span class="badge promo">${esc(p.offer.promo?.label ?? 'Promo')}</span>` : ''}
          ${p.scale !== 1 ? `<span class="badge info" title="Prix ramené au format de votre produit">ramené au même format</span>` : ''}</span>
          <strong>${formatEuro(p.lineTotal)}</strong></div>
        <div class="muted small">${esc(observationLabel(p.offer, s.chain))} · <a href="${esc(p.offer.sourceUrl)}" target="_blank" rel="noopener">voir</a>${warn ? ` · <span class="warn-text">⚠ ${esc(warn)}</span>` : ''}</div>
      </li>`;
    })
    .join('');
  const missing = s.missing.length ? `<p class="muted small">Non trouvés ici : ${s.missing.map((m) => esc(m.label)).join(', ')}.</p>` : '';
  return `<li class="store ${rank === 0 && s.complete ? 'best' : ''}">
    <details ${rank === 0 ? 'open' : ''}>
      <summary>
        <span class="rank">${rank + 1}</span>
        <span class="store-main">${chainBadge(s.chain.id)} <span class="store-name">${title}</span>
          <span class="muted small">${cmp.mode === 'nearby' ? `${km(s.distanceKm)}${s.store.city ? ` · ${esc(s.store.city)}` : ''}` : esc(s.chain.coverageNote)}</span></span>
        <span class="store-total"><strong>${formatEuro(s.total)}</strong>${diff > 0 ? `<span class="muted small">+${formatEuro(diff)}</span>` : ''}${status}</span>
      </summary>

      <ul class="detail">${details}</ul>${missing}
      ${s.staleCount ? `<p class="warn-text small">${s.staleCount} prix relevé(s) il y a plus de 48 h.</p>` : ''}
    </details>
    ${sameItemsComparison(s, best)}
  </li>`;
}

function renderBottomBar(cmp: Comparison): void {
  const bar = $('#bottom-bar');
  const best = cmp.result.stores.find((s) => s.complete) ?? cmp.result.stores[0];
  if (!best || state.items.length === 0) {
    bar.hidden = true;
    return;
  }
  const where = cmp.mode === 'nearby' ? `${best.store.name} · ${km(best.distanceKm)}` : best.chain.name;
  bar.innerHTML = `<span>Le moins cher : ${esc(where)}${best.complete ? '' : ' (incomplet)'}</span><strong>${formatEuro(best.total)} ›</strong>`;
  bar.hidden = false;
}

function renderResults(cmp: Comparison): void {
  renderBottomBar(cmp);
  const box = $('#ranking');
  if (state.items.length === 0) {
    box.innerHTML = '<p class="empty">Ajoutez des produits pour voir quel magasin est le moins cher.</p>';
    return;
  }
  const stores = cmp.result.stores;
  const best = stores.find((s) => s.complete);
  const cheapest = best?.total;
  cmp_mode = cmp.mode;
  const intro =
    cmp.mode === 'nearby'
      ? `<p class="muted">Magasins à moins de ${state.radiusKm} km de <strong>${esc(state.place?.label)}</strong>, le plus proche de chaque enseigne.</p>`
      : `<p class="muted">Comparaison des prix en ligne. <strong>Indiquez votre commune</strong> pour voir les magasins près de chez vous.</p>`;
  const none = cmp.noStoreInRadius.length ? `<p class="muted small">Aucun magasin ${esc(cmp.noStoreInRadius.join(', '))} dans ce rayon.</p>` : '';
  const list = stores.length
    ? `<ol class="stores">${stores.map((s, i) => storeCard(s, i, cmp, cheapest, best)).join('')}</ol>`
    : `<p class="empty">Aucun magasin couvert dans ce rayon. Agrandissez le rayon.</p>`;
  const promos = cmp.result.promosOnly.length
    ? `<h3>Promotions seulement</h3><ul class="promos">${cmp.result.promosOnly
        .map((h) => `<li>${chainBadge(h.chain.id)} ${esc(h.label)} : <strong>${formatEuro(h.promoPrice)}</strong> <span class="muted small">jusqu'au ${esc(h.offer.promo?.validTo.split('-').reverse().slice(0, 2).join('/'))}</span></li>`)
        .join('')}</ul>`
    : '';
  box.innerHTML = `${intro}${list}${none}${promos}<p class="disclaimer">${esc(DISCLAIMER)}</p>`;
}

function renderCoverage(): void {
  $('#coverage').innerHTML = cat.chains
    .map(
      (c) => `<li>${chainBadge(c.id)} <span class="badge ${c.coverage === 'full' ? 'ok' : c.coverage === 'promos' ? 'partial' : 'off'}">${
        c.coverage === 'full' ? 'Comparé' : c.coverage === 'promos' ? 'Promotions seulement' : 'Pas encore'
      }</span> <span class="muted small">${esc(c.coverageNote)}</span></li>`,
    )
    .join('');
  const d = new Date(cat.generatedAt);
  $('#data-info').textContent = `${cat.products.length.toLocaleString('fr-BE')} produits · données mises à jour le ${d.toLocaleDateString('fr-BE')} à ${d.toLocaleTimeString('fr-BE', { hour: '2-digit', minute: '2-digit' })}.`;
  $('#attributions').textContent = cat.attributions.join(' · ');
}

// ------------------------------------------------------------- localisation

function renderPlace(): void {
  $('#place-label').textContent = state.place ? state.place.label : 'Aucune commune choisie';
  $<HTMLSelectElement>('#radius').value = String(state.radiusKm);
  $('#place-clear').hidden = !state.place;
}

function renderPlaceSuggestions(): void {
  const q = $<HTMLInputElement>('#place').value;
  const box = $('#place-suggest');
  const found = q.trim().length >= 2 ? cat.findPlaces(q) : [];
  box.innerHTML = found
    .map((p) => `<li><button data-place="${esc(p[0])}|${esc(p[1])}|${p[2]}|${p[3]}">${esc(p[0])} ${esc(p[1])}</button></li>`)
    .join('');
  if (q.trim().length >= 2 && found.length === 0) {
    box.innerHTML = cat.postcodes.length
      ? '<li class="empty">Aucune commune trouvée.</li>'
      : '<li class="empty">Liste des communes pas encore chargée : utilisez « Me localiser ».</li>';
  }
}

function setPlace(p: Place | null): void {
  state.place = p;
  save();
  $<HTMLInputElement>('#place').value = '';
  $('#place-suggest').innerHTML = '';
  renderPlace();
  renderAll();
}

function locate(): void {
  const msg = $('#place-msg');
  if (!('geolocation' in navigator)) {
    msg.textContent = 'La localisation n’est pas disponible sur cet appareil.';
    return;
  }
  msg.textContent = 'Localisation…';
  navigator.geolocation.getCurrentPosition(
    (pos) => {
      msg.textContent = '';
      // Arrondi à ~100 m : suffisant pour trouver les magasins, plus discret.
      const lat = Math.round(pos.coords.latitude * 1000) / 1000;
      const lon = Math.round(pos.coords.longitude * 1000) / 1000;
      setPlace({ lat, lon, label: 'ma position' });
    },
    () => {
      msg.textContent = 'Localisation refusée ou impossible. Tapez plutôt votre code postal.';
    },
    { enableHighAccuracy: false, timeout: 10_000, maximumAge: 600_000 },
  );
}

// -------------------------------------------------------------------- rendu

function renderAll(): void {
  const cmp = compare(cat, state.items, cat.stores.length ? state.place : null, state.radiusKm, new Date());
  renderList(cmp);
  renderResults(cmp);
}

function bindEvents(): void {
  let t: ReturnType<typeof setTimeout> | undefined;
  $('#q').addEventListener('input', () => {
    clearTimeout(t);
    t = setTimeout(() => {
      renderSearch();
      renderBrowse();
    }, 120);
  });
  $('#place').addEventListener('input', renderPlaceSuggestions);
  $('#locate').addEventListener('click', locate);
  $('#place-clear').addEventListener('click', () => setPlace(null));
  $('#radius').addEventListener('change', (e) => {
    state.radiusKm = Number((e.target as HTMLSelectElement).value);
    save();
    renderAll();
  });

  document.addEventListener('click', (e) => {
    const el = (e.target as HTMLElement).closest('button');
    if (!el) return;
    const d = el.dataset;
    if (d.add) addItem(d.add);
    else if (d.rayon !== undefined) {
      const same = rayon?.category === d.rayon;
      $<HTMLInputElement>('#q').value = '';
      renderSearch();
      setRayon(d.rayon && !same ? { category: d.rayon, limit: PAGE } : null);
      if (rayon) $('#browse').scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    } else if (d.type !== undefined && rayon) setRayon({ ...rayon, type: d.type || undefined, limit: PAGE });
    else if (d.chainFilter !== undefined && rayon) setRayon({ ...rayon, chain: d.chainFilter || undefined, limit: PAGE });
    else if (d.bio !== undefined && rayon) setRayon({ ...rayon, bio: d.bio === '1' || undefined, limit: PAGE });
    else if ('more' in d && rayon) setRayon({ ...rayon, limit: rayon.limit + PAGE });
    else if (d.qty) {
      const it = state.items.find((i) => i.key === d.qty);
      if (it) it.qty = Math.min(99, Math.max(1, it.qty + Number(d.delta)));
      save();
      renderAll();
    } else if (d.remove) {
      state.items = state.items.filter((i) => i.key !== d.remove);
      save();
      renderAll();
      renderSearch();
      renderBrowse();
    } else if (d.place) {
      const [code, name, lat, lon] = d.place.split('|');
      setPlace({ lat: Number(lat), lon: Number(lon), label: `${code} ${name}` });
    } else if ('clear' in d) {
      if (confirm('Vider toute la liste ?')) {
        state.items = [];
        save();
        renderAll();
        renderSearch();
      }
    } else if ('clean' in d) {
      state.items = state.items.filter((i) => cat.indexOf(i.key) !== undefined);
      save();
      renderAll();
    }
  });

  document.addEventListener('change', (e) => {
    const el = e.target as HTMLSelectElement;
    if (!el.dataset.pick) return;
    const it = state.items.find((i) => i.key === el.dataset.pick);
    if (!it) return;
    it.picks = { ...(it.picks ?? {}), [el.dataset.chain!]: el.value || null };
    save();
    renderAll();
  });
}

async function main(): Promise<void> {
  try {
    cat = await loadCatalog();
  } catch (err) {
    // Sans catalogue, rien d'autre n'a de sens : on montre seulement l'erreur.
    document.body.classList.replace('loading', 'failed');
    $('#app-error').hidden = false;
    const detail = (err as Error).message.startsWith('Catalogue') ? ` (${esc((err as Error).message)})` : '';
    $('#app-error').innerHTML = `Impossible de charger les prix${detail}. Vérifiez votre connexion internet. <button class="link" onclick="location.reload()">Réessayer</button>`;
    return;
  }
  document.body.classList.remove('loading');
  bindEvents();
  renderPlace();
  renderCoverage();
  renderRayons();
  renderAll();
  if (!cat.stores.length) $('#stores-missing').hidden = false;
}

void main();
