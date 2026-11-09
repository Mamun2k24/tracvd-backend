// utils/pricing.js

// ---------- products helper ----------
export function buildProductsMap(products = []) {
  const map = {};
  for (const p of products) map[p._id?.toString?.() || p._id] = p;
  return map;
}

export function computeUnitPrice(product) {
  const base = Number(product.price || 0);

  const flashSaleEnabled =
    product?.flashSale?.enabled &&
    product?.flashSale?.salePrice &&
    Number(product.flashSale.salePrice) < base;

  if (flashSaleEnabled) {
    const salePrice = Number(product.flashSale.salePrice);

    return {
      unitBase: base,
      unit: salePrice,
      markdownEach: base - salePrice,
      isSale: true,
    };
  }

  const pct = Number(product.discount || 0);

  if (pct > 0) {
    const sale = Math.max(
      0,
      Math.round(base * (1 - pct / 100))
    );

    return {
      unitBase: base,
      unit: sale,
      markdownEach: base - sale,
      isSale: true,
    };
  }

  return {
    unitBase: base,
    unit: base,
    markdownEach: 0,
    isSale: false,
  };
}

// ---------- cart pricing (products + coupon) ----------
export function priceCart({ items, productsById, coupon }) {
  // items: [{ productId, quantity }]
  let lines = [];
  let subtotal = 0;
  let markdownTotal = 0;
  let couponTotal = 0;

  // 1) line build + markdown
  for (const it of items || []) {
    const p = productsById[it.productId];
    if (!p) continue;
    const qty = Number(it.quantity || 1);
    const { unitBase, unit, markdownEach, isSale } = computeUnitPrice(p);

    const lineSubtotal = unit * qty;
    const markdown = Math.max(0, Math.round(markdownEach * qty));

    const ln = {
      productId: p._id,
      name: p.productName,
      categoryName: p.categoryName,
      qty,
      unitBase,
      unit,
      isSale,
      markdown,
      couponDiscount: 0,
      lineSubtotal,
      lineTotal: lineSubtotal,
    };
    lines.push(ln);
    subtotal += lineSubtotal;
    markdownTotal += markdown;
  }

  // 2) coupon
  if (coupon) {
    const now = Date.now();
    // validity
    if (
      coupon.status === "active" &&
      (!coupon.startAt || now >= +new Date(coupon.startAt)) &&
      (!coupon.endAt || now <= +new Date(coupon.endAt))
    ) {
      // scope filter
      const matchIdx = lines
        .map((ln, i) => {
          if (coupon.excludeSaleItems && ln.isSale) return null;

          const kind = coupon.appliesTo?.kind || "all";
          if (kind === "all") return i;

          if (kind === "products") {
            const ids = (coupon.appliesTo?.productIds || []).map(String);
            return ids.includes(String(ln.productId)) ? i : null;
          }
          if (kind === "categories") {
            const cats = coupon.appliesTo?.categoryNames || [];
            return cats.includes(String(ln.categoryName)) ? i : null;
          }
          return null;
        })
        .filter((x) => x !== null);

      // only if something matched
      if (matchIdx.length) {
        // minSpend check on matched subtotal
        const matchedSubtotal = matchIdx.reduce((s, i) => s + lines[i].lineSubtotal, 0);
        if (Number(coupon.minSpend || 0) <= matchedSubtotal) {
          if (coupon.type === "percent") {
            for (const i of matchIdx) {
              const d = Math.round((lines[i].lineSubtotal * coupon.amount) / 100);
              lines[i].couponDiscount += d;
              couponTotal += d;
            }
          } else {
            // fixed: proportional to matched subtotal
            const base = matchedSubtotal || 1;
            for (const i of matchIdx) {
              const share = lines[i].lineSubtotal / base;
              const d = Math.round(coupon.amount * share);
              lines[i].couponDiscount += d;
              couponTotal += d;
            }
          }
          // cap
          if (coupon.maxDiscount && couponTotal > coupon.maxDiscount) {
            const ratio = coupon.maxDiscount / couponTotal;
            for (const i of matchIdx) lines[i].couponDiscount = Math.round(lines[i].couponDiscount * ratio);
            couponTotal = Math.round(coupon.maxDiscount);
          }
        }
      }
    }
  }

  // 3) finalize line totals
  lines = lines.map((l) => ({
    ...l,
    lineTotal: Math.max(0, Math.round(l.lineSubtotal - l.couponDiscount)),
  }));

  const total = Math.max(0, lines.reduce((s, l) => s + l.lineTotal, 0));

  return {
    lines,
    subtotal: Math.round(subtotal),
    markdownTotal: Math.round(markdownTotal),
    couponTotal: Math.round(couponTotal),
    total: Math.round(total),
  };
}

// ---------- shipping (free delivery rules) ----------
/**
 * Compute shipping considering base rates and free-delivery rules.
 * @param {Object} params
 * @param {number} params.subtotal - product total after discounts/coupons
 * @param {"inside"|"outside"} params.selectedOption - inside Dhaka / outside
 * @param {string} params.district - selected district name
 * @param {Object} params.settings - shipping settings document
 *  {
 *    insideDhakaRate, outsideDhakaRate,
 *    freeThreshold,
 *    freeForDistricts: [ "Dhaka", ... ],
 *    campaign: { active, startAt, endAt, freeThreshold }
 *  }
 */
export function computeShipping({
  subtotal = 0,
  selectedOption = "inside",
  district = "",
  settings = {},
}) {
  const inside = Number(settings?.insideDhakaRate ?? 60);
  const outside = Number(settings?.outsideDhakaRate ?? 120);
  const base = selectedOption === "inside" ? inside : outside;

  let shipping = base;

  // campaign window check
  const now = new Date();
  const camp = settings?.campaign || {};
  const inCampaign =
    camp?.active &&
    (!camp?.startAt || now >= new Date(camp.startAt)) &&
    (!camp?.endAt || now <= new Date(camp.endAt));

  // pick threshold (campaign > global)
  const threshold = inCampaign
    ? Number(camp?.freeThreshold || 0)
    : Number(settings?.freeThreshold || 0);

  if (threshold > 0 && subtotal >= threshold) {
    shipping = 0;
  }

  // district-based free
  const districts = (settings?.freeForDistricts || []).map(String);
  if (district && districts.includes(String(district))) {
    shipping = 0;
  }

  return {
    shippingBase: Math.max(0, Math.round(base)),
    shippingFinal: Math.max(0, Math.round(shipping)),
    thresholdUsed: threshold || 0,
    inCampaign: !!inCampaign,
  };
}
