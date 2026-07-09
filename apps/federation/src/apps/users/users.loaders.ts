import DataLoader from "dataloader";
import { User } from "@prisma/client";
import { PrismaService } from "../../libs/common/prisma.service";

export interface UsersLoaders {
  userById: DataLoader<string, User | null>;
}

export function createUsersLoaders(prisma: PrismaService): UsersLoaders {
  return {
    userById: new DataLoader<string, User | null>(async (ids) => {
      const users = await prisma.user.findMany({
        where: { id: { in: ids as string[] } },
      });
      const byId = new Map(users.map((u) => [u.id, u]));
      return ids.map((id) => byId.get(id) ?? null);
    }),
  };
}
