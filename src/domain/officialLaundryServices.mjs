// Owner-provided configuration. Review/apply only in an isolated dataset in this task.
export const officialServices=[
 {id:'fc:service:lavado',name:'Lavado por carga',serviceType:'wash',unit:'carga',priceMode:'fixed',price:60,active:true,addons:[{id:'insumos',name:'Jabón y suavizante Full Clean',price:10},{id:'secado',name:'Secado adicional',price:30}],loadPricing:{version:'laundry-loads-v1',step:0.5,options:[
  {key:'solo',label:'Solo lavado',addons:[],full:60,half:30},
  {key:'insumos',label:'Lavado + jabón y suavizante Full Clean',addons:['insumos'],full:70,half:40},
  {key:'secado',label:'Lavado + secado',addons:['secado'],full:90,half:60},
  {key:'completo',label:'Servicio completo: lavado, secado, jabón y suavizante Full Clean',addons:['insumos','secado'],full:100,half:50},
 ]}},
 {id:'fc:service:solo-secado',name:'Solo secado',unit:'carga',priceMode:'fixed',price:30,active:true,addons:[],loadPricing:{version:'laundry-loads-v1',step:1,options:[{key:'base',label:'Solo secado',addons:[],full:30,half:null}]}},
 {id:'fc:service:exprimido-secado',name:'Centrifugado + secado',unit:'carga',priceMode:'fixed',price:40,active:true,addons:[],loadPricing:{version:'laundry-loads-v1',step:1,options:[{key:'base',label:'Centrifugado + secado',addons:[],full:40,half:null}]}},
 {id:'fc:service:especial',name:'Servicio a medida',unit:'servicio',priceMode:'custom',price:null,descriptionRequired:true,active:true,addons:[]},
];
