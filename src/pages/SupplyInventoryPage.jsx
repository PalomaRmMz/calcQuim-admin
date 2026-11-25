import {useContext,useEffect,useState} from 'react';
import {Link,useSearchParams} from 'react-router';
import {PersistenceContext} from '../context/PersistenceContext.js';
import SupplyInventoryPanel from '../components/SupplyInventoryPanel';
import {saveInventory} from '../services/inventoryClient.js';

async function readInventory(signal){
  const response=await fetch('/api/v1/inventory',{cache:'no-store',signal});
  if(!response.ok)throw Error('No se pudo consultar el inventario de insumos.');
  return response.json();
}

export default function SupplyInventoryPage(){
  const persistence=useContext(PersistenceContext);
  const [params,setParams]=useSearchParams();
  const [inventory,setInventory]=useState(null);
  const [error,setError]=useState('');
  const [notice,setNotice]=useState('');
  const [busy,setBusy]=useState(false);
  const revision=persistence?.snapshot.revision;
  useEffect(()=>{
    if(revision==null)return;
    const controller=new AbortController();
    readInventory(controller.signal).then(value=>{
      if(!controller.signal.aborted)setInventory(value);
    }).catch(e=>{if(!controller.signal.aborted)setError(e.message);});
    return ()=>controller.abort();
  },[revision]);

  const change=(key,value)=>{
    const next=new URLSearchParams(params);
    if(value)next.set(key,value);
    else next.delete(key);
    setParams(next,{replace:key!=='insumo'});
  };
  async function save(name,input){
    if(busy)return false;
    setBusy(true);setError('');setNotice('');
    try{
      const result=await saveInventory(persistence.command,name,input,async()=>setInventory(await readInventory()));
      if(!result.ok)throw Error(result.message);
      setNotice(result.viewWarning||'Operación registrada.');
      return true;
    }catch(e){setError(e.message);return false;}
    finally{setBusy(false);}
  }
  return <section className="container-fluid py-3">
    <div className="section-heading mb-3">
      <h2>Existencias de insumos</h2>
      <Link className="btn btn-outline-secondary" to="/compras/abastecimiento">Ver abastecimiento de limpieza</Link>
    </div>
    {error&&<p role="alert" className="alert alert-danger">{error}</p>}
    {notice&&<p role="status" className="alert alert-success">{notice}</p>}
    {!persistence?<p>Esta vista requiere la conexión a PostgreSQL.</p>:!inventory?<p role="status">Consultando insumos e inventario…</p>:
      <SupplyInventoryPanel data={persistence.snapshot.data} inventory={inventory} params={params} onChange={change} busy={busy} error={error} onSave={save}/>}
  </section>;
}
