import { Timestamp } from '@angular/fire/firestore';

// ============================================
// ENTIDADES PRINCIPALES
// ============================================

export interface Sabor {
  id: string;
  nombre: string;
  emoji: string;
  color: string;
  activo: boolean;
  createdAt: Timestamp;
}

export interface LoteProduccion {
  id: string;
  saborId: string;
  costoKilo: number;
  bolsasResultantes: number;
  costoUnitario: number;
  fechaProduccion: Timestamp;
  notas?: string;
}

export interface Inventario {
  saborId: string;
  cantidad: number;
  costoPromedioPonderado: number;
  updatedAt: Timestamp;
}

export interface Cliente {
  id: string;
  alias: string;
  telefono?: string;
  notas?: string;
  saldoPendiente: number;
  fechaPromesaPago?: Timestamp;
  createdAt: Timestamp;
}

export interface Venta {
  id: string;
  saborId: string;
  cantidad: number;
  precioUnitario: number;
  costoUnitario: number;
  tipoPago: 'efectivo' | 'fiado';
  clienteId?: string;
  fecha: Timestamp;
}

export interface Abono {
  id: string;
  clienteId: string;
  monto: number;
  fecha: Timestamp;
  notas?: string;
}

export interface CajaDiaria {
  fecha: string;
  efectivoVentas: number;
  efectivoAbonos: number;
  totalEfectivo: number;
  ventasFiado: number;
  costoVendido: number;
}

// ============================================
// CONFIGURACIÓN DEL NEGOCIO (EDITABLE)
// ============================================

export interface ConfiguracionNegocio {
  id: string;
  precioVentaDefault: number;
  nombreNegocio: string;
  moneda: string;
  updatedAt: Timestamp;
}

// ============================================
// COLORES PREDEFINIDOS PARA SELECTOR
// ============================================

export const COLORES_DISPONIBLES: string[] = [
  '#EF4444', // Rojo
  '#F59E0B', // Naranja
  '#F97316', // Naranja oscuro
  '#EAB308', // Amarillo
  '#84CC16', // Lima
  '#22C55E', // Verde
  '#10B981', // Esmeralda
  '#14B8A6', // Teal
  '#06B6D4', // Cyan
  '#0EA5E9', // Celeste
  '#3B82F6', // Azul
  '#6366F1', // Indigo
  '#8B5CF6', // Violeta
  '#A855F7', // Púrpura
  '#D946EF', // Fucsia
  '#EC4899', // Rosa
  '#F43F5E', // Rosa rojo
  '#6B7280', // Gris
];

// ============================================
// EMOJIS SUGERIDOS PARA SABORES
// ============================================

export const EMOJIS_SUGERIDOS: string[] = [
  '🥜',
  '🌶️',
  '🧂',
  '🍯',
  '🔥',
  '🌿',
  '🍋',
  '🧀',
  '🥓',
  '🌽',
  '🥕',
  '🍫',
  '🍬',
  '☀️',
  '🌙',
  '⭐',
  '💛',
  '❤️',
  '💚',
  '💙',
  '🟠',
  '🟡',
  '🟢',
  '🔴',
];
