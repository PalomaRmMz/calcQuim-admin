export function startupTiming(now=()=>performance.now()){
 const start=now(),measurements={};
 return {async measure(name,operation){const before=now();try{return await operation();}finally{measurements[name]=Math.round((now()-before)*100)/100;}},snapshot(){return {...measurements,totalMs:Math.round((now()-start)*100)/100};}};
}
