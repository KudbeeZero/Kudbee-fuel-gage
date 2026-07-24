import { z } from 'zod';

export const Vector3dSchema = z.object({
  x: z.number(),
  y: z.number(),
  z: z.number()
});
export type Vector3d = z.infer<typeof Vector3dSchema>;

export const SafeZoneIdSchema = z.string().min(1).max(64);
export type SafeZoneId = z.infer<typeof SafeZoneIdSchema>;

export const SafeZoneStatusSchema = z.enum(['ACTIVE', 'BREACHED', 'LOCKED']);
export type SafeZoneStatus = z.infer<typeof SafeZoneStatusSchema>;

export const SafeZoneConfigSchema = z.object({
  id: SafeZoneIdSchema,
  name: z.string().min(1).max(128),
  vector: Vector3dSchema,
  radius: z.number().positive().default(10),
  max_threat_score: z.number().min(0).max(1).default(0.7),
  lockout_duration_ms: z.number().int().nonnegative().default(5000),
  status: SafeZoneStatusSchema.default('ACTIVE'),
  owner: z.string().min(1).optional()
});
export type SafeZoneConfig = z.infer<typeof SafeZoneConfigSchema>;

export const TrajectoryInterceptSchema = z.object({
  id: z.string().min(1),
  zone_id: SafeZoneIdSchema,
  trajectory_hash: z.string().min(1),
  threat_score: z.number().min(0).max(1),
  intercepted: z.boolean().default(false),
  action: z.string().optional(),
  timestamp: z.string().datetime().optional()
});
export type TrajectoryIntercept = z.infer<typeof TrajectoryInterceptSchema>;

export const EngineStateSchema = z.object({
  initialized: z.boolean().default(false),
  zones_count: z.number().int().nonnegative().default(0),
  active_intercepts: z.number().int().nonnegative().default(0),
  last_event_at: z.string().datetime().optional()
});
export type EngineState = z.infer<typeof EngineStateSchema>;

export const TelemetryEventSchema = z.object({
  zone_id: SafeZoneIdSchema,
  vector: Vector3dSchema,
  velocity: z.number().nonnegative().default(0),
  threat_score: z.number().min(0).max(1).default(0),
  status: SafeZoneStatusSchema.default('ACTIVE'),
  timestamp: z.string().datetime().optional()
});
export type TelemetryEvent = z.infer<typeof TelemetryEventSchema>;

export const MintOptionsSchema = z.object({
  spatial_coordinates: z.tuple([z.number(), z.number(), z.number()]),
  scale_factor: z.number().positive().default(1),
  proven_mode: z.boolean().default(false)
});
export type MintOptions = z.infer<typeof MintOptionsSchema>;

export const MintedTokenSchema = z.object({
  id: z.string().min(1),
  token_hash: z.string().min(1),
  spatial_coordinates: z.tuple([z.number(), z.number(), z.number()]),
  kd: z.number().min(0),
  efficacy: z.number().min(0).max(1),
  status: z.enum(['PENDING_APPROVAL', 'VERIFIED', 'RECYCLED', 'PROVEN']),
  token_cost: z.number().min(0),
  created_at: z.string().datetime().optional()
});
export type MintedToken = z.infer<typeof MintedTokenSchema>;

export const SafeZoneEngineConfigSchema = z.object({
  mode: z.enum(['strict', 'observability', 'disabled']).default('strict'),
  autoBootstrap: z.boolean().default(false)
});
export type SafeZoneEngineConfig = z.infer<typeof SafeZoneEngineConfigSchema>;
