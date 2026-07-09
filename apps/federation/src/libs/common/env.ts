// Ошибиться с портом subgraph'а дороже, чем со строкой в UI: gateway соберёт
// supergraph только если достучится до всех трёх. Поэтому env читаем в одном
// месте и с явными дефолтами.
export function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Переменная окружения ${name} обязательна`);
  return value;
}

function port(name: string, fallback: number): number {
  return Number(process.env[name] ?? fallback);
}

export const PORTS = {
  gateway: port("GATEWAY_PORT", 4000),
  users: port("USERS_PORT", 4001),
  posts: port("POSTS_PORT", 4002),
  engagement: port("ENGAGEMENT_PORT", 4003),
};

// subgraph'ы — внутренние процессы: наружу смотрит только gateway
export const SUBGRAPH_HOST = process.env.SUBGRAPH_HOST ?? "127.0.0.1";
export const GATEWAY_HOST = process.env.GATEWAY_HOST ?? "0.0.0.0";

export const GRAPHQL_MAX_DEPTH = Number(process.env.GRAPHQL_MAX_DEPTH ?? 12);

// сколько постов автора отдаёт поле User.posts (потолок на каждого автора)
export const POSTS_PER_AUTHOR = Number(process.env.POSTS_PER_AUTHOR ?? 20);

export const SUBGRAPH_URLS = {
  users: process.env.USERS_URL ?? `http://localhost:${PORTS.users}/graphql`,
  posts: process.env.POSTS_URL ?? `http://localhost:${PORTS.posts}/graphql`,
  engagement:
    process.env.ENGAGEMENT_URL ?? `http://localhost:${PORTS.engagement}/graphql`,
};
