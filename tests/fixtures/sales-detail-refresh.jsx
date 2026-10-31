import { useState } from 'react';
import { createRoot } from 'react-dom/client';
import { MemoryRouter } from 'react-router';
import SalesPage from '../../src/pages/SalesPage.jsx';
import { CatalogContext } from '../../src/context/CatalogHooks.js';
import { PersistenceContext } from '../../src/context/PersistenceContext.js';

const sale = { id:'synthetic-sale',folio:'V-SINTETICA',origin:'MOVIL',date:'2026-10-31',payment:'Efectivo',notes:'Nota inicial sintética',total:20,items:[{id:'synthetic-item',productId:1,name:'Producto inicial sintético',unit:'litro',price:20,quantity:1,amount:20}],history:[] };
export default function Fixture() {
    const [sales,setSales]=useState([sale]);
    return <MemoryRouter><CatalogContext.Provider value={{products:[],categories:[],productLines:[]}}><PersistenceContext.Provider value={{snapshot:{data:{sales},inventoryEnabled:false},command:()=>{throw new Error('NO_API_WRITES');}}}>
        <button onClick={()=>setSales([{...sale,total:60,notes:'Nota actualizada sintética',items:[{...sale.items[0],name:'Producto actualizado sintético',quantity:3,amount:60}],history:[{at:'2026-10-31T12:00:00Z',channel:'WEB',action:'revision_sintetica'}]}])}>Actualizar snapshot sintético</button>
        <button onClick={()=>setSales([])}>Retirar del snapshot sintético</button>
        <SalesPage/>
    </PersistenceContext.Provider></CatalogContext.Provider></MemoryRouter>;
}
createRoot(document.getElementById('root')).render(<Fixture/>);
