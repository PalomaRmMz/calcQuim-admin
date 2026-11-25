import {useRef,useState} from 'react';
import {Button} from '@mui/material';
import AppModal from './AppModal';
import {inventoryShoppingList} from '../domain/inventoryAttention.mjs';

export default function InventoryShoppingList({tableRef,options}){
 const [message,setMessage]=useState(null),[feedback,setFeedback]=useState('');
 const input=useRef(null);

 function open(){
  const table=tableRef.current;
  if(!table)return;
  const rows=table.getFilteredRowModel().rows.map(row=>row.original);
  setFeedback('');
  setMessage(inventoryShoppingList(rows,options));
 }

 async function copy(){
  try{
   await navigator.clipboard.writeText(message);
   setFeedback('Lista copiada.');
  }catch{
   input.current?.focus();
   input.current?.select();
   setFeedback('Texto seleccionado. Cópialo con el menú del dispositivo o con Ctrl+C.');
  }
 }

 return <>
  <Button variant="contained" disableElevation onClick={open}>Compartir lista de compras</Button>
  {message!==null&&<AppModal title="Lista de compras" onClose={()=>setMessage(null)}
   actions={<>
    <Button color="inherit" onClick={()=>setMessage(null)}>Cerrar</Button>
    {message&&<><Button onClick={copy}>Copiar texto</Button><Button variant="contained" disableElevation
     href={`https://wa.me/?text=${encodeURIComponent(message)}`} target="_blank" rel="noopener noreferrer">Abrir WhatsApp</Button></>}
   </>}>
   {message?<><textarea ref={input} className="form-control" aria-label="Texto de la lista de compras" value={message} rows={8} readOnly/>
    {feedback&&<p role="status" className="form-text mb-0">{feedback}</p>}</>:<p className="mb-0">Los filtros actuales no muestran productos agotados ni en el punto de reposición.</p>}
  </AppModal>}
 </>;
}
