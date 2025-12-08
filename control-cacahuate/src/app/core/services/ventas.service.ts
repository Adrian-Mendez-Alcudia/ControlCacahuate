import { Injectable, inject } from '@angular/core';
import {
  Firestore,
  collection,
  collectionData,
  doc,
  getDoc,
  deleteDoc,
  setDoc,
  updateDoc,
  Timestamp,
  query,
  where,
  limit,
  orderBy,
  runTransaction, // <--- LA CLAVE DEL ÉXITO
  increment,
} from '@angular/fire/firestore';
import { Observable, map } from 'rxjs';
import { Venta, CajaDiaria, Inventario, Cliente } from '../models/interfaces';
import { InventarioService } from './inventario.service';
import { ClientesService } from './clientes.service';
import { ConfiguracionService } from './configuracion.service';
import { generarId, obtenerFechaHoy } from '../utils/calculos.utils';

export interface ResultadoVenta {
  success: boolean;
  venta?: Venta;
  error?: string;
}

@Injectable({
  providedIn: 'root',
})
export class VentasService {
  private firestore = inject(Firestore);
  private inventarioService = inject(InventarioService);
  private clientesService = inject(ClientesService);
  private configuracionService = inject(ConfiguracionService);

  private ventasCollection = collection(this.firestore, 'ventas');
  private cajaCollection = collection(this.firestore, 'cajaDiaria');
  private inventarioCollection = collection(this.firestore, 'inventario');
  private clientesCollection = collection(this.firestore, 'clientes');

  async eliminarVenta(venta: Venta): Promise<void> {
    // Nota: Para eliminar también sería ideal una transacción,
    // pero por ahora mantenemos la lógica simple ya que es menos crítica.

    // 1. Reponer inventario
    await this.inventarioService.reponerInventario(
      venta.saborId,
      venta.cantidad
    );

    // 2. Si fue fiado, reducir deuda del cliente
    if (venta.tipoPago === 'fiado' && venta.clienteId) {
      const totalVenta = venta.cantidad * venta.precioUnitario;
      await this.clientesService.reducirDeuda(venta.clienteId, totalVenta);
    }

    // 3. Eliminar documento de venta
    await deleteDoc(doc(this.ventasCollection, venta.id));
  }

  /**
   * Procesa una venta completa DE FORMA ATÓMICA
   * O se guarda todo (Inventario, Venta, Deuda, Caja) o no se guarda nada.
   */
  async procesarVenta(datos: {
    saborId: string;
    cantidad: number;
    tipoPago: 'efectivo' | 'fiado';
    clienteId?: string;
    precioVenta?: number;
    nombreSaborSnapshot?: string;
  }): Promise<ResultadoVenta> {
    const idVenta = generarId();
    const fechaHoy = obtenerFechaHoy();

    // Referencias a documentos
    const inventarioRef = doc(this.inventarioCollection, datos.saborId);
    const cajaRef = doc(this.cajaCollection, fechaHoy);
    const ventaRef = doc(this.ventasCollection, idVenta);

    // Referencia opcional al cliente
    let clienteRef = null;
    if (datos.tipoPago === 'fiado' && datos.clienteId) {
      clienteRef = doc(this.clientesCollection, datos.clienteId);
    }

    try {
      await runTransaction(this.firestore, async (transaction) => {
        // ==========================================
        // 1. LECTURAS (Deben ir primero en la transacción)
        // ==========================================

        // A) Leer Inventario
        const invDoc = await transaction.get(inventarioRef);
        if (!invDoc.exists()) {
          throw new Error('El producto no existe en inventario');
        }
        const inventario = invDoc.data() as Inventario;

        if (inventario.cantidad < datos.cantidad) {
          throw new Error(
            `Stock insuficiente. Solo hay ${inventario.cantidad}`
          );
        }

        // B) Leer Caja (si existe)
        const cajaDoc = await transaction.get(cajaRef);

        // C) Leer Cliente (si es fiado) para validar que exista
        if (clienteRef) {
          const clienteDoc = await transaction.get(clienteRef);
          if (!clienteDoc.exists()) throw new Error('El cliente no existe');
        }

        // ==========================================
        // 2. CÁLCULOS
        // ==========================================
        const precioVenta =
          datos.precioVenta || this.configuracionService.getPrecioVenta();
        const totalVenta = datos.cantidad * precioVenta;
        const costoTotal = datos.cantidad * inventario.costoPromedioPonderado;

        const venta: Venta = {
          id: idVenta,
          saborId: datos.saborId,
          cantidad: datos.cantidad,
          precioUnitario: precioVenta,
          costoUnitario: inventario.costoPromedioPonderado,
          tipoPago: datos.tipoPago,
          fecha: Timestamp.now(),
        };

        if (datos.clienteId) venta.clienteId = datos.clienteId;
        if (datos.nombreSaborSnapshot)
          venta.nombreSaborSnapshot = datos.nombreSaborSnapshot;
        if (datos.tipoPago === 'fiado' && !datos.clienteId) {
          throw new Error('No se puede fiar sin asignar un cliente');
        }

        // ==========================================
        // 3. ESCRITURAS (Atomic updates)
        // ==========================================

        // A) Crear Venta
        transaction.set(ventaRef, venta);

        // B) Actualizar Inventario
        transaction.update(inventarioRef, {
          cantidad: inventario.cantidad - datos.cantidad,
          updatedAt: Timestamp.now(),
        });

        // C) Actualizar Deuda Cliente (Solo si es fiado)
        if (clienteRef && datos.tipoPago === 'fiado') {
          // Usamos increment para ser seguros, aunque dentro de transaccion podríamos sumar directo
          transaction.update(clienteRef, {
            saldoPendiente: increment(totalVenta),
          });
        }

        // D) Actualizar Caja Diaria
        if (!cajaDoc.exists()) {
          const nuevaCaja: CajaDiaria = {
            fecha: fechaHoy,
            efectivoVentas: datos.tipoPago === 'efectivo' ? totalVenta : 0,
            efectivoAbonos: 0,
            totalEfectivo: datos.tipoPago === 'efectivo' ? totalVenta : 0,
            ventasFiado: datos.tipoPago === 'fiado' ? totalVenta : 0,
            costoVendido: costoTotal,
          };
          transaction.set(cajaRef, nuevaCaja);
        } else {
          const caja = cajaDoc.data() as CajaDiaria;
          const updates: any = {
            costoVendido: (caja.costoVendido || 0) + costoTotal,
          };

          if (datos.tipoPago === 'efectivo') {
            const nuevoEfectivo = (caja.efectivoVentas || 0) + totalVenta;
            updates.efectivoVentas = nuevoEfectivo;
            updates.totalEfectivo = (caja.totalEfectivo || 0) + totalVenta;
          } else {
            updates.ventasFiado = (caja.ventasFiado || 0) + totalVenta;
          }

          transaction.update(cajaRef, updates);
        }
      });

      // Si llegamos aquí, TODO salió bien
      return { success: true, venta: { id: idVenta } as Venta }; // Retornamos objeto básico o completo si quieres
    } catch (e: any) {
      console.error('Error en transacción de venta:', e);
      return {
        success: false,
        error: e.message || 'Error procesando la venta',
      };
    }
  }

