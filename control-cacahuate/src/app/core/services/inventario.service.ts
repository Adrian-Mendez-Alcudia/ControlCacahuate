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
   * Obtiene el inventario de un sabor específico
   */
  async getInventarioPorSabor(saborId: string): Promise<Inventario | null> {
    const docRef = doc(this.inventarioCollection, saborId);
    const snapshot = await getDoc(docRef);

    if (!snapshot.exists()) {
      return null;
    }

    return { saborId, ...snapshot.data() } as Inventario;
  }

  /**
   * Registra un nuevo lote de producción y actualiza el inventario
   */
  async registrarLote(datos: {
    saborId: string;
    costoKilo: number;
    bolsasResultantes: number;
    notas?: string;
  }): Promise<LoteProduccion> {
    // 1. Calcular costo unitario del lote
    const costoUnitario = calcularCostoUnitarioLote(
      datos.costoKilo,
      datos.bolsasResultantes
    );

    // 2. Crear el registro del lote
    const id = generarId();
    const nuevoLote: LoteProduccion = {
      id,
      saborId: datos.saborId,
      costoKilo: datos.costoKilo,
      bolsasResultantes: datos.bolsasResultantes,
      costoUnitario,
      fechaProduccion: Timestamp.now(),
      notas: datos.notas,
    };

    // 3. Obtener inventario actual
    const inventarioActual = await this.getInventarioPorSabor(datos.saborId);

    // 4. Calcular nuevo costo promedio ponderado
    const nuevoCostoPromedio = calcularCostoPromedioPonderado(
      inventarioActual,
      { bolsas: datos.bolsasResultantes, costoUnitario }
    );

    // 5. Preparar nuevo inventario
    const nuevaCantidad =
      (inventarioActual?.cantidad || 0) + datos.bolsasResultantes;
    const nuevoInventario: Inventario = {
      saborId: datos.saborId,
      cantidad: nuevaCantidad,
      costoPromedioPonderado: nuevoCostoPromedio,
      updatedAt: Timestamp.now(),
    };

    // 6. Guardar lote e inventario
    await Promise.all([
      setDoc(doc(this.lotesCollection, id), nuevoLote),
      setDoc(doc(this.inventarioCollection, datos.saborId), nuevoInventario),
    ]);

    console.log(
      `📦 Lote registrado: ${datos.bolsasResultantes} bolsas @ $${costoUnitario}/u`
    );

    return nuevoLote;
  }

  /**
   * Descuenta unidades del inventario (usado por ventas)
   */
  async descontarInventario(
    saborId: string,
    cantidad: number = 1
  ): Promise<{
    success: boolean;
    costoUnitario: number;
    inventarioRestante: number;
  }> {
    const inventario = await this.getInventarioPorSabor(saborId);

    if (!inventario || inventario.cantidad < cantidad) {
      return {
        success: false,
        costoUnitario: 0,
        inventarioRestante: inventario?.cantidad || 0,
      };
    }

    const nuevaCantidad = inventario.cantidad - cantidad;

    await updateDoc(doc(this.inventarioCollection, saborId), {
      cantidad: nuevaCantidad,
      updatedAt: Timestamp.now(),
    });

    return {
      success: true,
      costoUnitario: inventario.costoPromedioPonderado,
      inventarioRestante: nuevaCantidad,
    };
  }

  /**
   * Obtiene todos los lotes ordenados por fecha
   */
  getLotes$(): Observable<LoteProduccion[]> {
    return collectionData(this.lotesCollection, { idField: 'id' }).pipe(
      map((lotes) =>
        (lotes as LoteProduccion[]).sort(
          (a, b) => b.fechaProduccion.toMillis() - a.fechaProduccion.toMillis()
        )
      )
    );
  }

  /**
   * Obtiene los lotes de un sabor específico
   */
  getLotesPorSabor$(saborId: string): Observable<LoteProduccion[]> {
    return this.getLotes$().pipe(
      map((lotes) => lotes.filter((l) => l.saborId === saborId))
    );
  }
}
