import {useContext,useState} from 'react';
import {PersistenceContext} from '../context/PersistenceContext.js';
import ContentPanel from '../components/ContentPanel';
import DataTable from '../components/DataTable';
import TableActions from '../components/TableActions';
import PrimaryAction from '../components/PrimaryAction';
import Feedback from '../components/Feedback';
import {HardwareCategories} from '../components/HardwareCatalogTools';

export default function HardwareCategoriesPage(){
 const persistence=useContext(PersistenceContext),[editing,setEditing]=useState(null);
 if(!persistence)return <Feedback message="Este módulo requiere PostgreSQL."/>;
 const {products,procurement}=persistence.snapshot.data;
 const categories=procurement.hardwareCategories||[];
 const columns=[
  {accessorKey:'name',header:'Categoría'},
  {id:'products',header:'Productos',accessorFn:c=>products.filter(p=>p.activity==='JARCERIA'&&String(p.hardwareCategoryId)===String(c.id)).length},
  {id:'active',header:'Estado',accessorFn:c=>c.active?'Activa':'Inactiva'},
  {id:'actions',header:'Acciones',enableSorting:false,Cell:({row})=><TableActions label={row.original.name} onEdit={()=>setEditing(row.original)} showDelete={false}/>},
 ];
 return <><ContentPanel title="Categorías de jarcería" subtitle="Organiza los productos de jarcería. Sus categorías son independientes de limpieza." action={<PrimaryAction onClick={()=>setEditing({name:'',active:true})}>Nueva categoría</PrimaryAction>}>
  <DataTable mobileCards columns={columns} data={categories} searchPlaceholder="Buscar categoría..." initialSorting={[{id:'name',desc:false}]}/>
 </ContentPanel>{editing&&<HardwareCategories categories={categories} initialCategory={editing} hideList onCommand={persistence.command} onClose={()=>setEditing(null)}/>}</>;
}
