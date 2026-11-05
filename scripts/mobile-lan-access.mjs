import { BlockList,isIP } from 'node:net';
import { networkInterfaces } from 'node:os';
export const AUTHORIZED_SUBNET='192.168.1.0/24';
export function privateIpv4(ip){return isIP(ip)===4&&(/^10\./.test(ip)||/^192\.168\./.test(ip)||/^172\.(1[6-9]|2\d|3[01])\./.test(ip));}
export function allowedPeer(address,cidr=AUTHORIZED_SUBNET){
  const ip=String(address||'').replace(/^::ffff:/,'');
  if(ip==='127.0.0.1'||ip==='::1')return true;
  if(!privateIpv4(ip))return false;
  const [host,prefix]=cidr.split('/'),block=new BlockList();block.addSubnet(host,Number(prefix),'ipv4');
  return block.check(ip,'ipv4');
}
export function localLan(host,interfaces=networkInterfaces()){
  if(host!=='192.168.1.64'||!privateIpv4(host))throw new Error('La IP Wi-Fi autorizada es 192.168.1.64; no se admite 0.0.0.0.');
  const matches=Object.values(interfaces).flat().filter(row=>row.address===host&&!row.internal&&row.family==='IPv4');
  if(matches.length!==1)throw new Error('La IP autorizada no pertenece a una interfaz local activa.');
  return {host,cidr:AUTHORIZED_SUBNET};
}
export function mobileLanApp(express,router,{cidr=AUTHORIZED_SUBNET}={}){
  const app=express();app.disable('x-powered-by');app.set('trust proxy',false);
  app.use((req,res,next)=>{
    res.set('Cache-Control','no-store');
    if(!allowedPeer(req.socket.remoteAddress,cidr))return res.status(403).json({error:{code:'LOCAL_SUBNET_ONLY',message:'Conexión fuera de la red autorizada.'}});
    next();
  });
  app.get('/health',(_req,res)=>res.json({status:'ok',service:'CalcQuim móvil',environment:'operational'}));
  app.use('/api/mobile/v1',router);
  app.use((_req,res)=>res.status(404).json({error:{code:'NOT_FOUND'}}));
  app.use((error,_req,res,_next)=>{
    if(res.headersSent)return _next(error);
    const status=Number.isInteger(error.status)?error.status:503;
    res.status(status).json({error:{code:error.code||'SERVER_UNAVAILABLE',message:status<500?error.message:'No se pudo completar la operación. Consulta el estado antes de reintentar.'}});
  });
  return app;
}
