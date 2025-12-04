import { Injectable, inject } from '@angular/core';
import {
  Firestore,
  collection,
  collectionData,
  doc,
  setDoc,
  updateDoc,
  deleteDoc,
  Timestamp,
} from '@angular/fire/firestore';
import { Observable, map } from 'rxjs';
import { Sabor } from '../models/interfaces';
import { generarId } from '../utils/calculos.utils';

@Injectable({
  providedIn: 'root',
})
export class SaboresService {
  private firestore = inject(Firestore);
  private saboresCollection = collection(this.firestore, 'sabores');

  /**
   * Obtiene todos los sabores activos en tiempo real
   */
  getSabores$(): Observable<Sabor[]> {
    return collectionData(this.saboresCollection, { idField: 'id' }).pipe(
      map((sabores) =>
        (sabores as Sabor[])
          .filter((s) => s.activo)
          .sort((a, b) => a.nombre.localeCompare(b.nombre))
      )
    );
  }

  /**
   * Obtiene TODOS los sabores (incluyendo inactivos)
   */
  getTodosSabores$(): Observable<Sabor[]> {
    return collectionData(this.saboresCollection, { idField: 'id' }).pipe(
      map((sabores) =>
        (sabores as Sabor[]).sort((a, b) => a.nombre.localeCompare(b.nombre))
      )
    );
  }

  /**
   * Crea un nuevo sabor
   */
  async crearSabor(datos: {
    nombre: string;
    emoji: string;
    color: string;
  }): Promise<Sabor> {
    const id = generarId();
    const nuevoSabor: Sabor = {
      id,
      nombre: datos.nombre.trim(),
      emoji: datos.emoji,
      color: datos.color,
      activo: true,
      createdAt: Timestamp.now(),
    };

    await setDoc(doc(this.saboresCollection, id), nuevoSabor);
    console.log(`🍬 Sabor creado: ${datos.nombre}`);
    return nuevoSabor;
  }

  /**
   * Actualiza un sabor existente
   */
  async actualizarSabor(
    id: string,
    datos: Partial<Pick<Sabor, 'nombre' | 'emoji' | 'color'>>
  ): Promise<void> {
    const datosLimpios: any = {};

    if (datos.nombre) datosLimpios.nombre = datos.nombre.trim();
    if (datos.emoji) datosLimpios.emoji = datos.emoji;
    if (datos.color) datosLimpios.color = datos.color;

    await updateDoc(doc(this.saboresCollection, id), datosLimpios);
    console.log(`✏️ Sabor actualizado: ${id}`);
  }

  /**
   * Desactiva un sabor (soft delete)
   */
  async desactivarSabor(id: string): Promise<void> {
    await updateDoc(doc(this.saboresCollection, id), { activo: false });
    console.log(`🗑️ Sabor desactivado: ${id}`);
  }

  /**
   * Reactiva un sabor
   */
  async reactivarSabor(id: string): Promise<void> {
    await updateDoc(doc(this.saboresCollection, id), { activo: true });
    console.log(`♻️ Sabor reactivado: ${id}`);
  }

  /**
   * Elimina un sabor permanentemente (usar con cuidado)
   */
  async eliminarSabor(id: string): Promise<void> {
    await deleteDoc(doc(this.saboresCollection, id));
    console.log(`❌ Sabor eliminado permanentemente: ${id}`);
  }
}
