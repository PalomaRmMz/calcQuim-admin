import {readFile,writeFile,mkdir,cp} from 'node:fs/promises';
import {createHash} from 'node:crypto';
const mobile=new URL('file:///D:/ReactApps/calcQuim/'),admin=new URL('../',import.meta.url);
const stage=new URL('integration/official-sales-prepared/',mobile);
const manifest=JSON.parse(await readFile(new URL('manifest.json',stage),'utf8'));
const sha=b=>createHash('sha256').update(b).digest('hex');
const backup=new URL('.artifacts/mis-ventas/baseline/',mobile);
await mkdir(backup,{recursive:true});
// Preserve the published package and verify current source before any replacement.
await cp(stage,new URL('package/',backup),{recursive:true,errorOnExist:true,force:false});
for(const f of manifest.files){const active=new URL(f.path,f.repository==='admin'?admin:mobile);const bytes=await readFile(active);if(sha(bytes)!==f.preparedSha256)throw Error('Unknown source drift: '+f.path);f.existed=true;f.originalSha256=sha(bytes);}
let repo=await readFile(new URL('admin/server/src/repositories/salesHistory.mjs',stage),'utf8');
const predicate=`// Only persisted capture evidence counts. Conflicting creation channels are excluded.
const creationEvents = "jsonb_array_elements(CASE WHEN jsonb_typeof(s.record->'history')='array' THEN s.record->'history' ELSE '[]'::jsonb END)";
const mobileCapture = \`((s.record->>'origin'='MOVIL' OR ((s.record->>'origin' IS NULL) AND EXISTS (SELECT 1 FROM \${creationEvents} h WHERE h->>'action'='created' AND h->>'channel'='MOVIL'))) AND NOT EXISTS (SELECT 1 FROM \${creationEvents} h WHERE h->>'action'='created' AND h->>'channel'='WEB'))\`;
`;
repo=repo.replace('export async function readSalesHistory',predicate+'export async function readSalesHistory').replace('digest({folio:f.folio','digest({scope:\'verified-mobile-v1\',folio:f.folio').replace('where=[],values=[]','where=[mobileCapture],values=[]').replace('WHERE s.id=$1`,[id]','WHERE s.id=$1 AND ${mobileCapture}`,[id]');
await writeFile(new URL('admin/server/src/repositories/salesHistory.mjs',stage),repo);
let screen=await readFile(new URL('mobile/src/screens/SalesScreen.js',stage),'utf8');
screen=screen.replace("import * as Crypto", "import {Feather} from '@expo/vector-icons';\nimport * as Crypto");
const start=screen.indexOf('const origin='),end=screen.indexOf('export default function');
screen=screen.slice(0,start)+`const moment=v=>v?new Date(v).toLocaleString('es-MX',{timeZone:'America/Mexico_City'}):'Sin consulta';
function Summary({sale:s}){return <><View style={styles.row}><Text style={[styles.heading,{flex:1}]}>{s.folio||'Sin folio registrado'}</Text><Text style={styles.price}>{money(s.monetary?s.monetary.collectedCents/100:s.total)}</Text></View><Text style={styles.muted}>{s.date}{s.voidedAt?' · Anulada':''}</Text></>;}
`+screen.slice(end);
screen=screen.replace("useState({folio:'',from:'',to:''})","useState({folio:''})").replace("['folio','from','to'].some","['folio'].some");
screen=screen.replace('>Ventas</Text><ActionButton label="Configuración" variant="secondary" onPress={()=>{Keyboard.dismiss();navigation.navigate(\'Connection\');}}/>','>Mis ventas</Text><Pressable accessibilityRole="button" accessibilityLabel="Configuración" hitSlop={12} onPress={()=>{Keyboard.dismiss();navigation.navigate(\'Connection\');}}><Feather name="settings" size={24}/></Pressable>');
screen=screen.split('\n').filter(line=>!line.includes('Catálogo: {moment')&&!line.includes('Consultar historial no envía')&&!line.includes('label="Desde (AAAA-MM-DD)"')).join('\n');
screen=screen.replace("name:'Oficiales'","name:'Recientes'").replace("name:'Tickets locales'","name:'Tickets guardados'");
screen=screen.replace('Consultando PostgreSQL…','Consultando ventas…').replace('Consulta oficial obtenida','Última actualización').replace('>Ventas oficiales</Text>','>Ventas capturadas desde Android</Text>').replace('Folio exacto (opcional)','Buscar por folio').replace("'Consultar ventas oficiales'","'Ver mis ventas'").replace('Filtros modificados. Pulsa Actualizar consulta para aplicarlos.','Pulsa Actualizar consulta para buscar este folio.').replace('No hay ventas para estos filtros.','No hay ventas móviles verificadas para esta búsqueda. Puedes consultar Tickets guardados y Datos anteriores.').replace('label="Siguiente"','label="Ver más ventas"');
await writeFile(new URL('mobile/src/screens/SalesScreen.js',stage),screen);
let sections=await readFile(new URL('mobile/src/components/MainSections.js',stage),'utf8');
sections=sections.replace("label: 'Ventas'","label: 'Mis ventas'");await writeFile(new URL('mobile/src/components/MainSections.js',stage),sections);
manifest.previousPublication={publishedAt:manifest.publishedAt,verifiedAt:manifest.verifiedAt,evidence:manifest.publicationEvidence};
for(const key of ['publishedAt','verifiedAt','publicationEvidence'])delete manifest[key];
Object.assign(manifest,{at:new Date().toISOString(),published:false,publicationAuthorized:false,scope:'verified-mobile-v1'});
for(const f of manifest.files)f.preparedSha256=sha(await readFile(new URL(f.repository+'/'+f.path,stage)));
await writeFile(new URL('manifest.json',stage),JSON.stringify(manifest,null,2)+'\n');
console.log('Prepared nine files; operational sources untouched.');
