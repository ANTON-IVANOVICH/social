import { Module } from "@nestjs/common";
import { ReactionsService } from "./reactions.service";
import { ReactionsResolver } from "./reactions.resolver";

@Module({
  providers: [ReactionsService, ReactionsResolver],
  exports: [ReactionsService], // нужен DataLoaderModule
})
export class ReactionsModule {}
