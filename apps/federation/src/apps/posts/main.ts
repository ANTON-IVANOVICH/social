import "reflect-metadata";
import { PORTS } from "../../libs/common/env";
import { bootstrapSubgraph } from "../../libs/common/subgraph";
import { PostsSubgraphModule } from "./posts.module";

void bootstrapSubgraph(PostsSubgraphModule, PORTS.posts, "posts");
