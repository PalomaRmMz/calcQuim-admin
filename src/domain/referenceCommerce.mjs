// Owner-provided references only. Costs/stock intentionally unknown. Never auto-seeded.
export const referenceCommerce={id:'fullclean-owner-20261105-v1',source:'Propietario, instrucción 2026-11-05; revisar precios antes de activación',suppliers:[{externalKey:'fc:supplier:zorro',name:'Abarrotera Zorro'},{externalKey:'fc:supplier:libertad',name:'Jarcería La Libertad'},{externalKey:'fc:supplier:san-martin',name:'Jarcería San Martín'}].map(s=>({...s,locality:'San Martín Texmelucan, Puebla',cost:null,phone:null,address:null})),products:[
 ['mr-big-800','Mr. Big 800 hojas','pieza',[['rollo',1,12,'pieza'],['paquete-4',4,45,'paquete']]],
 ['mr-big-600','Mr. Big 600 hojas','pieza',[['rollo',1,10,'pieza'],['paquete-4',4,31,'paquete']]],
 ['vogue','Vogue','pieza',[['rollo',1,13,'pieza'],['paquete-6',6,60,'paquete']]],
 ['sanitas','Sanitas 100 toallas 24 × 21 cm','pieza',[['paquete-100',1,19,'paquete']]],
 ['bobina','Bobina de papel','pieza',[['pieza',1,28,'pieza']]],
 ['pastilla-bano','Pastilla para baño','pieza',[['pieza',1,15,'pieza']]],
 ['cloro-duo','Pastillas de cloro dúo (2)','pieza',[['duo',1,15,'paquete']]],
 ['fibra-chica','Fibra para trastes chica','pieza',[['pieza',1,8,'pieza']]],
 ['fibra-mediana','Fibra para trastes mediana','pieza',[['pieza',1,11,'pieza']]],
 ['fregon','Fibra Fregón','pieza',[['pieza',1,11,'pieza']]],
 ['atomizador-250','Atomizador ¼ L','pieza',[['pieza',1,12,'pieza']]],
 ['atomizador-500-a','Atomizador ½ L variante A','pieza',[['pieza',1,17,'pieza']]],
 ['atomizador-500-b','Atomizador ½ L variante B','pieza',[['pieza',1,20,'pieza']]],
 ['atomizador-1000','Atomizador 1 L','pieza',[['pieza',1,25,'pieza']]],
 ['roma-1000','Roma empacado 1 kg','pieza',[['bolsa',1,45,'bolsa']]],
 ['roma-500','Roma empacado ½ kg','pieza',[['bolsa',1,22,'bolsa']]],
 ['roma-250','Roma empacado ¼ kg','pieza',[['bolsa',1,13,'bolsa']]],
 ['roma-suelto','Roma suelto','kg',[['kg',1,35,'kg'],['medio-kg',0.5,12,'pieza']]],
 ['zote-100','Zote barra 100 g','pieza',[['barra',1,8,'pieza']]],
 ['zote-200','Zote barra 200 g','pieza',[['barra',1,18,'pieza']]],
 ['zote-400','Zote barra 400 g','pieza',[['barra',1,25,'pieza']]]
].map(([key,name,unit,options])=>({externalKey:'fc:article:'+key,name,unit,cost:null,stock:null,options:options.map(([key,factor,price,unit])=>({key,factor,price,unit,integerOnly:unit!=='kg',sealedAvailability:null})),pending:key.startsWith('atomizador-500')?'Confirmar distinción física de variantes; no fusionar':null})),services:[
 {id:'fc:service:lavado',name:'Lavado por carga',unit:'carga',priceMode:'fixed',price:60,active:true,addons:[{id:'insumos',name:'Jabón y suavizante Full Clean',price:10},{id:'secado',name:'Secado adicional',price:30}]},
 ...[['exprimido','Sólo exprimido'],['exprimido-secado','Exprimido y secado'],['especial','Trabajo especial']].map(([key,name])=>({id:'fc:service:'+key,name,unit:'servicio',priceMode:'custom',price:null,active:true,addons:[]}))],pending:['Costos de adquisición y existencias iniciales no conocidos','Disponibilidad de empaque sellado no se deduce del stock equivalente','No se ofrece Sanitas por toalla ni cloro por pastilla individual','No hay tarifa de secado independiente; sólo adicional o trabajo cotizado']};
