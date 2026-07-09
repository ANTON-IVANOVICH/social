import { UserRole } from "@prisma/client";

// Формат полезной нагрузки токена совпадает с монолитом: токены выдаёт он,
// а subgraph'ы их только проверяют. Общий JWT_SECRET — часть контракта.
export interface JwtPayload {
  sub: string;
  username: string;
  role: UserRole;
}

export interface AuthUser {
  userId: string;
  username: string;
  role: UserRole;
}
