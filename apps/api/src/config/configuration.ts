export default () => ({
  nodeEnv: process.env.NODE_ENV ?? "development",
  port: parseInt(process.env.PORT ?? "3000", 10),
  host: process.env.HOST ?? "0.0.0.0",
  logLevel: process.env.LOG_LEVEL ?? "info",
  graphql: {
    maxDepth: parseInt(process.env.GRAPHQL_MAX_DEPTH ?? "12", 10),
  },
  redisUrl: process.env.REDIS_URL ?? "redis://localhost:6379",
  jwt: {
    secret: process.env.JWT_SECRET as string,
    accessTtl: process.env.JWT_ACCESS_TTL ?? "15m",
  },
  cors: {
    origin: process.env.CLIENT_ORIGIN,
  },
});
