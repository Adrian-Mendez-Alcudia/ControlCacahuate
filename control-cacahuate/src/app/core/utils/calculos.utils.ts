// ============================================
// UTILIDADES DE CÁLCULO
// ============================================

import { Inventario, LoteProduccion } from '../models/interfaces';

/**
 * Calcula el costo unitario de un lote de producción
 */
export function calcularCostoUnitarioLote(
  costoKilo: number,
  bolsasResultantes: number
): number {
  if (bolsasResultantes <= 0) {
    throw new Error('Las bolsas resultantes deben ser mayor a 0');
  }
  return Math.round((costoKilo / bolsasResultantes) * 100) / 100;
}

/**
 * Calcula el nuevo costo promedio ponderado al agregar un lote
 */
export function calcularCostoPromedioPonderado(
  inventarioActual: Inventario | null | undefined,
  nuevoLote: { bolsas: number; costoUnitario: number }
): number {
  if (!inventarioActual || inventarioActual.cantidad === 0) {
    return nuevoLote.costoUnitario;
  }

  const valorExistente =
    inventarioActual.cantidad * inventarioActual.costoPromedioPonderado;
  const valorNuevo = nuevoLote.bolsas * nuevoLote.costoUnitario;
  const cantidadTotal = inventarioActual.cantidad + nuevoLote.bolsas;

  return (
    Math.round(((valorExistente + valorNuevo) / cantidadTotal) * 100) / 100
  );
}

/**
 * Calcula la utilidad de una venta
 */
export function calcularUtilidadVenta(
  precioVenta: number,
  costoUnitario: number,
  cantidad: number = 1
): number {
  const ingreso = cantidad * precioVenta;
  const costo = cantidad * costoUnitario;
  return Math.round((ingreso - costo) * 100) / 100;
}

/**
 * Calcula el margen de ganancia en porcentaje
 */
export function calcularMargenPorcentaje(
  costoUnitario: number,
  precioVenta: number
): number {
  if (precioVenta <= 0) return 0;
  const utilidad = precioVenta - costoUnitario;
  return Math.round((utilidad / precioVenta) * 100);
}

/**
 * Calcula el valor total del inventario
 */
export function calcularValorInventario(inventarios: Inventario[]): number {
  return inventarios.reduce((total, inv) => {
    return total + inv.cantidad * inv.costoPromedioPonderado;
  }, 0);
}

/**
 * Calcula el rendimiento promedio de bolsas por kilo
 */
export function calcularRendimientoPromedio(lotes: LoteProduccion[]): number {
  if (lotes.length === 0) return 0;
  const totalBolsas = lotes.reduce(
    (sum, lote) => sum + lote.bolsasResultantes,
    0
  );
  return Math.round((totalBolsas / lotes.length) * 10) / 10;
}

/**
 * Formatea un número como moneda mexicana
 */
export function formatearMoneda(valor: number): string {
  return new Intl.NumberFormat('es-MX', {
    style: 'currency',
    currency: 'MXN',
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  }).format(valor);
}

/**
 * Obtiene la fecha de hoy en formato YYYY-MM-DD
 */
export function obtenerFechaHoy(): string {
  return new Date().toISOString().split('T')[0];
}

/**
 * Verifica si una fecha promesa está vencida
 */
export function estaFechaVencida(
  fechaPromesa: Date | null | undefined
): boolean {
  if (!fechaPromesa) return false;
  const hoy = new Date();
  hoy.setHours(0, 0, 0, 0);
  const promesa = new Date(fechaPromesa);
  promesa.setHours(0, 0, 0, 0);
  return hoy > promesa;
}

/**
 * Calcula los días de vencimiento
 */
export function calcularDiasVencimiento(
  fechaPromesa: Date | null | undefined
): number | null {
  if (!fechaPromesa) return null;
  const hoy = new Date();
  hoy.setHours(0, 0, 0, 0);
  const promesa = new Date(fechaPromesa);
  promesa.setHours(0, 0, 0, 0);
  const diffTime = hoy.getTime() - promesa.getTime();
  return Math.ceil(diffTime / (1000 * 60 * 60 * 24));
}

/**
 * Genera un ID único
 */
export function generarId(): string {
  return Math.random().toString(36).substr(2, 9) + Date.now().toString(36);
}
