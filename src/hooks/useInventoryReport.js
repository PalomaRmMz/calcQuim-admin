import {useEffect,useRef,useState} from 'react';
export default function useInventoryReport(revision,enabled){
    const [state,setState]=useState({view:null,updatedAt:null,error:''}),loader=useRef(null);
    useEffect(()=>{
        if(!enabled)return;
        let active=true,sequence=0;const controllers=new Set();
        async function load(){
            const id=++sequence,controller=new AbortController();controllers.add(controller);
            try{const response=await fetch('/api/v1/inventory',{signal:controller.signal,cache:'no-store'});if(!response.ok)throw new Error('No se pudo consultar PostgreSQL.');const view=await response.json();if(!view.enabled)throw new Error('Inventario pendiente de activación.');if(active&&id===sequence)setState(old=>({view:JSON.stringify(old.view)===JSON.stringify(view)?old.view:view,updatedAt:new Date(),error:''}));}
            catch(error){if(error.name!=='AbortError'&&active&&id===sequence)setState(old=>({...old,error:'No se pudo actualizar el reporte. Los datos visibles corresponden a la última consulta correcta.'}));throw error;}
            finally{controllers.delete(controller);}
        }
        loader.current=load;const reload=()=>{load().catch(()=>{});};reload();
        const timer=setInterval(()=>{if(document.visibilityState==='visible')reload();},10000);
        window.addEventListener('focus',reload);document.addEventListener('visibilitychange',reload);
        return()=>{active=false;loader.current=null;clearInterval(timer);controllers.forEach(c=>c.abort());window.removeEventListener('focus',reload);document.removeEventListener('visibilitychange',reload);};
    },[revision,enabled]);
    return {...state,refresh:()=>loader.current?.()};
}