  // Actualizar nota de venta
  async actualizarNotaVenta(ventaId: string, nota: string): Promise<void> {
    const ventaRef = doc(this.ventasCollection, ventaId);
    await updateDoc(ventaRef, { notas: nota } as any);
  }

  // Obtener últimas ventas (Historial)
  getUltimasVentas$(): Observable<Venta[]> {
    const q = query(this.ventasCollection, orderBy('fecha', 'desc'), limit(50));
    return collectionData(q, { idField: 'id' }) as Observable<Venta[]>;
  }

  getVentasHoyReales$(): Observable<Venta[]> {
    const hoy = new Date();
    hoy.setHours(0, 0, 0, 0);
    const timestampHoy = Timestamp.fromDate(hoy);
    const q = query(this.ventasCollection, where('fecha', '>=', timestampHoy));
    return collectionData(q, { idField: 'id' }) as Observable<Venta[]>;
  }

  async registrarAbonoEnCaja(monto: number): Promise<void> {
    const fechaHoy = obtenerFechaHoy();
    const cajaRef = doc(this.cajaCollection, fechaHoy);
    const cajaSnapshot = await getDoc(cajaRef);

    if (cajaSnapshot.exists()) {
      const caja = cajaSnapshot.data() as CajaDiaria;
      await updateDoc(cajaRef, {
        efectivoAbonos: (caja.efectivoAbonos || 0) + monto,
        totalEfectivo: (caja.totalEfectivo || 0) + monto,
      });
    } else {
      await setDoc(cajaRef, {
        fecha: fechaHoy,
        efectivoVentas: 0,
        efectivoAbonos: monto,
        totalEfectivo: monto,
        ventasFiado: 0,
        costoVendido: 0,
      });
    }
  }

  async getCajaDiaHoy(): Promise<CajaDiaria | null> {
    const fechaHoy = obtenerFechaHoy();
    const cajaRef = doc(this.cajaCollection, fechaHoy);
    const snapshot = await getDoc(cajaRef);
    return snapshot.exists() ? (snapshot.data() as CajaDiaria) : null;
  }

  getCajaDia$(fecha?: string): Observable<CajaDiaria | null> {
    const fechaBuscar = fecha || obtenerFechaHoy();
    return collectionData(this.cajaCollection, { idField: 'fecha' }).pipe(
      map((cajas) => {
        const caja = (cajas as CajaDiaria[]).find(
          (c) => c.fecha === fechaBuscar
        );
        return caja || null;
      })
    );
  }
}
