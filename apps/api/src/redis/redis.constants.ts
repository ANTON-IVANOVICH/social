// Injection-токены Redis-клиентов. Строки, а не Symbol — удобнее в @Inject().
export const REDIS_CLIENT = "REDIS_CLIENT";
export const REDIS_PUBLISHER = "REDIS_PUBLISHER";
export const REDIS_SUBSCRIBER = "REDIS_SUBSCRIBER";
