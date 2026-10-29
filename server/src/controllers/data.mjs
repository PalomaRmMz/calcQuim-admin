export function createDataController(service) {
  const send=(res,snapshot)=>res.set('ETag',`"${snapshot.revision}"`).json(snapshot);
  return {
    read:async(_req,res)=>send(res,await service.read()),
    async run(req,res,name,args) {
      const value=await service.command({name,args,
        revision:Number(req.get('If-Match')?.replaceAll('"','')),
        generation:req.get('X-Dataset-Generation'),requestKey:req.get('Idempotency-Key')});
      send(res,value);
    },
  };
}
