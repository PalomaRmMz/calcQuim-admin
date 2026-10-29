export function createHealthController(service) {
  return {
    live(_req, res) { res.status(200).json(service.live()); },
    async ready(_req, res) {
      const { statusCode, body } = await service.ready();
      res.status(statusCode).json(body);
    },
  };
}
