import { Injectable, inject } from '@angular/core';
import {
  Firestore,
  collection,
  addDoc,
  query,
  orderBy,
  limit,
  getDocs,
  Timestamp,
  where,
} from '@angular/fire/firestore';
import { VentasService } from './ventas.service';
import { CajaDiaria } from '../models/interfaces';

export interface CorteDeCaja {
  id?: string;
  fecha: Timestamp;
  ventasEfectivo: number;
  abonosEfectivo: number;
  totalSistema: number; // Lo que el sistema dice que debe haber
  dineroReal: number; // Lo que tú contaste
  diferencia: number; // Sobrante o Faltante
  notas?: string;
  usuario?: string; // Por si luego tienes empleados
}

@Injectable({
  providedIn: 'root',
})
export class CorteCajaService {
  private firestore = inject(Firestore);
  private ventasService = inject(VentasService);
  private cortesCollection = collection(this.firestore, 'cortes_caja');

  /**
   * Obtiene los datos actuales del día para pre-llenar el corte
   */
  async obtenerResumenDelDia(): Promise<CajaDiaria | null> {
    // Reutilizamos la lógica que ya tienes en VentasService para obtener la caja del día
    // Nota: Como VentasService usa observables, aquí hacemos una promesa rápida
    // Idealmente VentasService debería exponer un método asíncrono o snapshot
    // Por simplicidad, asumimos que obtienes los datos frescos

    // Una forma de hacerlo sin modificar VentasService es consultar directo
    // Pero mejor creamos un método 'snapshot' en VentasService luego.
    // Por ahora, simularemos obteniendo la caja del día actual
    const hoy = new Date().toISOString().split('T')[0];
    const q = query(
      collection(this.firestore, 'cajas_diarias'),
      where('fecha', '==', hoy),
      limit(1)
    );

    const snapshot = await getDocs(q);
    if (snapshot.empty) return null;

    return snapshot.docs[0].data() as CajaDiaria;
  }

  /**
   * Guarda el corte de caja en Firebase
   */
  async guardarCorte(
    corte: Omit<CorteDeCaja, 'id' | 'fecha'>
  ): Promise<string> {
    const nuevoCorte = {
      ...corte,
      fecha: Timestamp.now(),
    };

    const docRef = await addDoc(this.cortesCollection, nuevoCorte);
    console.log('✅ Corte de caja guardado:', docRef.id);
    return docRef.id;
  }

  /**
   * Obtiene los últimos cortes para el historial
   */
  async obtenerHistorialCortes(limite = 7): Promise<CorteDeCaja[]> {
    const q = query(
      this.cortesCollection,
      orderBy('fecha', 'desc'),
      limit(limite)
    );
    const snapshot = await getDocs(q);

    return snapshot.docs.map(
      (doc) =>
        ({
          id: doc.id,
          ...doc.data(),
        } as CorteDeCaja)
    );
  }
}
