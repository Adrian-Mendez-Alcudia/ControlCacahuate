import {
  ApplicationConfig,
  isDevMode,
  ErrorHandler,
  importProvidersFrom,
} from '@angular/core';
import { provideRouter } from '@angular/router';
import { provideAnimations } from '@angular/platform-browser/animations';
import { provideServiceWorker } from '@angular/service-worker';
import { initializeApp, provideFirebaseApp } from '@angular/fire/app';
import { getAuth, provideAuth } from '@angular/fire/auth';
import { getFirestore, provideFirestore } from '@angular/fire/firestore';
import { ReactiveFormsModule } from '@angular/forms';

import { routes } from './app.routes';
import { GlobalErrorHandler } from './core/handlers/global-error-handler';

// Configuración directa para evitar errores de importación con environment por ahora
const firebaseConfig = {
  projectId: 'control-cacahuate-app',
  appId: '1:769659970104:web:3ff6436840404a2f6e7ccd',
  storageBucket: 'control-cacahuate-app.firebasestorage.app',
  apiKey: 'AIzaSyCAwZfYJrpa-IK6wuS-XOmloYMYgN36AdU',
  authDomain: 'control-cacahuate-app.firebaseapp.com',
  messagingSenderId: '769659970104',
};

export const appConfig: ApplicationConfig = {
  providers: [
    provideRouter(routes),
    provideAnimations(),

    // Importamos ReactiveFormsModule (Módulos legacy sí van aquí)
    importProvidersFrom(ReactiveFormsModule),

    provideServiceWorker('ngsw-worker.js', {
      enabled: !isDevMode(),
      registrationStrategy: 'registerWhenStable:30000',
    }),

    // CORRECCIÓN: Los providers de Firebase modernos van directos, SIN importProvidersFrom
    provideFirebaseApp(() => initializeApp(firebaseConfig)),
    provideAuth(() => getAuth()),
    provideFirestore(() => getFirestore()),

    // Manejador de errores
    { provide: ErrorHandler, useClass: GlobalErrorHandler },
  ],
};
