import "reflect-metadata";
import { INestApplication } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import request from "supertest";
import { AppModule } from "../src/app.module";
import { configureApp } from "../src/app.setup";
import { PrismaService } from "../src/prisma/prisma.service";

const USERNAME = `e2e_${Date.now()}`.slice(0, 30);
const PASSWORD = "supersecret1";

const op = (query: string, variables?: Record<string, unknown>) => ({
  query,
  variables,
});

describe("Auth flow (e2e)", () => {
  let app: INestApplication;
  let prisma: PrismaService;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = moduleRef.createNestApplication();
    configureApp(app, false, true);
    await app.init();
    prisma = app.get(PrismaService);
    // подчищаем остатки прошлых прогонов
    await prisma.user.deleteMany({ where: { username: { startsWith: "e2e_" } } });
  });

  afterAll(async () => {
    if (prisma) {
      await prisma.user.deleteMany({
        where: { username: { startsWith: "e2e_" } },
      });
    }
    if (app) await app.close();
  });

  const server = () => app.getHttpServer();
  let accessToken: string;
  let loginCookie: string; // "refresh_token=..." из Set-Cookie логина

  it("register → создаёт пользователя с ролью USER", async () => {
    const res = await request(server())
      .post("/graphql")
      .send(
        op(
          `mutation($u:String!,$p:String!){ register(input:{username:$u,password:$p}){ username role } }`,
          { u: USERNAME, p: PASSWORD },
        ),
      )
      .expect(200);
    expect(res.body.errors).toBeUndefined();
    expect(res.body.data.register).toMatchObject({
      username: USERNAME,
      role: "USER",
    });
  });

  it("login → access-токен в теле + httpOnly refresh-cookie, refresh НЕ в теле", async () => {
    const res = await request(server())
      .post("/graphql")
      .send(
        op(
          `mutation($u:String!,$p:String!){ login(input:{username:$u,password:$p}){ tokens{ accessToken refreshToken expiresIn } } }`,
          { u: USERNAME, p: PASSWORD },
        ),
      )
      .expect(200);
    const tokens = res.body.data.login.tokens;
    expect(tokens.accessToken).toBeTruthy();
    expect(tokens.refreshToken).toBeNull(); // refresh не в теле
    expect(tokens.expiresIn).toBe(900);
    accessToken = tokens.accessToken;

    const setCookie = res.headers["set-cookie"] as unknown as string[];
    expect(setCookie).toBeDefined();
    const refresh = setCookie.find((c) => c.startsWith("refresh_token="));
    expect(refresh).toBeDefined();
    // фиксируем атрибуты безопасности cookie, а не только её наличие
    expect(refresh).toMatch(/HttpOnly/i);
    expect(refresh).toMatch(/SameSite=Lax/i);
    expect(refresh).toMatch(/Path=\//);
    expect(refresh).toMatch(/Max-Age=2592000/);
    expect(refresh).not.toMatch(/Secure/i); // isProd=false в тестах → без Secure
    loginCookie = refresh!.split(";")[0];
  });

  it("me → без токена отклоняется (UNAUTHENTICATED)", async () => {
    const res = await request(server())
      .post("/graphql")
      .send(op(`query { me { username } }`))
      .expect(200);
    expect(res.body.data).toBeNull();
    expect(res.body.errors[0].code).toBe("UNAUTHENTICATED");
  });

  it("me → с токеном возвращает текущего пользователя", async () => {
    const res = await request(server())
      .post("/graphql")
      .set("Authorization", `Bearer ${accessToken}`)
      .send(op(`query { me { username role } }`))
      .expect(200);
    expect(res.body.data.me).toMatchObject({ username: USERNAME, role: "USER" });
  });

  it("refresh → ротация: новая пара по cookie, старый cookie отклоняется", async () => {
    const fresh = await request(server())
      .post("/graphql")
      .set("Cookie", loginCookie)
      .send(op(`mutation { refresh { accessToken expiresIn refreshToken } }`))
      .expect(200);
    expect(fresh.body.errors).toBeUndefined();
    expect(fresh.body.data.refresh.accessToken).toBeTruthy();
    expect(fresh.body.data.refresh.refreshToken).toBeNull();
    const newCookie = fresh.headers["set-cookie"] as unknown as string[];
    expect(newCookie.some((c) => c.startsWith("refresh_token="))).toBe(true);

    // повторное использование СТАРОГО (ротированного) cookie → отказ
    const reuse = await request(server())
      .post("/graphql")
      .set("Cookie", loginCookie)
      .send(op(`mutation { refresh { accessToken } }`))
      .expect(200);
    expect(reuse.body.data).toBeNull();
    expect(reuse.body.errors[0].code).toBe("UNAUTHENTICATED");
  });
});
