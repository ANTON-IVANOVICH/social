import DataLoader from "dataloader";
import { Post, ReactionType, User } from "@prisma/client";

export interface IDataLoaders {
  userById: DataLoader<string, User | null>;
  postById: DataLoader<string, Post | null>;
  reactionCountByPostId: DataLoader<string, number>;
  commentCountByPostId: DataLoader<string, number>;
  // составной ключ (postId, userId) → строковый ключ кэша (третий параметр)
  myReactionByPostUser: DataLoader<
    { postId: string; userId: string },
    ReactionType | null,
    string
  >;
}
