import "reflect-metadata";
import { INestApplication } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import { AddressInfo } from "node:net";
import { Client, createClient } from "graphql-ws";
import WebSocket from "ws";
import { Redis } from "ioredis";
import { AppModule } from "../src/app.module";
import { configureApp } from "../src/app.setup";
import { PrismaService } from "../src/prisma/prisma.service";
import { REDIS_CLIENT } from "../src/redis/redis.constants";

// Подписки — самый хрупкий к регрессиям код, а Test.createTestingModule для WS не
// годится: нужен реальный коннект через graphql-ws на поднятом порту. Этот файл —
// шаблон таких тестов: аутентификация через connectionParams в onConnect, доставка
// событий и оба паттерна фильтрации.

const PASS = "supersecret1";
const ts = Date.now();
const NAME = (s: string) => `sube2e_${s}_${ts}`.slice(0, 30);

const settle = (ms: number) => new Promise((r) => setTimeout(r, ms));
async function waitFor<T>(
  fn: () => T | undefined,
  timeout = 8000,
  step = 50,
): Promise<T> {
  const deadline = Date.now() + timeout;
  for (;;) {
    const v = fn();
    if (v) return v;
    if (Date.now() > deadline) throw new Error("waitFor timeout");
    await settle(step);
  }
}
const isISO = (s: unknown) => typeof s === "string" && !Number.isNaN(Date.parse(s));

