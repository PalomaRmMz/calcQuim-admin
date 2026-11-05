export function saleInventoryBaseline(sale,pending,productId,view){
    const account=view.products.find(p=>String(p.productId)===String(productId));
    const anchor=view.movements.find(m=>m.id===account?.anchorId);
    if(!anchor)return {required:false,anchorAt:null};
    const anchorAt=anchor.recorded_at;
    const day=new Date(anchorAt).toLocaleDateString('en-CA',{timeZone:'America/Mexico_City'});
    const capturedAt=sale.createdAt||pending.created_at;
    return {required:Boolean((sale.date&&sale.date<day)||(capturedAt&&Date.parse(capturedAt)<Date.parse(anchorAt))),anchorAt,capturedAt};
}
