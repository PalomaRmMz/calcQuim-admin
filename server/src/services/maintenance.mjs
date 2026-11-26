import {AsyncLocalStorage} from 'node:async_hooks';
import {randomUUID} from 'node:crypto';

const reads=new Set(['GET','HEAD','OPTIONS']);
const guardedMethods=new Set(['command','cancelMobileAttempt','webSaleStatus']);
export const maintenanceMessage='Actualización en preparación. Conserva tu captura. El servidor todavía no admite nuevas escrituras.';

export function createMaintenance({initiallyClosed=false}={}) {
  const context=new AsyncLocalStorage();
  const sessions=new Map();
  let epoch=initiallyClosed?randomUUID():null;
  let sealed=false;
  let requests=0,operations=0;
  const status=()=>({closed:epoch!==null,epoch,sealed,requests,operations,
    sessions:sessions.size,unresolved:[...sessions.values()].filter(value=>value!==epoch||epoch===null).length});
  const reject=res=>res.status(503).set('Cache-Control','no-store').json({
    error:{code:'MAINTENANCE_WRITE_CLOSED',message:maintenanceMessage},
  });

  function ingress(req,res,next) {
    if(reads.has(req.method))return next();
    if(epoch!==null)return reject(res);
    const ticket={open:true};
    requests++;
    const release=()=>{
      if(!ticket.open)return;
      ticket.open=false;
      requests--;
    };
    res.once('finish',release);
    res.once('close',release);
    return context.run(ticket,next);
  }

  function protect(service,ApiError) {
    return new Proxy(service,{
      get(target,name,receiver) {
        const method=Reflect.get(target,name,receiver);
        if(!guardedMethods.has(name)||typeof method!=='function')return method;
        return async (...args)=>{
          if(name==='webSaleStatus'&&args[2]!==true)return method.apply(target,args);
          if(epoch!==null&&!context.getStore()?.open)
            throw new ApiError(503,'MAINTENANCE_WRITE_CLOSED',maintenanceMessage);
          operations++;
          try{return await method.apply(target,args);}
          finally{operations--;}
        };
      },
    });
  }

  function session(req,res) {
    const {id,acknowledge}=req.body??{};
    if(typeof id!=='string'||!/^[a-f0-9-]{36}$/.test(id))return res.sendStatus(400);
    if(!sessions.has(id)){
      if(sealed||sessions.size>=10000)return res.sendStatus(503);
      sessions.set(id,null);
    }
    if(acknowledge!==undefined){
      if(!epoch||acknowledge!==epoch)return res.sendStatus(409);
      sessions.set(id,epoch);
    }
    return res.set('Cache-Control','no-store').json(status());
  }

  function assertDrained(coverage) {
    if(!epoch||requests||operations||status().unresolved||
      coverage?.epoch!==epoch||coverage.webLegacyResolved!==true||coverage.mobileQueuesResolved!==true)
      throw Error('La ventana de mantenimiento no tiene evidencia completa de drenaje.');
    return status();
  }
  return {status,ingress,protect,session,assertDrained,
    begin(){epoch??=randomUUID();return status();},
    reopen(){epoch=null;sealed=false;return status();},
    seal(coverage){assertDrained(coverage);sealed=true;return status();},
  };
}