describe("Subscriptions (e2e, real graphql-ws client)", () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let http: string;
  let ws: string;
  const clients: Client[] = [];

  const users: Record<string, { id: string; token: string }> = {};

  async function gql(query: string, variables?: unknown, token?: string) {
    const res = await fetch(http, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        ...(token ? { authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify({ query, variables }),
    });
    const j = await res.json();
    if (j.errors) throw new Error(JSON.stringify(j.errors));
    return j.data;
  }

  function client(token: string): Client {
    const c = createClient({
      url: ws,
      webSocketImpl: WebSocket, // ClientOptions.webSocketImpl: unknown
      connectionParams: { authorization: `Bearer ${token}` },
      retryAttempts: 0,
      lazy: true,
    });
    clients.push(c);
    return c;
  }

  // подписка: складываем data каждого next; возвращаем буфер + dispose
  function sub(c: Client, query: string, variables: Record<string, unknown> = {}) {
    const events: any[] = [];
    const dispose = c.subscribe(
      { query, variables },
      { next: (m) => m?.data && events.push(m.data), error: () => {}, complete: () => {} },
    );
    return { events, dispose };
  }

  async function register(name: string) {
    await gql(
      `mutation($u:String!,$p:String!){register(input:{username:$u,password:$p}){id}}`,
      { u: name, p: PASS },
    );
    const d = await gql(
      `mutation($u:String!,$p:String!){login(input:{username:$u,password:$p}){user{id} tokens{accessToken}}}`,
      { u: name, p: PASS },
    );
    return { id: d.login.user.id, token: d.login.tokens.accessToken };
  }

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    configureApp(app, false, true);
    // listen(0) сам инициализирует приложение И поднимает HTTP-сервер на случайном
    // свободном порту — без живого listen WS-upgrade (подписки) не принимаются
    await app.listen(0);
    const addr = app.getHttpServer().address() as AddressInfo;
    http = `http://127.0.0.1:${addr.port}/graphql`;
    ws = `ws://127.0.0.1:${addr.port}/graphql`;

    prisma = app.get(PrismaService);
    // сбрасываем throttler (register лимитирован 5/час с IP) и старые presence-ключи
    await app.get<Redis>(REDIS_CLIENT).flushdb();
    await prisma.user.deleteMany({ where: { username: { startsWith: "sube2e_" } } });

    for (const k of ["alice", "bob", "carol", "dave"]) users[k] = await register(NAME(k));
  });

  afterAll(async () => {
    for (const c of clients) {
      try {
        c.dispose();
      } catch {
        /* ignore */
      }
    }
    if (prisma) {
      await prisma.user.deleteMany({ where: { username: { startsWith: "sube2e_" } } });
    }
    if (app) await app.close();
  });

  const NOTIF = `subscription { newNotification {
    __typename id createdAt
    ... on FollowNotification { follower { username } }
    ... on ReactionNotification { actor { username } post { id } }
    ... on CommentNotification { actor { username } }
  } }`;

  it("newNotification: доставляется адресату, фильтруется по получателю, createdAt валиден", async () => {
    const bob = client(users.bob.token);
    const carol = client(users.carol.token);
    const bobN = sub(bob, NOTIF);
    const carolN = sub(carol, NOTIF);
    await settle(600); // даём соединениям подтвердиться

    await gql(`mutation($id:ID!){ follow(userId:$id) }`, { id: users.bob.id }, users.alice.token);

    const evt = await waitFor(() =>
      bobN.events.find(
        (e) =>
          e.newNotification.__typename === "FollowNotification" &&
          e.newNotification.follower?.username === NAME("alice"),
      ),
    );
    expect(isISO(evt.newNotification.createdAt)).toBe(true); // пережил JSON-раунд-трип через Redis
    expect(carolN.events).toHaveLength(0); // чужому не пришло

    bobN.dispose();
    carolN.dispose();
  });

  it("postAdded: приходит подписчику автора (фильтр followingIds) + createdAt", async () => {
    // alice уже подписана на bob из прошлого теста → её WS-контекст знает bob
    const alice = client(users.alice.token);
    const feed = sub(alice, `subscription { postAdded { id content createdAt } }`);
    await settle(600);

    const created = await gql(
      `mutation($c:String!){ createPost(input:{content:$c}){ id } }`,
      { c: `e2e post ${ts}` },
      users.bob.token,
    );
    const postId = created.createPost.id;

    const evt = await waitFor(() => feed.events.find((e) => e.postAdded.id === postId));
    expect(evt.postAdded.content).toContain("e2e post");
    expect(isISO(evt.postAdded.createdAt)).toBe(true);
    feed.dispose();
  });

  it("reactionAdded/commentAdded: фильтр по postId + автору летят уведомления", async () => {
    const post = await gql(
      `mutation($c:String!){ createPost(input:{content:$c}){ id } }`,
      { c: `react target ${ts}` },
      users.bob.token,
    );
    const postId = post.createPost.id;

    const bob = client(users.bob.token);
    const alice = client(users.alice.token);
    const bobN = sub(bob, NOTIF);
    const react = sub(alice, `subscription($p:ID!){ reactionAdded(postId:$p){ postId userId type } }`, { p: postId });
    const comment = sub(alice, `subscription($p:ID!){ commentAdded(postId:$p){ id content createdAt } }`, { p: postId });
    await settle(600);

    await gql(`mutation($p:ID!,$t:ReactionType!){ react(postId:$p, type:$t) }`, { p: postId, t: "LIKE" }, users.alice.token);
    const r = await waitFor(() => react.events.find((e) => e.reactionAdded.postId === postId));
    expect(r.reactionAdded.type).toBe("LIKE");
    await waitFor(() =>
      bobN.events.find((e) => e.newNotification.__typename === "ReactionNotification"),
    );

    await gql(`mutation($p:ID!,$c:String!){ addComment(postId:$p, content:$c){ id } }`, { p: postId, c: "e2e comment" }, users.alice.token);
    const cm = await waitFor(() => comment.events.find((e) => e.commentAdded.content === "e2e comment"));
    expect(isISO(cm.commentAdded.createdAt)).toBe(true);
    await waitFor(() =>
      bobN.events.find((e) => e.newNotification.__typename === "CommentNotification"),
    );

    bobN.dispose();
    react.dispose();
    comment.dispose();
  });

  it("typing: виден другому, но не отправителю (self-фильтр)", async () => {
    const postId = "00000000-0000-0000-0000-000000000001"; // typing эфемерен, пост не нужен
    const bob = client(users.bob.token);
    const alice = client(users.alice.token);
    const bobT = sub(bob, `subscription($p:ID!){ typing(postId:$p){ postId userId isTyping } }`, { p: postId });
    const aliceT = sub(alice, `subscription($p:ID!){ typing(postId:$p){ postId userId isTyping } }`, { p: postId });
    await settle(600);

    await gql(`mutation($p:ID!,$t:Boolean!){ setTyping(postId:$p, isTyping:$t) }`, { p: postId, t: true }, users.alice.token);

    const evt = await waitFor(() =>
      bobT.events.find((e) => e.typing.postId === postId && e.typing.userId === users.alice.id),
    );
    expect(evt.typing.isTyping).toBe(true);
    expect(aliceT.events).toHaveLength(0); // себе свой typing не шлём
    bobT.dispose();
    aliceT.dispose();
  });

  it("presenceChanged: online при подключении и offline при отключении", async () => {
    const alice = client(users.alice.token);
    const presence = sub(alice, `subscription { presenceChanged { userId online } }`);
    await settle(600);

    // dave подключается ПОСЛЕ того, как alice уже слушает presence
    const dave = client(users.dave.token);
    const daveSub = sub(dave, NOTIF); // активная операция держит коннект
    await waitFor(() =>
      presence.events.find((e) => e.presenceChanged.userId === users.dave.id && e.presenceChanged.online === true),
    );

    daveSub.dispose();
    dave.dispose();
    await waitFor(() =>
      presence.events.find((e) => e.presenceChanged.userId === users.dave.id && e.presenceChanged.online === false),
    );
    presence.dispose();
  });
});
