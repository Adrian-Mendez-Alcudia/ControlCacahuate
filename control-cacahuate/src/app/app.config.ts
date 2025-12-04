import { ApplicationConfig, isDevMode } from '@angular/core';
import { provideRouter } from '@angular/router';

import { routes } from './app.routes';
import { provideServiceWorker } from '@angular/service-worker';
import { initializeApp, provideFirebaseApp } from '@angular/fire/app';
import { getAuth, provideAuth } from '@angular/fire/auth';
import { getFirestore, provideFirestore } from '@angular/fire/firestore';

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
    provideServiceWorker('ngsw-worker.js', {
      enabled: !isDevMode(),
      registrationStrategy: 'registerWhenStable:30000',
    }),
    provideFirebaseApp(() => initializeApp(firebaseConfig)),
    provideAuth(() => getAuth()),
    provideFirestore(() => getFirestore()),
  ],
};
