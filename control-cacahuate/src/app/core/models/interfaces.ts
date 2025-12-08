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
  nombreSaborSnapshot?: string; // Para historial histórico
}

export interface Abono {
  id: string;
  clienteId: string;
  monto: number;
  fecha: Timestamp;
  notas?: string;
}

// ============================================
// ESTADO DE CUENTA (EL QUE FALTABA)
// ============================================
export interface MovimientoCuenta {
  id: string;
  fecha: Timestamp;
  tipo: 'CARGO' | 'ABONO';
  descripcion: string;
  monto: number;
  saldoAcumulado: number;
}

// ============================================
// CAJA Y CORTE
// ============================================

export interface CajaDiaria {
  fecha: string; // ID del documento (YYYY-MM-DD)
  efectivoVentas: number;
  efectivoAbonos: number;
  totalEfectivo: number;
  ventasFiado: number;
  costoVendido: number;

  // Campos de corte
  corteRealizado?: boolean;
  datosCorte?: CorteDeCaja;
}

export interface CorteDeCaja {
  id?: string;
  fecha: Timestamp;
  fechaDia: string; // YYYY-MM-DD
  esperadoEnCaja: number;
  contadoEnCaja: number;
  diferencia: number;
  montoRetirado: number;
  fondoCajaManana: number;
  notas?: string;
}

// ============================================
// CONFIGURACIÓN Y CONSTANTES
// ============================================

export interface ConfiguracionNegocio {
  id: string;
  precioVentaDefault: number;
  nombreNegocio: string;
  moneda: string;
  updatedAt: Timestamp;
}

export const COLORES_DISPONIBLES: string[] = [
  '#EF4444',
  '#F59E0B',
  '#F97316',
  '#EAB308',
  '#84CC16',
  '#22C55E',
  '#10B981',
  '#14B8A6',
  '#06B6D4',
  '#0EA5E9',
  '#3B82F6',
  '#6366F1',
  '#8B5CF6',
  '#A855F7',
  '#D946EF',
  '#EC4899',
  '#F43F5E',
  '#6B7280',
];

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
