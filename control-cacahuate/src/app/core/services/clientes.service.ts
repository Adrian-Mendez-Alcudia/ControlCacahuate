import { Injectable, inject } from '@angular/core';
import {
  Firestore,
  collection,
  collectionData,
  doc,
  getDoc,
  setDoc,
  updateDoc,
  deleteDoc,
  Timestamp,
} from '@angular/fire/firestore';
import { Observable, map } from 'rxjs';
import { Cliente, Abono } from '../models/interfaces';
import {
  generarId,
  estaFechaVencida,
  calcularDiasVencimiento,
} from '../utils/calculos.utils';

export interface DeudorInfo extends Cliente {
  diasVencido: number | null;
  estaVencido: boolean;
}

@Injectable({
  providedIn: 'root',
})
export class ClientesService {
  private firestore = inject(Firestore);
  private clientesCollection = collection(this.firestore, 'clientes');
  private abonosCollection = collection(this.firestore, 'abonos');

  /**
   * Obtiene todos los clientes en tiempo real
   */
  getClientes$(): Observable<Cliente[]> {
    return collectionData(this.clientesCollection, { idField: 'id' }).pipe(
      map((clientes) =>
        (clientes as Cliente[]).sort((a, b) => a.alias.localeCompare(b.alias))
      )
    );
  }

  /**
   * Obtiene solo los clientes con deuda pendiente
   */
  getDeudores$(): Observable<DeudorInfo[]> {
    return this.getClientes$().pipe(
      map((clientes) =>
        clientes
          .filter((c) => c.saldoPendiente > 0)
          .map((c) => ({
            ...c,
            estaVencido: estaFechaVencida(c.fechaPromesaPago?.toDate()),
            diasVencido: calcularDiasVencimiento(c.fechaPromesaPago?.toDate()),
          }))
          .sort((a, b) => {
            // Primero los vencidos
            if (a.estaVencido && !b.estaVencido) return -1;
            if (!a.estaVencido && b.estaVencido) return 1;
            // Luego por monto de deuda
            return b.saldoPendiente - a.saldoPendiente;
          })
      )
    );
  }

  /**
   * Obtiene un cliente por ID
   */
  async getClientePorId(clienteId: string): Promise<Cliente | null> {
    const docRef = doc(this.clientesCollection, clienteId);
    const snapshot = await getDoc(docRef);

    if (!snapshot.exists()) {
      return null;
    }

    return { id: clienteId, ...snapshot.data() } as Cliente;
  }

  /**
   * Crea un nuevo cliente
   */
  async crearCliente(datos: {
    alias: string;
    telefono?: string;
    notas?: string;
  }): Promise<Cliente> {
    const id = generarId();
    const nuevoCliente: Cliente = {
      id,
      alias: datos.alias.trim(),
      telefono: datos.telefono?.trim(),
      notas: datos.notas?.trim(),
      saldoPendiente: 0,
      createdAt: Timestamp.now(),
    };

    await setDoc(doc(this.clientesCollection, id), nuevoCliente);
    console.log(`👤 Cliente creado: ${datos.alias}`);

    return nuevoCliente;
  }

  /**
   * Actualiza un cliente
   */
  async actualizarCliente(
    id: string,
    datos: Partial<Pick<Cliente, 'alias' | 'telefono' | 'notas'>>
  ): Promise<void> {
    const actualizacion: any = {};

    if (datos.alias) actualizacion.alias = datos.alias.trim();
    if (datos.telefono !== undefined)
      actualizacion.telefono = datos.telefono?.trim() || null;
    if (datos.notas !== undefined)
      actualizacion.notas = datos.notas?.trim() || null;

    await updateDoc(doc(this.clientesCollection, id), actualizacion);
    console.log(`✏️ Cliente actualizado: ${id}`);
  }

  /**
   * Elimina un cliente (solo si no tiene deuda)
   */
  async eliminarCliente(
    id: string
  ): Promise<{ success: boolean; error?: string }> {
    const cliente = await this.getClientePorId(id);

    if (!cliente) {
      return { success: false, error: 'Cliente no encontrado' };
    }

    if (cliente.saldoPendiente > 0) {
      return {
        success: false,
        error: 'No se puede eliminar un cliente con deuda pendiente',
      };
    }

    await deleteDoc(doc(this.clientesCollection, id));
    console.log(`🗑️ Cliente eliminado: ${id}`);

    return { success: true };
  }

  /**
   * Agrega deuda a un cliente (llamado por ventas fiadas)
   */
  async agregarDeuda(clienteId: string, monto: number): Promise<void> {
    const cliente = await this.getClientePorId(clienteId);

    if (!cliente) {
      throw new Error(`Cliente ${clienteId} no encontrado`);
    }

    const nuevoSaldo = Math.round((cliente.saldoPendiente + monto) * 100) / 100;

    await updateDoc(doc(this.clientesCollection, clienteId), {
      saldoPendiente: nuevoSaldo,
    });

    console.log(`📝 Deuda agregada: +$${monto} (Total: $${nuevoSaldo})`);
  }

  /**
   * Registra un abono y reduce la deuda
   */
  async registrarAbono(datos: {
    clienteId: string;
    monto: number;
    notas?: string;
  }): Promise<Abono> {
    const cliente = await this.getClientePorId(datos.clienteId);

    if (!cliente) {
      throw new Error('Cliente no encontrado');
    }

    if (datos.monto <= 0) {
      throw new Error('El monto debe ser mayor a 0');
    }

    if (datos.monto > cliente.saldoPendiente) {
      throw new Error(
        `El abono ($${datos.monto}) excede la deuda ($${cliente.saldoPendiente})`
      );
    }

    // Crear registro de abono
    const id = generarId();
    const abono: Abono = {
      id,
      clienteId: datos.clienteId,
      monto: datos.monto,
      fecha: Timestamp.now(),
      notas: datos.notas?.trim(),
    };

    // Calcular nuevo saldo
    const nuevoSaldo =
      Math.round((cliente.saldoPendiente - datos.monto) * 100) / 100;

    // Guardar abono y actualizar cliente
    await Promise.all([
      setDoc(doc(this.abonosCollection, id), abono),
      updateDoc(doc(this.clientesCollection, datos.clienteId), {
        saldoPendiente: nuevoSaldo,
      }),
    ]);

    console.log(`💵 Abono registrado: $${datos.monto} (Saldo: $${nuevoSaldo})`);

    return abono;
  }

  /**
   * Actualiza la fecha promesa de pago
   */
  async actualizarFechaPromesa(
    clienteId: string,
    fecha: Date | null
  ): Promise<void> {
    await updateDoc(doc(this.clientesCollection, clienteId), {
      fechaPromesaPago: fecha ? Timestamp.fromDate(fecha) : null,
    });
  }

  /**
   * Obtiene el historial de abonos de un cliente
   */
  getAbonosCliente$(clienteId: string): Observable<Abono[]> {
    return collectionData(this.abonosCollection, { idField: 'id' }).pipe(
      map((abonos) =>
        (abonos as Abono[])
          .filter((a) => a.clienteId === clienteId)
          .sort((a, b) => b.fecha.toMillis() - a.fecha.toMillis())
      )
    );
  }

  /**
   * Calcula el total de dinero en la calle
   */
  getDineroEnCalle$(): Observable<number> {
    return this.getClientes$().pipe(
      map((clientes) =>
        clientes.reduce((total, c) => total + c.saldoPendiente, 0)
      )
    );
  }
}
