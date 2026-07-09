import { Module } from "@nestjs/common";
import {
  ApolloGatewayDriver,
  ApolloGatewayDriverConfig,
} from "@nestjs/apollo";
import { IntrospectAndCompose, RemoteGraphQLDataSource } from "@apollo/gateway";
import { GraphQLModule } from "@nestjs/graphql";
import { Request } from "express";
import { depthLimit } from "../../libs/common/depth-limit";
import { GRAPHQL_MAX_DEPTH, SUBGRAPH_URLS } from "../../libs/common/env";

interface GatewayContext {
  authorization?: string;
}

@Module({
  imports: [
    GraphQLModule.forRoot<ApolloGatewayDriverConfig>({
      driver: ApolloGatewayDriver,
      server: {
        // из HTTP-запроса в gateway достаём заголовок и кладём в контекст,
        // откуда его заберёт willSendRequest при походе в subgraph
        context: ({ req }: { req: Request }): GatewayContext => ({
          authorization: req.headers.authorization,
        }),
        // Отсекаем циклические запросы (Post.author → User.posts → …) ДО того,
        // как gateway начнёт раскручивать их подзапросами по subgraph'ам.
        validationRules: [depthLimit(GRAPHQL_MAX_DEPTH)],
      },
      gateway: {
        // Собирает supergraph, спросив у каждого subgraph'а его SDL. Удобно в
        // разработке, но привязывает СТАРТ gateway к доступности всех трёх.
        // В проде берут заранее собранный supergraph (rover supergraph compose)
        // или managed federation через Apollo GraphOS.
        supergraphSdl: new IntrospectAndCompose({
          subgraphs: [
            { name: "users", url: SUBGRAPH_URLS.users },
            { name: "posts", url: SUBGRAPH_URLS.posts },
            { name: "engagement", url: SUBGRAPH_URLS.engagement },
          ],
        }),
        // Gateway — не точка доверия: он лишь ПЕРЕСЫЛАЕТ Authorization дальше,
        // а проверяет токен каждый subgraph сам.
        buildService: ({ url }) =>
          new RemoteGraphQLDataSource<GatewayContext>({
            url,
            willSendRequest({ request, context }) {
              if (context.authorization) {
                request.http?.headers.set(
                  "authorization",
                  context.authorization,
                );
              }
            },
          }),
      },
    }),
  ],
})
export class GatewayModule {}
