import { Injectable, inject } from '@angular/core';
import {
  Firestore,
  collection,
  doc,
  setDoc,
  updateDoc,
  Timestamp,
  getDoc,
} from '@angular/fire/firestore';
import { CorteDeCaja, CajaDiaria } from '../models/interfaces';
import { obtenerFechaHoy, generarId } from '../utils/calculos.utils';

@Injectable({
  providedIn: 'root',
})
export class CorteCajaService {
  private firestore = inject(Firestore);

  private cortesCollection = collection(this.firestore, 'cortes');
  private cajaCollection = collection(this.firestore, 'cajaDiaria');

  /**
   * Realiza el proceso de corte de caja:
   * 1. Guarda el registro en la colección 'cortes' (histórico).
   * 2. Actualiza el documento de 'cajaDiaria' del día para marcarlo como cerrado.
   */
  async realizarCorte(datos: {
    esperado: number;
    contado: number;
    retirado: number;
    notas?: string;
  }): Promise<void> {
    const fechaHoy = obtenerFechaHoy();
    const diferencia = datos.contado - datos.esperado;
    const fondoManana = datos.contado - datos.retirado;
    const idCorte = generarId();

    const corte: CorteDeCaja = {
      id: idCorte,
      fecha: Timestamp.now(),
      fechaDia: fechaHoy,
      esperadoEnCaja: datos.esperado,
      contadoEnCaja: datos.contado,
      diferencia: diferencia,
      montoRetirado: datos.retirado,
      fondoCajaManana: fondoManana,
      notas: datos.notas || '',
    };

    // Referencia al día actual en caja
    const cajaDiaRef = doc(this.cajaCollection, fechaHoy);

    // Verificamos si existe el día antes de cerrar (por seguridad)
    const cajaSnap = await getDoc(cajaDiaRef);
    if (!cajaSnap.exists()) {
      // Si no existe (ej. no hubo ventas), creamos el día vacío para poder cerrarlo
      await setDoc(cajaDiaRef, {
        fecha: fechaHoy,
        efectivoVentas: 0,
        efectivoAbonos: 0,
        totalEfectivo: 0,
        ventasFiado: 0,
        costoVendido: 0,
        corteRealizado: true,
        datosCorte: corte,
      });
    } else {
      // Actualizamos marcando como cerrado
      await updateDoc(cajaDiaRef, {
        corteRealizado: true,
        datosCorte: corte,
      });
    }

    // Guardar en histórico de cortes
    await setDoc(doc(this.cortesCollection, idCorte), corte);

    console.log('✅ Corte realizado con éxito');
  }

  /**
   * Verifica si el día actual ya tiene corte
   */
  async verificarSiHayCorteHoy(): Promise<boolean> {
    const fechaHoy = obtenerFechaHoy();
    const cajaRef = doc(this.cajaCollection, fechaHoy);
    const snap = await getDoc(cajaRef);

    if (snap.exists()) {
      const data = snap.data() as CajaDiaria;
      return !!data.corteRealizado;
    }
    return false;
  }
}
