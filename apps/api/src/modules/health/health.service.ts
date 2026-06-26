import { Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";

interface HealthStatusPayload {
  status: string;
  uptime: number;
  timestamp: string;
  env: string;
}

@Injectable()
export class HealthService {
  constructor(private readonly config: ConfigService) {}

  getStatus(): HealthStatusPayload {
    return {
      status: "ok",
      uptime: process.uptime(),
      timestamp: new Date().toISOString(),
      env: this.config.get<string>("nodeEnv") ?? "unknown",
    };
  }
}
