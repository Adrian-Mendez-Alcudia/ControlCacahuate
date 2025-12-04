import { Injectable, inject } from '@angular/core';
import {
  Firestore,
  collection,
  collectionData,
  doc,
  getDoc,
  setDoc,
  updateDoc,
  Timestamp,
} from '@angular/fire/firestore';
import { Observable, map } from 'rxjs';
import { Venta, CajaDiaria } from '../models/interfaces';
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

  /**
   * Procesa una venta completa
   */
  async procesarVenta(datos: {
    saborId: string;
    cantidad?: number;
    tipoPago: 'efectivo' | 'fiado';
    clienteId?: string;
    precioVenta?: number;
  }): Promise<ResultadoVenta> {
    const cantidad = datos.cantidad || 1;
    const precioVenta =
      datos.precioVenta || this.configuracionService.getPrecioVenta();

    // 1. Verificar que si es fiado, tenga cliente
    if (datos.tipoPago === 'fiado' && !datos.clienteId) {
      return {
        success: false,
        error: 'Debe seleccionar un cliente para venta fiada',
      };
    }

    // 2. Descontar inventario
    const resultadoInventario =
      await this.inventarioService.descontarInventario(datos.saborId, cantidad);

    if (!resultadoInventario.success) {
      return {
        success: false,
        error: `Stock insuficiente. Disponible: ${resultadoInventario.inventarioRestante}`,
      };
    }

    // 3. Crear registro de venta
    const id = generarId();
    const venta: Venta = {
      id,
      saborId: datos.saborId,
      cantidad,
      precioUnitario: precioVenta,
      costoUnitario: resultadoInventario.costoUnitario,
      tipoPago: datos.tipoPago,
      clienteId: datos.clienteId,
      fecha: Timestamp.now(),
    };

    // 4. Actualizar caja del día
    const montoVenta = cantidad * precioVenta;
    const costoVenta = cantidad * resultadoInventario.costoUnitario;
    await this.actualizarCajaDiaria(datos.tipoPago, montoVenta, costoVenta);

    // 5. Si es fiado, actualizar deuda del cliente
    if (datos.tipoPago === 'fiado' && datos.clienteId) {
      await this.clientesService.agregarDeuda(datos.clienteId, montoVenta);
    }

    // 6. Guardar la venta
    await setDoc(doc(this.ventasCollection, id), venta);

    const utilidad = montoVenta - costoVenta;
    console.log(
      `💰 Venta: $${montoVenta} | Costo: $${costoVenta} | Utilidad: $${utilidad}`
    );

    return { success: true, venta };
  }

  /**
   * Actualiza la caja del día
   */
  private async actualizarCajaDiaria(
    tipoPago: 'efectivo' | 'fiado',
    montoVenta: number,
    costoVenta: number
  ): Promise<void> {
    const fechaHoy = obtenerFechaHoy();
    const cajaRef = doc(this.cajaCollection, fechaHoy);
    const cajaSnapshot = await getDoc(cajaRef);

    if (cajaSnapshot.exists()) {
      const cajaActual = cajaSnapshot.data() as CajaDiaria;

      await updateDoc(cajaRef, {
        efectivoVentas:
          tipoPago === 'efectivo'
            ? cajaActual.efectivoVentas + montoVenta
            : cajaActual.efectivoVentas,
        ventasFiado:
          tipoPago === 'fiado'
            ? cajaActual.ventasFiado + montoVenta
            : cajaActual.ventasFiado,
        costoVendido: cajaActual.costoVendido + costoVenta,
        totalEfectivo:
          tipoPago === 'efectivo'
            ? cajaActual.totalEfectivo + montoVenta
            : cajaActual.totalEfectivo,
      });
    } else {
      const nuevaCaja: CajaDiaria = {
        fecha: fechaHoy,
        efectivoVentas: tipoPago === 'efectivo' ? montoVenta : 0,
        efectivoAbonos: 0,
        totalEfectivo: tipoPago === 'efectivo' ? montoVenta : 0,
        ventasFiado: tipoPago === 'fiado' ? montoVenta : 0,
        costoVendido: costoVenta,
      };

      await setDoc(cajaRef, nuevaCaja);
    }
  }

  /**
   * Registra un abono en la caja
   */
  async registrarAbonoEnCaja(monto: number): Promise<void> {
    const fechaHoy = obtenerFechaHoy();
    const cajaRef = doc(this.cajaCollection, fechaHoy);
    const cajaSnapshot = await getDoc(cajaRef);

    if (cajaSnapshot.exists()) {
      const cajaActual = cajaSnapshot.data() as CajaDiaria;
      await updateDoc(cajaRef, {
        efectivoAbonos: cajaActual.efectivoAbonos + monto,
        totalEfectivo: cajaActual.totalEfectivo + monto,
      });
    } else {
      const nuevaCaja: CajaDiaria = {
        fecha: fechaHoy,
        efectivoVentas: 0,
        efectivoAbonos: monto,
        totalEfectivo: monto,
        ventasFiado: 0,
        costoVendido: 0,
      };
      await setDoc(cajaRef, nuevaCaja);
    }
  }

  /**
   * Obtiene la caja del día actual
   */
  async getCajaDiaActual(): Promise<CajaDiaria | null> {
    const fechaHoy = obtenerFechaHoy();
    const cajaRef = doc(this.cajaCollection, fechaHoy);
    const snapshot = await getDoc(cajaRef);

    if (!snapshot.exists()) {
      return null;
    }

    return snapshot.data() as CajaDiaria;
  }

  /**
   * Obtiene la caja del día en tiempo real
   */
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

  /**
   * Obtiene las ventas del día
   */
  getVentasHoy$(): Observable<Venta[]> {
    const fechaHoy = obtenerFechaHoy();
    const inicioDelDia = new Date(fechaHoy);
    inicioDelDia.setHours(0, 0, 0, 0);

    return collectionData(this.ventasCollection, { idField: 'id' }).pipe(
      map((ventas) =>
        (ventas as Venta[])
          .filter((v) => v.fecha.toDate() >= inicioDelDia)
          .sort((a, b) => b.fecha.toMillis() - a.fecha.toMillis())
      )
    );
  }

  /**
   * Obtiene todas las ventas
   */
  getAllVentas$(): Observable<Venta[]> {
    return collectionData(this.ventasCollection, { idField: 'id' }).pipe(
      map((ventas) =>
        (ventas as Venta[]).sort(
          (a, b) => b.fecha.toMillis() - a.fecha.toMillis()
        )
      )
    );
  }
}
