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
  query,
  where,
  getDocs,
} from '@angular/fire/firestore';
import { Observable, map } from 'rxjs';
import { Cliente, Abono, Venta, MovimientoCuenta } from '../models/interfaces';
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
  private ventasCollection = collection(this.firestore, 'ventas'); // Referencia necesaria

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
      saldoPendiente: 0,
      createdAt: Timestamp.now(),
    };

    if (datos.telefono?.trim()) {
      nuevoCliente.telefono = datos.telefono.trim();
    }

    if (datos.notas?.trim()) {
      nuevoCliente.notas = datos.notas.trim();
    }

    await setDoc(doc(this.clientesCollection, id), nuevoCliente);
    console.log(`✅ Cliente creado: ${datos.alias}`);

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
    console.log(`🔄 Cliente actualizado: ${id}`);
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

    console.log(`💸 Deuda agregada: +$${monto} (Total: $${nuevoSaldo})`);
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

    const id = generarId();

    const abono: Abono = {
      id,
      clienteId: datos.clienteId,
      monto: datos.monto,
      fecha: Timestamp.now(),
    };

    if (datos.notas?.trim()) {
      abono.notas = datos.notas.trim();
    }

    const nuevoSaldo =
      Math.round((cliente.saldoPendiente - datos.monto) * 100) / 100;

    await Promise.all([
      setDoc(doc(this.abonosCollection, id), abono),
      updateDoc(doc(this.clientesCollection, datos.clienteId), {
        saldoPendiente: nuevoSaldo,
      }),
    ]);

    console.log(`💰 Abono registrado: $${datos.monto} (Saldo: $${nuevoSaldo})`);

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
   * Obtiene el historial de abonos de un cliente (Observable)
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

  // ==========================================
  // NUEVO: HISTORIAL / ESTADO DE CUENTA
  // ==========================================

  /**
   * Genera el estado de cuenta unificado (Ventas Fiadas + Abonos)
   */
  async getHistorialCompleto(clienteId: string): Promise<MovimientoCuenta[]> {
    // 1. Traer Abonos
    const abonosQuery = query(
      this.abonosCollection,
      where('clienteId', '==', clienteId)
    );
    const abonosSnap = await getDocs(abonosQuery);
    const abonos = abonosSnap.docs.map(
      (d) => ({ id: d.id, ...d.data() } as Abono)
    );

    // 2. Traer Ventas (Solo Fiado)
    const ventasQuery = query(
      this.ventasCollection,
      where('clienteId', '==', clienteId),
      where('tipoPago', '==', 'fiado')
    );
    const ventasSnap = await getDocs(ventasQuery);
    const ventas = ventasSnap.docs.map(
      (d) => ({ id: d.id, ...d.data() } as Venta)
    );

    // 3. Unificar en estructura común
    let movimientos: MovimientoCuenta[] = [];

    // Mapear Abonos
    abonos.forEach((a) => {
      movimientos.push({
        id: a.id,
        fecha: a.fecha,
        tipo: 'ABONO',
        descripcion: a.notas || 'Abono a cuenta',
        monto: a.monto,
        saldoAcumulado: 0, // Se calcula después
      });
    });

    // Mapear Ventas (Cargos)
    ventas.forEach((v) => {
      // Intentamos obtener el nombre del sabor si existe en snapshot, si no, genérico
      const desc = v.nombreSaborSnapshot
        ? `Venta: ${v.cantidad}x ${v.nombreSaborSnapshot}`
        : `Venta Fiado (x${v.cantidad})`;

      movimientos.push({
        id: v.id,
        fecha: v.fecha,
        tipo: 'CARGO',
        descripcion: desc,
        monto: v.precioUnitario * v.cantidad, // Total de la línea
        saldoAcumulado: 0,
      });
    });

    // 4. Ordenar Cronológicamente (Más antiguo primero para calcular saldo)
    movimientos.sort((a, b) => a.fecha.toMillis() - b.fecha.toMillis());

    // 5. Calcular Saldo Acumulado (Running Balance)
    let saldoActual = 0;
    movimientos = movimientos.map((m) => {
      if (m.tipo === 'CARGO') {
        saldoActual += m.monto;
      } else {
        saldoActual -= m.monto;
      }
      // Redondeo para evitar errores de punto flotante
      saldoActual = Math.round(saldoActual * 100) / 100;
      return { ...m, saldoAcumulado: saldoActual };
    });

    // 6. Retornar invertido (Más reciente arriba) para la vista
    return movimientos.reverse();
  }
}
