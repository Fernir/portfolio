/**
 * Единственная локальная карта под `public/q2/maps/`.
 * Без `?bsp=` в URL загружается `DEFAULT_BSP_FALLBACK_CHAIN[0]`.
 */
export const DEFAULT_BSP_PATH = '/q2/maps/urbanjungle.bsp' as const;

export const DEFAULT_BSP_FALLBACK_CHAIN: readonly string[] = [DEFAULT_BSP_PATH];
