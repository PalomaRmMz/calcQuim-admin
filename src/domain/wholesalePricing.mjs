export const WHOLESALE_VERSION = 'admin-sales-wholesale-v2';
export const AMOUNT_POLICIES = ['wholesale-threshold', 'normal-threshold', 'require-liters'];
export const wholesaleSettings = data => data?.wholesalePricing ?? data?.procurement?.wholesalePricing ?? null;
export const wholesaleEnabled = data => wholesaleSettings(data)?.version === WHOLESALE_VERSION;

function scaled(value, decimals, label) {
    const text = String(value ?? '').trim().replace(',', '.');
    if (!new RegExp(`^\\d+(?:\\.\\d{1,${decimals}})?$`).test(text)) throw new Error(`${label}: valor inválido o demasiados decimales.`);
    const [whole, fraction = ''] = text.split('.');
    const result = BigInt(whole) * 10n ** BigInt(decimals) + BigInt(fraction.padEnd(decimals, '0'));
    if (result > BigInt(Number.MAX_SAFE_INTEGER)) throw new Error(`${label}: valor fuera de rango.`);
    return result;
}
const number = value => { if (value > BigInt(Number.MAX_SAFE_INTEGER)) throw new Error('Importe fuera de rango.'); return Number(value); };
const round = (value, divisor) => (value + divisor / 2n) / divisor;
export function validWholesalePrice(value, normalPrice) {
    if (value == null || value === '') return null;
    const cents = scaled(value, 2, 'Precio de mayoreo');
    const normal = scaled(normalPrice, 2, 'Precio normal');
    if (cents <= 0n || cents > normal) throw new Error('El precio de mayoreo debe ser positivo y no superar el precio normal.');
    return Number(cents) / 100;
}
export function productRates(product, groups) {
    const group = groups.find(g => String(g.id) === String(product?.priceGroupId));
    // Individual and group are currently exclusive in persistence. An explicit
    // individual price always owns both rates; never inherit half a tariff.
    const individual = product?.price != null;
    const source = individual ? product : group;
    const normalPrice = source?.active === false && !individual ? null : source?.price;
    return { normalPrice: normalPrice == null ? null : Number(normalPrice), wholesalePrice: source?.wholesalePrice ?? null, priceSource: individual ? 'individual' : 'group', priceSourceId: individual ? product?.id : group?.id };
}

export function calculateWholesaleItem(item, context = {}) {
    const normalPrice = item.normalPrice ?? item.price;
    const normal = scaled(normalPrice, 2, 'Precio normal');
    const configured = validWholesalePrice(item.wholesalePrice, normalPrice);
    const wholesale = configured == null ? null : scaled(configured, 2, 'Precio de mayoreo');
    const liters = ['litro', 'litros', 'l'].includes(String(item.unit).trim().toLowerCase());
    const policy = item.amountPolicy || 'require-liters';
    if (!AMOUNT_POLICIES.includes(policy)) throw new Error('Política de captura por importe pendiente de configuración.');
    const raw = item.entryMode === 'amount' ? item.requestedAmount : item.quantity;
    if (raw === '' || raw == null) return { ...item, price: Number(normal) / 100, quantity: 0, amount: 0, subtotal: 0, discount: 0, discountRate: 0, priceTier: 'normal', pricingVersion: WHOLESALE_VERSION };
    let chosen = normal, tier = 'normal', quantity, amountCents, numerator, denominator;
    if (item.entryMode === 'amount') {
        const cents = scaled(raw, 2, 'Importe');
        if (normal === 0n || cents <= 0n) throw new Error('El importe y la tarifa deben ser positivos.');
        if (context.tier) { if(context.tier === 'wholesale') {chosen=wholesale;tier='wholesale';} } else if (liters && wholesale != null) {
            const normalValid = cents < 10n * normal;
            const wholesaleValid = cents >= 10n * wholesale;
            if (normalValid && wholesaleValid && policy === 'require-liters') throw new Error('Importe ambiguo entre tarifa normal y mayoreo. Captura los litros para confirmar.');
            if (wholesaleValid && (!normalValid || policy === 'wholesale-threshold')) { chosen = wholesale; tier = 'wholesale'; }
        }
        quantity = Number(cents) / Number(chosen);
        numerator = String(cents); denominator = String(chosen);
        amountCents = cents; // The captured amount is authoritative, never recomputed.
    } else {
        const micro = scaled(raw, 6, 'Cantidad');
        if (micro <= 0n) throw new Error('La cantidad debe ser positiva.');
        if (liters && (context.tier ? context.tier === 'wholesale' : micro >= 10000000n) && wholesale != null) { chosen = wholesale; tier = 'wholesale'; }
        quantity = Number(micro) / 1000000;
        amountCents = round(micro * chosen, 1000000n);
        numerator = String(micro); denominator = '1000000';
    }
    const warning = liters && wholesale == null && (context.groupQualifies || (item.entryMode === 'amount' ? BigInt(numerator) >= 10n * normal : quantity >= 10))
        ? 'Sin tarifa de mayoreo configurada: se conserva el precio normal.' : '';
    return { ...item, pricingVersion: WHOLESALE_VERSION, normalPrice: Number(normal) / 100, wholesalePrice: configured, price: Number(chosen) / 100, priceTier: tier, amountPolicy: policy, wholesaleThreshold: 10,
        quantity, quantityNumerator: numerator, quantityDenominator: denominator, quantityApproximate: item.entryMode === 'amount', capturedValue: String(raw), amount: number(amountCents) / 100,
        subtotal: number(amountCents) / 100, discount: 0, discountRate: 0, pricingWarning: warning };
}

