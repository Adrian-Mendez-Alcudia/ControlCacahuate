import { Injectable, inject } from '@angular/core';
import {
  Firestore,
  collection,
  collectionData,
  doc,
  getDoc,
  updateDoc,
  Timestamp,
  runTransaction, // Importante para la consistencia de datos
} from '@angular/fire/firestore';
import { Observable, map } from 'rxjs';
import { Inventario, LoteProduccion } from '../models/interfaces';
import {
  calcularCostoUnitarioLote,
  calcularCostoPromedioPonderado,
  generarId,
} from '../utils/calculos.utils';

@Injectable({
  providedIn: 'root',
})
export class InventarioService {
  private firestore = inject(Firestore);
  private inventarioCollection = collection(this.firestore, 'inventario');
  private lotesCollection = collection(this.firestore, 'lotes');

  /**
   * Obtiene todo el inventario en tiempo real
   */
  getInventario$(): Observable<Inventario[]> {
    return collectionData(this.inventarioCollection, {
      idField: 'saborId',
    }) as Observable<Inventario[]>;
  }

  /**
   * Registra un lote y actualiza inventario de forma ATÓMICA
   * Evita corrupción de datos si falla la red a mitad del proceso.
   */
  async registrarLote(datos: {
    saborId: string;
    costoKilo: number;
    bolsasResultantes: number;
    notas?: string;
  }): Promise<LoteProduccion> {
    const loteId = generarId();
    const inventarioRef = doc(this.inventarioCollection, datos.saborId);
    const loteRef = doc(this.lotesCollection, loteId);

    // Ejecutamos todo dentro de una transacción
    return await runTransaction(this.firestore, async (transaction) => {
      // 1. Leer inventario actual (Lectura bloqueante para la transacción)
      const inventarioDoc = await transaction.get(inventarioRef);
      const inventarioActual = inventarioDoc.exists()
        ? (inventarioDoc.data() as Inventario)
        : null;

      // 2. Calcular costos
      const costoUnitarioLote = calcularCostoUnitarioLote(
        datos.costoKilo,
        datos.bolsasResultantes
      );

      const nuevoCostoPromedio = calcularCostoPromedioPonderado(
        inventarioActual,
        {
          bolsas: datos.bolsasResultantes,
          costoUnitario: costoUnitarioLote,
        }
      );

      const nuevaCantidad =
        (inventarioActual?.cantidad || 0) + datos.bolsasResultantes;

      // 3. Preparar objetos
      const nuevoLote: LoteProduccion = {
        id: loteId,
        saborId: datos.saborId,
        costoKilo: datos.costoKilo,
        bolsasResultantes: datos.bolsasResultantes,
        costoUnitario: costoUnitarioLote,
        fechaProduccion: Timestamp.now(),
        notas: datos.notas || '',
      };

      // 4. Escrituras (Se ejecutan todas juntas al final)
      transaction.set(loteRef, nuevoLote);

      transaction.set(
        inventarioRef,
        {
          saborId: datos.saborId,
          cantidad: nuevaCantidad,
          costoPromedioPonderado: nuevoCostoPromedio,
          updatedAt: Timestamp.now(),
        },
        { merge: true }
      );

      return nuevoLote;
    });
  }

  /**
   * Descuenta unidades del inventario (usado por ventas)
   * También validado para evitar stock negativo en condiciones de carrera
   */
  async descontarInventario(
    saborId: string,
    cantidad: number = 1
  ): Promise<{
    success: boolean;
    costoUnitario: number;
    inventarioRestante: number;
  }> {
    const inventarioRef = doc(this.inventarioCollection, saborId);

    try {
      return await runTransaction(this.firestore, async (transaction) => {
        const docSnap = await transaction.get(inventarioRef);

        if (!docSnap.exists()) {
          throw new Error('El producto no existe en inventario');
        }

        const inventario = docSnap.data() as Inventario;

        if (inventario.cantidad < cantidad) {
          throw new Error(
            `Stock insuficiente. Solo hay ${inventario.cantidad}`
          );
        }

        const nuevaCantidad = inventario.cantidad - cantidad;

        transaction.update(inventarioRef, {
          cantidad: nuevaCantidad,
          updatedAt: Timestamp.now(),
        });

        return {
          success: true,
          costoUnitario: inventario.costoPromedioPonderado,
          inventarioRestante: nuevaCantidad,
        };
      });
    } catch (error: any) {
      console.warn('Error descontando inventario:', error.message);
      return {
        success: false,
        costoUnitario: 0,
        inventarioRestante: 0, // Dato referencial en caso de error
      };
    }
  }

  getLotes$(): Observable<LoteProduccion[]> {
    return collectionData(this.lotesCollection, { idField: 'id' }).pipe(
      map((lotes) =>
        (lotes as LoteProduccion[]).sort(
          (a, b) => b.fechaProduccion.toMillis() - a.fechaProduccion.toMillis()
        )
      )
    );
  }
}
