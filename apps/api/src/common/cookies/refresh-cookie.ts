import { Response } from "express";

export const REFRESH_COOKIE = "refresh_token";
const MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000; // 30 дней — совпадает с TTL refresh-токена

// httpOnly-cookie недоступна JS → refresh-токен защищён от XSS-кражи.
// secure: только по HTTPS в проде. sameSite: lax — отправляется на same-site запросы.
export function setRefreshCookie(
  res: Response,
  token: string,
  isProd: boolean,
): void {
  res.cookie(REFRESH_COOKIE, token, {
    httpOnly: true,
    secure: isProd,
    sameSite: "lax",
    path: "/",
    maxAge: MAX_AGE_MS,
  });
}

export function clearRefreshCookie(res: Response, isProd: boolean): void {
  res.clearCookie(REFRESH_COOKIE, {
    httpOnly: true,
    secure: isProd,
    sameSite: "lax",
    path: "/",
  });
}
