# AsisCate

AsisCate es una aplicación web progresiva (PWA) para apoyar la organización de la catequesis. Centraliza la gestión de grupos, catequizandos, asistencia, pagos, inventario, matrículas y reportes en una interfaz adaptable a computadoras y dispositivos móviles.

## Funcionalidades

- Inicio de sesión con Firebase Authentication.
- Gestión de parroquias, diaconías, grupos, horarios y salones.
- Registro y consulta de asistencia de catequizandos y catequistas.
- Administración de usuarios, roles y acceso por ubicación.
- Herramientas de matrícula, pagos, inventario y reportes.
- Exportación e impresión de documentos.
- Instalación como PWA y carga de la interfaz desde la caché del navegador.

Las funciones visibles dependen del rol y de la ubicación asignada al usuario.

## Tecnologías

- React 19 y Vite.
- Firebase Authentication y Cloud Firestore.
- Tailwind CSS.
- `vite-plugin-pwa` para generar el service worker y el manifiesto de instalación.

## Requisitos

- Node.js compatible con la versión de Vite indicada en `package.json`.
- npm.
- Acceso a un proyecto de Firebase con Authentication y Cloud Firestore configurados.
- Firebase CLI para desplegar Hosting (`npm install --global firebase-tools`).

## Desarrollo local

```sh
npm install
npm run dev
```

Vite muestra la dirección local en la terminal. Para comprobar el proyecto antes de desplegar:

```sh
npm run lint
npm run build
```

También se puede ejecutar `npm run verify`, que corre ambos comandos.

## Configuración de Firebase

La aplicación cliente inicializa Firebase en [`src/config/firebase.js`](./src/config/firebase.js). Usa un proyecto de Firebase que controles y habilita los proveedores de autenticación y las reglas de Firestore que correspondan al despliegue. La configuración del cliente se distribuye en el navegador; no se deben incluir credenciales de cuentas de servicio ni otros secretos en el frontend.

La app también integra servicios externos indicados en `src/utils/constants.js`. Configura las claves según la documentación de cada proveedor y las restricciones recomendadas para aplicaciones web.

### Notificaciones push

Para habilitar los recordatorios:

1. En Firebase Console, configura Firebase Cloud Messaging y genera una clave de certificado Web Push (VAPID).
2. Copia `.env.example` a `.env.local` y agrega la clave pública:

   ```text
   VITE_FIREBASE_VAPID_KEY=tu_clave_publica_web_push
   ```

3. En GitHub, agrega un secreto de Actions llamado `FIREBASE_SERVICE_ACCOUNT` con el JSON de una cuenta de servicio de Firebase Admin SDK. La cuenta requiere acceso a Firestore y permiso para enviar mensajes de FCM. Mantén la llave privada solo en GitHub Secrets; nunca la subas al repositorio.
4. Confirma que GitHub Actions esté habilitado y que `.github/workflows/attendance-reminders.yml` esté en la rama predeterminada del repositorio; GitHub solo ejecuta cron desde esa rama.
5. Despliega Hosting:

   ```sh
   firebase deploy --only hosting
   ```

El workflow `.github/workflows/attendance-reminders.yml` se ejecuta cada cinco minutos en GitHub Actions, sin Cloud Functions ni necesidad de actualizar Firebase a Blaze. Primero consulta la pausa global y las opciones de horario activas para el día local en `America/Costa_Rica`; si no hay un horario próximo, no consulta los grupos. Si lo hay, solo obtiene grupos de ese día y confirma que la diaconía, el día y la hora sigan habilitados en mantenimiento. Los avisos pueden enviarse durante los primeros diez minutos desde el inicio del horario para tolerar el intervalo y retrasos del runner; GitHub no garantiza que el workflow inicie a una hora exacta y puede demorar u omitir una ejecución.

La preferencia de recordatorios queda activada por defecto en los perfiles nuevos y, una sola vez, en los perfiles existentes cuando vuelvan a iniciar sesión. Cada persona puede pausarla desde su perfil. Este valor no concede el permiso del navegador ni registra automáticamente un dispositivo: cada catequista debe instalar la PWA y configurar los avisos desde ese dispositivo. Solo se notifican catequistas asignados con permiso concedido y un token registrado desde la app instalada; los tokens registrados desde un navegador normal no se usan. El control global está en Mantenimiento de usuarios y pausa la entrega sin cambiar las preferencias individuales. Si el navegador o sistema operativo no admite Web Push, el backend no puede forzar la entrega; en iPhone/iPad se requiere iOS 16.4 o posterior y usar la PWA instalada.

## PWA y funcionamiento sin conexión

Vite genera la versión de producción en `dist/`; el service worker cachea la interfaz y recibe notificaciones push. La app habilita la caché persistente de Firestore en IndexedDB y muestra cuándo hay cambios de asistencia pendientes de sincronización.

El registro de asistencia puede guardarse localmente y sincronizarse al recuperar conexión. Una operación pendiente no equivale a una operación confirmada por el servidor. Si varios catequistas editan el mismo registro simultáneamente sin conexión, Firestore resuelve los cambios de documento con el último guardado; conviene evitar ediciones simultáneas offline y revisar la lista al reconectar.

La caché persistente puede conservar datos descargados en el perfil del navegador incluso después de cerrar sesión. Para proteger la información de catequizandos, usa dispositivos personales o de confianza y cierra sesión al terminar. No se recomienda usar la app offline en equipos públicos o compartidos.

## Despliegue

El proyecto está enlazado al proyecto Firebase definido en `.firebaserc`. Para publicar la aplicación web:

```sh
firebase login
npm run build
firebase deploy --only hosting
```

Verifica las reglas de Firestore, los proveedores de Authentication y el dominio autorizado antes de habilitar el acceso de usuarios.

## Estructura del proyecto

```text
src/
  components/   Componentes compartidos, modales y vistas
  config/       Inicialización de Firebase
  hooks/        Estado de autenticación, datos y vistas derivadas
  services/     Acceso a datos, exportación e integración de servicios
  utils/        Constantes, validaciones y utilidades
public/         Recursos estáticos de la PWA
```

Las vistas principales se cargan de forma diferida desde `src/App.jsx`.

## Recordatorios de asistencia

Los recordatorios en segundo plano solo se registran desde la PWA instalada y requieren Firebase Cloud Messaging, la clave VAPID pública y el workflow de GitHub Actions configurado. La preferencia de cada persona y la pausa global son controles independientes; pausar globalmente no cambia las preferencias individuales.
