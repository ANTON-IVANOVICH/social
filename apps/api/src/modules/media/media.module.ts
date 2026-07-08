import { Module } from "@nestjs/common";
import { UsersModule } from "../users/users.module";
import { MediaService } from "./media.service";
import { MediaProcessor } from "./media.processor";
import { MediaResolver } from "./media.resolver";

@Module({
  imports: [UsersModule],
  providers: [MediaService, MediaProcessor, MediaResolver],
})
export class MediaModule {}
