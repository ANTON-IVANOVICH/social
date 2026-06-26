import { Query, Resolver } from "@nestjs/graphql";
import { HealthStatus } from "./health.model";
import { HealthService } from "./health.service";

@Resolver(() => HealthStatus)
export class HealthResolver {
  constructor(private readonly healthService: HealthService) {}

  @Query(() => HealthStatus, { description: "Liveness/health probe" })
  health(): HealthStatus {
    return this.healthService.getStatus();
  }
}
