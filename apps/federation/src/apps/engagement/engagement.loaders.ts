import DataLoader from "dataloader";
import { Reaction } from "@prisma/client";
import { PrismaService } from "../../libs/common/prisma.service";

export interface EngagementLoaders {
  reactionsByPostId: DataLoader<string, Reaction[]>;
  reactionCountByPostId: DataLoader<string, number>;
}

export function createEngagementLoaders(
  prisma: PrismaService,
): EngagementLoaders {
  return {
    reactionsByPostId: new DataLoader<string, Reaction[]>(async (postIds) => {
      const reactions = await prisma.reaction.findMany({
        where: { postId: { in: postIds as string[] } },
      });
      const byPost = new Map<string, Reaction[]>();
      for (const r of reactions) {
        const bucket = byPost.get(r.postId);
        if (bucket) bucket.push(r);
        else byPost.set(r.postId, [r]);
      }
      return postIds.map((id) => byPost.get(id) ?? []);
    }),

    // groupBy вместо N штук count(): один запрос на всю пачку постов,
    // которую gateway прислал представлениями
    reactionCountByPostId: new DataLoader<string, number>(async (postIds) => {
      const grouped = await prisma.reaction.groupBy({
        by: ["postId"],
        where: { postId: { in: postIds as string[] } },
        _count: { _all: true },
      });
      const counts = new Map(grouped.map((g) => [g.postId, g._count._all]));
      return postIds.map((id) => counts.get(id) ?? 0);
    }),
  };
}
