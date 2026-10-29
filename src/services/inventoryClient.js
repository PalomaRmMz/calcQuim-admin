export async function saveInventory(command,name,input,refresh){
    const result=await command(name,[input]);
    if(!result.ok)return result;
    try{await refresh();return result;}
    catch{return {...result,viewWarning:'Guardado en PostgreSQL. No se pudo actualizar la vista; recarga antes de registrar otra operación. No repitas este movimiento.'};}
}
