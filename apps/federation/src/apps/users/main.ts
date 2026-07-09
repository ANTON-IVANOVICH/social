import "reflect-metadata";
import { PORTS } from "../../libs/common/env";
import { bootstrapSubgraph } from "../../libs/common/subgraph";
import { UsersSubgraphModule } from "./users.module";

void bootstrapSubgraph(UsersSubgraphModule, PORTS.users, "users");
