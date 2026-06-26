import { createUnionType } from "@nestjs/graphql";
import { Post } from "../../posts/models/post.model";
import { SuggestedUser } from "./suggested-user.model";

export const FeedItem = createUnionType({
  name: "FeedItem",
  types: () => [Post, SuggestedUser] as const,
  resolveType: (value) => ("content" in value ? Post : SuggestedUser),
});
