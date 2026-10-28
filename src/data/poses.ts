const poseModules = import.meta.glob('../imagens/imagensposes/*', { eager: true }) as Record<string, { default: string }>;
export const POSES: string[] = Object.values(poseModules).map(m => m.default);
