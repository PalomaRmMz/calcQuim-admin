export function assertSaleDraftGeneration(captured,snapshot){
 if(typeof captured!=='string'||snapshot.generation!==captured)throw Error('El conjunto de datos cambió. Cierra la captura y revisa la venta en el entorno correcto.');
}
