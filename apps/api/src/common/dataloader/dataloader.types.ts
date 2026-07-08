import DataLoader from "dataloader";
import { Comment, Post, ReactionType, User } from "@prisma/client";

export interface IDataLoaders {
  userById: DataLoader<string, User | null>;
  postById: DataLoader<string, Post | null>;
  reactionCountByPostId: DataLoader<string, number>;
  commentCountByPostId: DataLoader<string, number>;
  commentsByPostId: DataLoader<string, Comment[]>;
  // составной ключ (postId, userId) → строковый ключ кэша (третий параметр)
  myReactionByPostUser: DataLoader<
    { postId: string; userId: string },
    ReactionType | null,
    string
  >;
}
