// Поднимает три subgraph'а, ДОЖИДАЕТСЯ их готовности и только потом gateway.
// Порядок принципиален: IntrospectAndCompose собирает supergraph на старте,
// спрашивая SDL у каждого subgraph'а. Не ответил хотя бы один — gateway не встанет.
import { spawn } from "node:child_process";
import { setTimeout as sleep } from "node:timers/promises";

const PORTS = {
  users: process.env.USERS_PORT ?? 4001,
  posts: process.env.POSTS_PORT ?? 4002,
  engagement: process.env.ENGAGEMENT_PORT ?? 4003,
  gateway: process.env.GATEWAY_PORT ?? 4000,
};

const children = [];

function start(name) {
  const child = spawn(
    process.execPath,
    ["--env-file-if-exists=.env", `dist/apps/${name}/main.js`],
    { stdio: "inherit" },
  );
  child.on("exit", (code) => {
    if (code !== 0 && code !== null) {
      console.error(`[${name}] упал с кодом ${code}`);
      shutdown(code);
    }
  });
  children.push(child);
  return child;
}

function shutdown(code = 0) {
  for (const child of children) child.kill("SIGTERM");
  process.exit(code);
}
process.on("SIGINT", () => shutdown(0));
process.on("SIGTERM", () => shutdown(0));

// Пингуем не HTTP-корень, а _service { sdl } — ровно тот запрос, которым
// gateway будет забирать схему. «Порт открыт» ещё не значит «схема готова».
async function waitForSubgraph(name, port, attempts = 60) {
  for (let i = 0; i < attempts; i++) {
    try {
      const res = await fetch(`http://localhost:${port}/graphql`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ query: "{ _service { sdl } }" }),
      });
      if (res.ok) {
        const json = await res.json();
        if (json.data?._service?.sdl) return;
      }
    } catch {
      // ещё не слушает — просто ждём
    }
    await sleep(500);
  }
  throw new Error(`subgraph ${name} не поднялся за ${attempts * 0.5}с`);
}

start("users");
start("posts");
start("engagement");

await Promise.all([
  waitForSubgraph("users", PORTS.users),
  waitForSubgraph("posts", PORTS.posts),
  waitForSubgraph("engagement", PORTS.engagement),
]);

console.log("subgraph'ы готовы → поднимаю gateway");
start("gateway");
