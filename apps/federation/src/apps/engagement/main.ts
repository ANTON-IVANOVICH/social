import "reflect-metadata";
import { PORTS } from "../../libs/common/env";
import { bootstrapSubgraph } from "../../libs/common/subgraph";
import { EngagementSubgraphModule } from "./engagement.module";

void bootstrapSubgraph(EngagementSubgraphModule, PORTS.engagement, "engagement");
