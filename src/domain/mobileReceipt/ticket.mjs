import { BRAND, COLORS as C } from "./brand.mjs";
import { money } from "./sale.mjs";
import { logoDataUri as officialLogo } from "./logo.mjs";
export const escapeHtml = (value) =>
  String(value ?? "").replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ],
  );
export function ticketModel(receipt) {
  if (
    receipt?.status !== "confirmed" ||
    !receipt.folio ||
    !Array.isArray(receipt.items) ||
    !receipt.items.length
  )
    throw new Error("Solo se comparte una venta confirmada.");
  const date = new Date(receipt.createdAt);
  if (!Number.isFinite(date.getTime()) || !Number.isFinite(receipt.total))
    throw new Error("El comprobante está incompleto.");
  const items = receipt.items.map((item) => {
    if (
      !item.name ||
      ![item.quantity, item.price, item.amount].every(
        (n) => typeof n === "number" && Number.isFinite(n) && n >= 0,
      )
    )
      throw new Error("El comprobante contiene un concepto inválido.");
    const quantity = new Intl.NumberFormat("es-MX", {
      maximumFractionDigits: 6,
      useGrouping: false,
    }).format(item.quantity);
    return {
      name: item.name,
      quantity: `${item.entryMode === "amount" ? "≈ " : ""}${quantity} ${item.unit}`,
      price: `${money(item.price)} / ${item.unit}`,
      amount: money(item.amount),
      captured:
        item.entryMode === "amount"
          ? `Por importe · ${money(item.amount)}`
          : null,
      discount:
        item.discountRate > 0
          ? `Mayoreo ${Number((item.discountRate * 100).toFixed(2))} %`
          : null,
    };
  });
  if (
    receipt.items.reduce((sum, i) => sum + Math.round(i.amount * 100), 0) !==
    Math.round(receipt.total * 100)
  )
    throw new Error("El total del comprobante no coincide con sus conceptos.");
  return {
    brand: BRAND,
    folio: receipt.folio,
    date: date.toLocaleDateString("es-MX", {
      timeZone: "America/Mexico_City",
      day: "2-digit",
      month: "long",
      year: "numeric",
    }),
    time: date.toLocaleTimeString("es-MX", {
      timeZone: "America/Mexico_City",
      hour: "2-digit",
      minute: "2-digit",
    }),
    version: receipt.corrected
      ? `Ticket actualizado · Versión ${receipt.version}`
      : "Ticket original",
    items,
    total: money(receipt.total),
    disclaimer: "Comprobante comercial. No es factura fiscal.",
  };
}
export function ticketHtml(receipt, { logoDataUri = officialLogo } = {}) {
  const m = ticketModel(receipt),
    e = escapeHtml;
  return `<!doctype html><html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>
 @page{size:A4;margin:17mm}*{box-sizing:border-box}body{margin:0;background:white;color:${C.ink};font:12px Arial,sans-serif;line-height:1.5}header{text-align:center;padding:4px 16px 22px;border-bottom:2px solid ${C.cyan}}.logo{display:block;width:270px;height:auto;margin:0 auto 18px}h1{font-size:19px;margin:0;font-weight:800}.slogan{font-size:12px;color:${C.primary};margin:3px 0 14px}.address{max-width:370px;margin:0 auto;font-size:11px;color:${C.muted}}.phone{font-size:12px;color:${C.ink};margin:8px 0 0}.meta{display:flex;justify-content:space-between;gap:12px;padding:20px 0}.caption{font-size:10px;text-transform:uppercase;letter-spacing:1px;color:${C.muted}}.folio{font-size:19px;font-weight:bold}.date{text-align:right}.version{font-size:10px;color:${C.muted};margin-top:4px}table{width:100%;border-collapse:collapse;table-layout:fixed}thead{display:table-header-group}th{text-align:left;background:${C.pale};padding:9px 10px;font-size:10px;text-transform:uppercase;letter-spacing:1px}td{padding:13px 10px;border-bottom:1px solid ${C.line};vertical-align:top;overflow-wrap:anywhere}tr{break-inside:avoid;page-break-inside:avoid}th:last-child,td:last-child{text-align:right;width:26%;white-space:nowrap}.concept{font-size:13px;font-weight:bold}.detail{font-size:11px;color:${C.muted};margin-top:4px}.amount{font-weight:bold;font-size:14px}.closing{break-inside:avoid;page-break-inside:avoid}.total{display:flex;align-items:center;justify-content:space-between;padding:22px 10px;border-bottom:2px solid ${C.cyan}}.sum{font-size:34px;font-weight:800;color:${C.primary}}.thanks{text-align:center;font-weight:bold;font-size:16px;margin:28px 0 5px}.fine{text-align:center;color:${C.muted};font-size:10px;margin:0 0 16px}
 </style></head><body><header>${logoDataUri ? `<img class="logo" src="${e(logoDataUri)}" alt="Logo oficial Full Clean">` : ""}<h1>${e(m.brand.name)}</h1><p class="slogan">${e(m.brand.slogan)}</p><p class="address">${e(m.brand.street)}<br>${e(m.brand.locality)}</p><p class="phone">Teléfono y WhatsApp: ${e(m.brand.phone)}</p></header><section class="meta"><div><div class="caption">Ticket de venta</div><div class="folio">${e(m.folio)}</div><div class="version">${e(m.version)}</div></div><div class="date">${e(m.date)}<br>${e(m.time)}</div></section><table><thead><tr><th>Concepto / cantidad</th><th>Importe</th></tr></thead><tbody>${m.items.map((i) => `<tr><td><div class="concept">${e(i.name)}</div><div class="detail">${e(i.quantity)} · ${e(i.price)}${i.discount ? `<br>${e(i.discount)}` : ""}${i.captured ? `<br>${e(i.captured)}` : ""}</div></td><td class="amount">${e(i.amount)}</td></tr>`).join("")}</tbody></table><section class="closing"><div class="total"><span>Total · MXN</span><span class="sum">${e(m.total)}</span></div><p class="thanks">${e(m.brand.thanks)}</p><p class="fine">${e(m.disclaimer)}</p></section></body></html>`;
}