// Aggregate only an official price source. Visual categories/lines and identical
// numeric rates never establish membership of a price group.
export function calculateWholesaleItems(items) {
    const buckets = new Map(), result = [...items];
    items.forEach((item,index)=>{
        if(item.pricingVersion !== WHOLESALE_VERSION) return;
        const liters=['litro','litros','l'].includes(String(item.unit).trim().toLowerCase());
        const source=item.priceSourceId ?? (item.priceSource==='individual' ? item.productId ?? item.reference?.id : null);
        const key=liters && source!=null ? item.priceSource+':'+source : 'row:'+index;
        if(!buckets.has(key))buckets.set(key,[]);
        buckets.get(key).push({item,index});
    });
    const gcd=(a,b)=>b?gcd(b,a%b):a;
    const add=(a,b)=>{const n=a[0]*b[1]+b[0]*a[1],d=a[1]*b[1],g=gcd(n,d);return[n/g,d/g];};
    for(const rows of buckets.values()) {
        const first=rows[0].item,normal=scaled(first.normalPrice??first.price,2,'Precio normal');
        const configured=validWholesalePrice(first.wholesalePrice,first.normalPrice??first.price);
        const wholesale=configured==null?null:scaled(configured,2,'Precio de mayoreo');
        const liters=['litro','litros','l'].includes(String(first.unit).trim().toLowerCase());
        let fixed=[0n,1n],normalTotal=[0n,1n],wholesaleTotal=[0n,1n],amountCount=0,normalConfirmed=true,wholesaleConfirmed=true;
        for(const{item}of rows){
            if(scaled(item.normalPrice??item.price,2,'Precio normal')!==normal || validWholesalePrice(item.wholesalePrice,item.normalPrice??item.price)!==configured)throw new Error('El grupo oficial contiene tarifas incompatibles; recarga el catálogo.');
            const raw=item.entryMode==='amount'?item.requestedAmount:item.quantity;
            if(raw==null||raw==='')continue;
            if(item.entryMode==='amount'){
                const cents=scaled(raw,2,'Importe');if(normal<=0n)throw new Error('El precio debe ser positivo.');
                normalTotal=add(normalTotal,[cents,normal]);wholesaleTotal=add(wholesaleTotal,[cents,wholesale??normal]);amountCount++;
                if(item.confirmedQuantity!=null&&item.confirmedQuantity!==''){
                    const physical=scaled(item.confirmedQuantity,6,'Cantidad física confirmada');
                    if(physical<=0n)throw new Error('Confirma una cantidad física positiva.');
                    normalConfirmed=normalConfirmed&&cents*1000000n===physical*normal;
                    wholesaleConfirmed=wholesaleConfirmed&&wholesale!=null&&cents*1000000n===physical*wholesale;
                }
            }else fixed=add(fixed,[scaled(raw,6,'Cantidad'),1000000n]);
        }
        normalTotal=add(normalTotal,fixed);wholesaleTotal=add(wholesaleTotal,fixed);
        const normalValid=(!liters||wholesale==null||normalTotal[0]<10n*normalTotal[1])&&normalConfirmed,wholesaleValid=liters&&wholesale!=null&&wholesaleTotal[0]>=10n*wholesaleTotal[1]&&wholesaleConfirmed;
        if(!normalValid&&!wholesaleValid)throw new Error('La cantidad física confirmada no coincide con el importe, tarifa y total del grupo. El importe capturado se conserva.');
        let tier='normal';
        if(liters&&wholesale!=null&&wholesaleValid){
            // The owner already chose wholesale priority for pure amount capture.
            // A mixed sale with two fixed points requires liters, never iteration.
            if(normalValid&&amountCount&&fixed[0]>0n)throw new Error('Captura mixta ambigua: ambas tarifas cumplen con distintas cantidades del grupo. Confirma los litros de los renglones por pesos.');
            if(!normalValid||first.amountPolicy==='wholesale-threshold')tier='wholesale';
            else if(first.amountPolicy==='require-liters')throw new Error('Importe ambiguo: confirma los litros.');
        }
        const total=tier==='wholesale'?wholesaleTotal:normalTotal;
        for(const{item,index}of rows)result[index]={...calculateWholesaleItem(item,{tier,groupQualifies:normalTotal[0]>=10n*normalTotal[1]}),aggregationVersion:'official-price-group-v1',aggregateQuantityNumerator:String(total[0]),aggregateQuantityDenominator:String(total[1])};
    }
    return result;
}
