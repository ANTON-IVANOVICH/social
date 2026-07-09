import { DynamicModule, Logger, Type } from "@nestjs/common";
import { NestFactory } from "@nestjs/core";
import {
  ApolloFederationDriver,
  ApolloFederationDriverConfig,
} from "@nestjs/apollo";
import { ApolloServerPluginLandingPageLocalDefault } from "@apollo/server/plugin/landingPage/default";
import { ApolloServerPluginLandingPageDisabled } from "@apollo/server/plugin/disabled";
import { GraphQLModule } from "@nestjs/graphql";
import { Request } from "express";
import { depthLimit } from "./depth-limit";
import { GRAPHQL_MAX_DEPTH, SUBGRAPH_HOST } from "./env";
import { PrismaService } from "./prisma.service";

// Каждый subgraph описывает СВОЮ часть графа кодом и печатает её в свой
// schema.gql с federation: 2 — то есть с директивами @key/@extends/@external,
// по которым gateway и сшивает supergraph.
export function subgraphGraphQLModule<TLoaders>(
  schemaPath: string,
  createLoaders: (prisma: PrismaService) => TLoaders,
): DynamicModule {
  const isProd = process.env.NODE_ENV === "production";

  return GraphQLModule.forRootAsync<ApolloFederationDriverConfig>({
    driver: ApolloFederationDriver,
    inject: [PrismaService], // PrismaModule глобальный
    useFactory: (prisma: PrismaService) => ({
      autoSchemaFile: { path: schemaPath, federation: 2 },
      sortSchema: true,
      playground: false,
      // Паритет с монолитом: в проде схему наружу не раскрываем и Sandbox не
      // отдаём. Композиции это не мешает — gateway забирает SDL полем
      // `_service { sdl }`, а не интроспекцией.
      introspection: !isProd,
      plugins: [
        isProd
          ? ApolloServerPluginLandingPageDisabled()
          : ApolloServerPluginLandingPageLocalDefault(),
      ],
      // Тот же щит, что в монолите. Supergraph замкнут циклом Post.author →
      // User.posts → …, поэтому вложенный запрос раскручивается в экспоненту.
      validationRules: [depthLimit(GRAPHQL_MAX_DEPTH)],
      // Лоадеры создаются НА ЗАПРОС. В федерации это не роскошь: gateway шлёт
      // представления сущностей ПАЧКОЙ в один _entities-запрос, и reference-
      // резолвер вызывается по разу на представление — без батчинга это N+1.
      context: ({ req }: { req: Request }) => ({
        req,
        loaders: createLoaders(prisma),
      }),
    }),
  });
}

export async function bootstrapSubgraph(
  module: Type<unknown>,
  port: number,
  name: string,
): Promise<void> {
  const app = await NestFactory.create(module);
  app.enableShutdownHooks();
  // Subgraph — служебный процесс, а не публичный API: наружу торчит только
  // gateway. Слушаем loopback, чтобы прямой запрос из сети до него не дошёл
  // (внутри кластера адрес переопределяется через SUBGRAPH_HOST).
  await app.listen(port, SUBGRAPH_HOST);
  new Logger("Subgraph").log(`${name} → http://${SUBGRAPH_HOST}:${port}/graphql`);
}
