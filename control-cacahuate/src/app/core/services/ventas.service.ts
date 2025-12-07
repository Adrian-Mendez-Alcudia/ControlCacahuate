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
    cantidad: number;
    tipoPago: 'efectivo' | 'fiado';
    clienteId?: string;
    precioVenta?: number;
    nombreSaborSnapshot?: string;
  }): Promise<ResultadoVenta> {
    const cantidad = datos.cantidad;
    const precioVenta =
      datos.precioVenta || this.configuracionService.getPrecioVenta();

    // 1. Validaciones
    if (cantidad <= 0) {
      return { success: false, error: 'Cantidad inválida' };
    }

    if (datos.tipoPago === 'fiado' && !datos.clienteId) {
      return {
        success: false,
        error: 'Falta seleccionar cliente para fiado',
      };
    }

    // 2. Descontar inventario
    const resultadoInventario =
      await this.inventarioService.descontarInventario(datos.saborId, cantidad);

    if (!resultadoInventario.success) {
      return {
        success: false,
        error: `Solo quedan ${resultadoInventario.inventarioRestante} bolsas disponibles`,
      };
    }

    // 3. Calcular montos
    const montoTotalVenta = cantidad * precioVenta;
    const costoTotalVenta = cantidad * resultadoInventario.costoUnitario;

    // 4. Crear objeto Venta (CORRECCIÓN AQUÍ)
    const id = generarId();

    // Inicializamos el objeto sin campos opcionales para evitar 'undefined'
    const venta: Venta = {
      id,
      saborId: datos.saborId,
      cantidad,
      precioUnitario: precioVenta,
      costoUnitario: resultadoInventario.costoUnitario,
      tipoPago: datos.tipoPago,
      fecha: Timestamp.now(),
    };

    // Agregamos clienteId SOLO si tiene valor real
    if (datos.clienteId) {
      venta.clienteId = datos.clienteId;
    }

    // Agregamos nombreSaborSnapshot SOLO si tiene valor real
    if (datos.nombreSaborSnapshot) {
      venta.nombreSaborSnapshot = datos.nombreSaborSnapshot;
    }

    // 5. Guardar en paralelo
    const promesas: Promise<any>[] = [
      setDoc(doc(this.ventasCollection, id), venta),
      this.actualizarCajaDiaria(
        datos.tipoPago,
        montoTotalVenta,
        costoTotalVenta
      ),
    ];

    if (datos.tipoPago === 'fiado' && datos.clienteId) {
      promesas.push(
        this.clientesService.agregarDeuda(datos.clienteId, montoTotalVenta)
      );
    }

    try {
      await Promise.all(promesas);
      return { success: true, venta };
    } catch (error: any) {
      console.error('Error crítico guardando venta:', error);
      return { success: false, error: 'Error guardando datos de venta' };
    }
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
      const caja = cajaSnapshot.data() as CajaDiaria;

      const updates: any = {
        costoVendido: (caja.costoVendido || 0) + costoVenta,
      };

      if (tipoPago === 'efectivo') {
        updates.efectivoVentas = (caja.efectivoVentas || 0) + montoVenta;
        updates.totalEfectivo = (caja.totalEfectivo || 0) + montoVenta;
      } else {
        updates.ventasFiado = (caja.ventasFiado || 0) + montoVenta;
      }

      await updateDoc(cajaRef, updates);
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

    if (!snapshot.exists()) {
      return null;
    }

    return snapshot.data() as CajaDiaria;
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
}
